import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

const LNBITS_URL = process.env.LNBITS_URL || "https://ln.coinpayportal.com";
const LNBITS_INVOICE_KEY = process.env.LNBITS_INVOICE_KEY || "";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createServiceClient();
    const userId = auth.user.id;

    // Get all pending deposits
    const { data: pending } = await admin.from("wallet_transactions" as any)
      .select("id, bolt11, payment_hash, amount_sats")
      .eq("user_id", userId)
      .eq("type", "deposit")
      .eq("status", "pending") as any;

    if (!pending?.length) return NextResponse.json({ resolved: false, message: "No pending deposits" });

    let totalCredited = 0;

    for (const tx of pending) {
      // Try to check via payment_hash if we have it
      let paid = false;
      let amount_sats = tx.amount_sats;

      if (tx.payment_hash) {
        const res = await fetch(`${LNBITS_URL}/api/v1/payments/${tx.payment_hash}`, {
          headers: { "X-Api-Key": LNBITS_INVOICE_KEY },
        });
        if (res.ok) {
          const data = await res.json();
          paid = !!data.paid;
          if (paid) amount_sats = Math.abs(data.amount / 1000);
        }
      }

      // If no payment_hash, try checking by decoding the bolt11
      if (!paid && tx.bolt11) {
        const res = await fetch(`${LNBITS_URL}/api/v1/payments/decode`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Api-Key": LNBITS_INVOICE_KEY },
          body: JSON.stringify({ data: tx.bolt11 }),
        });
        if (res.ok) {
          const decoded = await res.json();
          if (decoded.payment_hash) {
            const checkRes = await fetch(`${LNBITS_URL}/api/v1/payments/${decoded.payment_hash}`, {
              headers: { "X-Api-Key": LNBITS_INVOICE_KEY },
            });
            if (checkRes.ok) {
              const checkData = await checkRes.json();
              paid = !!checkData.paid;
              if (paid) amount_sats = Math.abs(checkData.amount / 1000);
              // Store payment_hash for future
              await admin.from("wallet_transactions" as any).update({ payment_hash: decoded.payment_hash }).eq("id", tx.id);
            }
          }
        }
      }

      if (paid) {
        totalCredited += amount_sats;
        await admin.from("wallet_transactions" as any)
          .update({ status: "completed" })
          .eq("id", tx.id);
      }
    }

    if (totalCredited > 0) {
      const { data: wallet } = await admin.from("wallets" as any).select("balance_sats").eq("user_id", userId).single() as any;
      const newBalance = (wallet?.balance_sats ?? 0) + totalCredited;
      await admin.from("wallets" as any).update({ balance_sats: newBalance, updated_at: new Date().toISOString() }).eq("user_id", userId);

      // Update balance_after on resolved txns
      await admin.from("wallet_transactions" as any)
        .update({ balance_after: newBalance })
        .eq("user_id", userId)
        .eq("type", "deposit")
        .eq("status", "completed")
        .eq("balance_after", 0);

      return NextResponse.json({ resolved: true, credited_sats: totalCredited, balance_sats: newBalance });
    }

    return NextResponse.json({ resolved: false, message: "No paid invoices found" });
  } catch (err) {
    console.error("Deposit resolve error:", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
