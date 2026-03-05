import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const LNBITS_URL = process.env.LNBITS_URL || "https://ln.coinpayportal.com";
const LNBITS_INVOICE_KEY = process.env.LNBITS_INVOICE_KEY || "";
const SYSTEM_WALLET_USER = "00000000-0000-0000-0000-000000000000";

export async function GET() {
  try {
    // Fetch LNBits total wallet balance (all deposits)
    const lnRes = await fetch(`${LNBITS_URL}/api/v1/wallet`, {
      headers: { "X-Api-Key": LNBITS_INVOICE_KEY },
      next: { revalidate: 60 },
    });
    const totalSats = lnRes.ok
      ? Math.floor(((await lnRes.json()).balance || 0) / 1000)
      : 0;

    // Fetch system wallet commission from Supabase (zap_fee + withdrawal_fee)
    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: wallet } = await supabase
      .from("wallets" as any)
      .select("balance_sats")
      .eq("user_id", SYSTEM_WALLET_USER)
      .single();

    return NextResponse.json({
      balance_sats: totalSats,
      commission_sats: (wallet as any)?.balance_sats ?? 0,
    });
  } catch {
    return NextResponse.json({ balance_sats: 0, commission_sats: 0 });
  }
}
