import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

const LNBITS_URL = process.env.LNBITS_URL || "https://ln.coinpayportal.com";
const LNBITS_INVOICE_KEY = process.env.LNBITS_INVOICE_KEY || "";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payment_hash = new URL(request.url).searchParams.get("payment_hash");
    if (!payment_hash) {
      return NextResponse.json({ error: "payment_hash required" }, { status: 400 });
    }

    const lnRes = await fetch(`${LNBITS_URL}/api/v1/payments/${payment_hash}`, {
      headers: { "X-Api-Key": LNBITS_INVOICE_KEY },
    });
    if (!lnRes.ok) return NextResponse.json({ paid: false });

    const lnData = await lnRes.json();
    if (!lnData.paid) return NextResponse.json({ paid: false });

    const admin = createServiceClient();
    const userId = auth.user.id;
    const bolt11 = lnData.details?.bolt11 || lnData.bolt11 || "";
    const amount_sats = Math.abs(lnData.amount / 1000);

    // Idempotency check
    const { data: existing } = await admin.from("wallet_transactions" as any).select("id").eq("user_id", userId).eq("type", "deposit").eq("status", "completed").eq("bolt11", bolt11).single() as any;
    if (existing) {
      const { data: w } = await admin.from("wallets" as any).select("balance_sats").eq("user_id", userId).single() as any;
      return NextResponse.json({ paid: true, balance_sats: w?.balance_sats ?? 0 });
    }

    // Credit wallet
    const { data: wallet } = await admin.from("wallets" as any).select("id, balance_sats").eq("user_id", userId).single() as any;
    const newBalance = (wallet?.balance_sats ?? 0) + amount_sats;

    if (wallet) {
      await admin.from("wallets" as any).update({ balance_sats: newBalance, updated_at: new Date().toISOString() }).eq("user_id", userId);
    } else {
      await admin.from("wallets" as any).insert({ user_id: userId, balance_sats: newBalance });
    }

    await admin.from("wallet_transactions" as any).update({ status: "completed", balance_after: newBalance }).eq("user_id", userId).eq("type", "deposit").eq("status", "pending").eq("bolt11", bolt11);

    return NextResponse.json({ paid: true, balance_sats: newBalance });
  } catch (err) {
    console.error("Deposit check error:", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
