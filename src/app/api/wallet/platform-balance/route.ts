import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const LNBITS_URL = process.env.LNBITS_URL || "https://ln.coinpayportal.com";
const LNBITS_INVOICE_KEY = process.env.LNBITS_INVOICE_KEY || "";
const LNBITS_PAYLINK_KEY = process.env.LNBITS_PAYLINK_KEY || "";
const SYSTEM_WALLET_USER = "00000000-0000-0000-0000-000000000000";

async function getWalletBalance(apiKey: string): Promise<number> {
  if (!apiKey) return 0;
  try {
    const res = await fetch(`${LNBITS_URL}/api/v1/wallet`, {
      headers: { "X-Api-Key": apiKey },
      next: { revalidate: 60 },
    });
    if (!res.ok) return 0;
    return Math.floor(((await res.json()).balance || 0) / 1000);
  } catch {
    return 0;
  }
}

export async function GET() {
  try {
    // Sum balances from both the ugig platform wallet and the pay link wallet
    const [platformSats, paylinkSats] = await Promise.all([
      getWalletBalance(LNBITS_INVOICE_KEY),
      LNBITS_PAYLINK_KEY && LNBITS_PAYLINK_KEY !== LNBITS_INVOICE_KEY
        ? getWalletBalance(LNBITS_PAYLINK_KEY)
        : Promise.resolve(0),
    ]);
    const totalSats = platformSats + paylinkSats;

    // Fetch system wallet commission from Supabase
    const supabase = createServiceClient();
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
