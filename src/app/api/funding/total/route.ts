import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/funding/total
 * Public — returns total CoinPay funding raised. DB-backed sum, no fallback.
 */
export async function GET() {
  try {
    const supabase = createServiceClient();

    const { data: payments } = (await (supabase.from("funding_payments") as any)
      .select("amount_usd, user_id, contributor_email")
      .in("status", ["paid", "confirmed", "forwarded"])
      .not("coinpay_payment_id", "is", null)) as { data: any[] | null };

    const rows = payments || [];
    const total = rows.reduce(
      (sum, p) => sum + (Number(p.amount_usd) || 0),
      0
    );
    const contributorKeys = new Set(
      rows.map((p) => p.user_id || p.contributor_email).filter(Boolean)
    );

    return NextResponse.json(
      {
        total_usd: Math.round(total * 100) / 100,
        contributors: contributorKeys.size,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    console.error("Funding total error:", error);
    return NextResponse.json(
      { total_usd: 0, contributors: 0 },
      { status: 500 }
    );
  }
}
