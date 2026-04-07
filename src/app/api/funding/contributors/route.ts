import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/funding/contributors
 * Public — returns the latest CoinPay funding contributions.
 */
export async function GET() {
  try {
    const supabase = createServiceClient();

    const { data: payments } = (await (supabase.from("funding_payments") as any)
      .select(
        "id, user_id, amount_usd, currency, contributor_name, paid_at, created_at"
      )
      .in("status", ["paid", "confirmed", "forwarded"])
      .not("coinpay_payment_id", "is", null)
      .order("paid_at", { ascending: false })
      .limit(10)) as { data: any[] | null };

    const rows = payments || [];

    const userIds = [
      ...new Set(rows.map((p) => p.user_id).filter((x): x is string => !!x)),
    ];
    const profileMap: Record<
      string,
      { username: string; full_name: string | null; avatar_url: string | null }
    > = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url")
        .in("id", userIds);
      for (const p of profiles || []) {
        profileMap[p.id as string] = {
          username: p.username as string,
          full_name: (p.full_name as string) || null,
          avatar_url: (p.avatar_url as string) || null,
        };
      }
    }

    const transactions = rows.map((p) => {
      const profile = p.user_id ? profileMap[p.user_id] : undefined;
      return {
        id: p.id,
        username: profile?.username || p.contributor_name || "Anonymous",
        full_name: profile?.full_name || p.contributor_name || null,
        avatar_url: profile?.avatar_url || null,
        amount_usd: p.amount_usd || 0,
        currency: (p.currency as string) || "card",
        paid_at: p.paid_at || p.created_at,
      };
    });

    return NextResponse.json(
      { transactions },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    console.error("Funding contributors error:", error);
    return NextResponse.json({ transactions: [] }, { status: 500 });
  }
}
