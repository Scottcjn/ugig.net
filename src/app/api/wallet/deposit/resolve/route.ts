import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

const LNBITS_URL = process.env.LNBITS_URL || "https://ln.coinpayportal.com";
const LNBITS_INVOICE_KEY = process.env.LNBITS_INVOICE_KEY || "";
const LNBITS_ADMIN_KEY = process.env.LNBITS_ADMIN_KEY || "";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createServiceClient();
    const userId = auth.user.id;

    // 1. Fix existing pending transactions
    const { data: pending } = await admin.from("wallet_transactions" as any)
      .select("id, bolt11, payment_hash, amount_sats")
      .eq("user_id", userId)
      .eq("type", "deposit")
      .eq("status", "pending") as any;

    let totalCredited = 0;

    for (const tx of (pending || [])) {
      let paid = false;
      let amount_sats = tx.amount_sats;
      let hash = tx.payment_hash;

      // Decode bolt11 to get payment_hash if missing
      if (!hash && tx.bolt11) {
        const decRes = await fetch(`${LNBITS_URL}/api/v1/payments/decode`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Api-Key": LNBITS_INVOICE_KEY },
          body: JSON.stringify({ data: tx.bolt11 }),
        });
        if (decRes.ok) {
          const decoded = await decRes.json();
          hash = decoded.payment_hash;
        }
      }

      if (hash) {
        const res = await fetch(`${LNBITS_URL}/api/v1/payments/${hash}`, {
          headers: { "X-Api-Key": LNBITS_INVOICE_KEY },
        });
        if (res.ok) {
          const data = await res.json();
          paid = !!data.paid || data.details?.status === "success";
          if (paid) amount_sats = Math.abs((data.amount ?? data.details?.amount ?? 0) / 1000);
        }
      }

      if (paid) {
        totalCredited += amount_sats;
        await admin.from("wallet_transactions" as any)
          .update({ status: "completed", payment_hash: hash })
          .eq("id", tx.id);
      }
    }

    // 2. Check LNbits for recent paid invoices not in DB
    const lnRes = await fetch(`${LNBITS_URL}/api/v1/payments?limit=20`, {
      headers: { "X-Api-Key": LNBITS_INVOICE_KEY },
    });
    if (lnRes.ok) {
      const payments = await lnRes.json();
      for (const p of payments) {
        // Only incoming payments (positive amount) with ugig memo
        if (p.amount <= 0 || !p.memo?.includes("ugig.net deposit")) continue;
        if (p.status !== "success") continue;

        const hash = p.payment_hash || p.checking_id;
        if (!hash) continue;

        // Check if we already have this transaction
        const { data: exists } = await admin.from("wallet_transactions" as any)
          .select("id")
          .eq("user_id", userId)
          .eq("payment_hash", hash)
          .single() as any;

        // Also check by bolt11
        const bolt11 = p.bolt11 || p.payment_request || "";
        let existsByBolt11 = null;
        if (!exists && bolt11) {
          const { data: b } = await admin.from("wallet_transactions" as any)
            .select("id, status")
            .eq("user_id", userId)
            .eq("bolt11", bolt11)
            .single() as any;
          existsByBolt11 = b;
        }

        if (!exists && !existsByBolt11) {
          // Missing from DB — create it as completed
          const sats = Math.abs(p.amount / 1000);
          totalCredited += sats;
          await admin.from("wallet_transactions" as any).insert({
            user_id: userId,
            type: "deposit",
            amount_sats: sats,
            balance_after: 0,
            bolt11,
            payment_hash: hash,
            status: "completed",
          });
        } else if (existsByBolt11 && existsByBolt11.status === "pending") {
          // Found by bolt11 but still pending — mark complete
          const sats = Math.abs(p.amount / 1000);
          totalCredited += sats;
          await admin.from("wallet_transactions" as any)
            .update({ status: "completed", payment_hash: hash })
            .eq("id", existsByBolt11.id);
        }
      }
    }

    // 3. Check pay link (Lightning Address) payments on the main platform wallet
    if (LNBITS_ADMIN_KEY) {
      // Get user's username for matching pay link payments
      const { data: profile } = await admin.from("profiles" as any)
        .select("username")
        .eq("id", userId)
        .single() as any;

      if (profile?.username) {
        const payLinkRes = await fetch(`${LNBITS_URL}/api/v1/payments?limit=30`, {
          headers: { "X-Api-Key": LNBITS_ADMIN_KEY },
        });
        if (payLinkRes.ok) {
          const payments = await payLinkRes.json();
          for (const p of payments) {
            // Only incoming payments for this user's Lightning Address
            if (p.amount <= 0) continue;
            if (p.status !== "success" && !p.paid) continue;
            const memo = p.memo || "";
            if (!memo.includes(`Lightning Address for ${profile.username}`)) continue;

            const hash = p.payment_hash || p.checking_id;
            if (!hash) continue;

            // Check if already credited
            const { data: exists } = await admin.from("wallet_transactions" as any)
              .select("id")
              .eq("payment_hash", hash)
              .single() as any;

            if (!exists) {
              const sats = Math.abs(p.amount / 1000);
              totalCredited += sats;
              await admin.from("wallet_transactions" as any).insert({
                user_id: userId,
                type: "deposit",
                amount_sats: sats,
                balance_after: 0,
                payment_hash: hash,
                status: "completed",
              });
            }
          }
        }
      }
    }

    if (totalCredited > 0) {
      const { data: wallet } = await admin.from("wallets" as any)
        .select("balance_sats")
        .eq("user_id", userId)
        .single() as any;
      const newBalance = (wallet?.balance_sats ?? 0) + totalCredited;
      await admin.from("wallets" as any)
        .update({ balance_sats: newBalance, updated_at: new Date().toISOString() })
        .eq("user_id", userId);

      return NextResponse.json({ resolved: true, credited_sats: totalCredited, balance_sats: newBalance });
    }

    return NextResponse.json({ resolved: false, message: "No paid invoices found to resolve" });
  } catch (err) {
    console.error("Deposit resolve error:", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
