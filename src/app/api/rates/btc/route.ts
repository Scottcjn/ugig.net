import { NextResponse } from "next/server";

let cached: { rate: number; ts: number } | null = null;
const CACHE_MS = 5 * 60 * 1000; // 5 min

export async function GET() {
  if (cached && Date.now() - cached.ts < CACHE_MS) {
    return NextResponse.json({ rate: cached.rate });
  }

  try {
    const res = await fetch("https://coinpayportal.com/api/rates?coin=BTC", {
      next: { revalidate: 300 },
    });
    const data = await res.json();
    if (data.success && data.rate) {
      cached = { rate: data.rate, ts: Date.now() };
      return NextResponse.json({ rate: data.rate });
    }
  } catch {}

  return NextResponse.json({ rate: cached?.rate ?? null });
}
