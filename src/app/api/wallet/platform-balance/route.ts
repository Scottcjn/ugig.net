import { NextResponse } from "next/server";

const LNBITS_URL = process.env.LNBITS_URL || "https://ln.coinpayportal.com";
const LNBITS_INVOICE_KEY = process.env.LNBITS_INVOICE_KEY || "";

export async function GET() {
  try {
    const res = await fetch(`${LNBITS_URL}/api/v1/wallet`, {
      headers: { "X-Api-Key": LNBITS_INVOICE_KEY },
      next: { revalidate: 60 },
    });
    if (!res.ok) return NextResponse.json({ balance_sats: 0 });
    const data = await res.json();
    return NextResponse.json({ balance_sats: Math.floor((data.balance || 0) / 1000) });
  } catch {
    return NextResponse.json({ balance_sats: 0 });
  }
}
