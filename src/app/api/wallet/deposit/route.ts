import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

const LNBITS_URL = process.env.LNBITS_URL || "https://ln.coinpayportal.com";
const LNBITS_INVOICE_KEY = process.env.LNBITS_INVOICE_KEY || "";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { amount_sats } = await request.json();
    if (!amount_sats || amount_sats <= 0 || amount_sats > 1000000) {
      return NextResponse.json({ error: "Invalid amount (1-1,000,000 sats)" }, { status: 400 });
    }

    // Create invoice via LNbits
    const lnRes = await fetch(`${LNBITS_URL}/api/v1/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": LNBITS_INVOICE_KEY },
      body: JSON.stringify({ out: false, amount: amount_sats, memo: "ugig.net deposit" }),
    });

    if (!lnRes.ok) {
      console.error("LNbits invoice error:", await lnRes.text());
      return NextResponse.json({ error: "Failed to create invoice" }, { status: 502 });
    }

    const { payment_request, payment_hash } = await lnRes.json();
    const admin = createServiceClient();
    const userId = auth.user.id;

    // Ensure wallet exists
    const { data: wallet } = await admin.from("wallets" as any).select("id, balance_sats").eq("user_id", userId).single() as any;
    if (!wallet) {
      await admin.from("wallets" as any).insert({ user_id: userId, balance_sats: 0 });
    }

    await admin.from("wallet_transactions" as any).insert({
      user_id: userId, type: "deposit", amount_sats, balance_after: wallet?.balance_sats ?? 0, bolt11: payment_request, payment_hash, status: "pending",
    });

    return NextResponse.json({ ok: true, payment_request, payment_hash, amount_sats });
  } catch (err) {
    console.error("Deposit error:", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
