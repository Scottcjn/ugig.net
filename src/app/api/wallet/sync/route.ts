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

    // Get recent incoming payments from LNbits
    const lnRes = await fetch(`${LNBITS_URL}/api/v1/payments?limit=20`, {
      headers: { "X-Api-Key": LNBITS_INVOICE_KEY },
    });
    if (!lnRes.ok) return NextResponse.json({ error: "Failed to fetch LNbits payments" }, { status: 502 });

    const payments = await lnRes.json();
    const deposits = payments.filter((p: any) => p.amount > 0 && (p.status === "success" || p.paid) && p.memo === "ugig.net deposit");

    let synced = 0;
    let totalSats = 0;

    for (const p of deposits) {
      const hash = p.payment_hash || p.checking_id;
      const bolt11 = p.bolt11 || p.payment_request || "";
      const amount_sats = Math.abs(p.amount / 1000);

      // Check if already tracked by payment_hash
      const { data: byHash } = await admin.from("wallet_transactions" as any)
        .select("id").eq("user_id", userId).eq("payment_hash", hash).single() as any;
      if (byHash) continue;

      // Check by bolt11
      if (bolt11) {
        const { data: byBolt } = await admin.from("wallet_transactions" as any)
          .select("id, status").eq("user_id", userId).eq("bolt11", bolt11).single() as any;
        if (byBolt) {
          if (byBolt.status === "pending") {
            await admin.from("wallet_transactions" as any)
              .update({ status: "completed", payment_hash: hash }).eq("id", byBolt.id);
            synced++;
            totalSats += amount_sats;
          }
          continue;
        }
      }

      // Insert missing transaction
      await admin.from("wallet_transactions" as any).insert({
        user_id: userId, type: "deposit", amount_sats,
        balance_after: 0, bolt11, payment_hash: hash, status: "completed",
      });
      synced++;
      totalSats += amount_sats;
    }

    if (totalSats > 0) {
      const { data: wallet } = await admin.from("wallets" as any)
        .select("balance_sats").eq("user_id", userId).single() as any;
      const newBalance = (wallet?.balance_sats ?? 0) + totalSats;
      await admin.from("wallets" as any)
        .update({ balance_sats: newBalance, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      return NextResponse.json({ synced, credited_sats: totalSats, balance_sats: newBalance });
    }

    return NextResponse.json({ synced: 0, message: "All payments already tracked" });
  } catch (err) {
    console.error("Wallet sync error:", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
