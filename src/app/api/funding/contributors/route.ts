import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/funding/contributors
 * Public endpoint — returns latest funding transactions with user info.
 */
export async function GET() {
  try {
    const supabase = createServiceClient();

    // Get latest 10 paid funding payments
    const { data: payments } = await supabase
      .from("funding_payments")
      .select("id, user_id, amount_usd, amount_sats, tier, payment_hash, paid_at, created_at")
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(10);

    if (!payments || payments.length === 0) {
      return NextResponse.json({ transactions: [] });
    }

    // Get profile info
    const userIds = [...new Set(payments.map((p) => p.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url")
      .in("id", userIds);

    const profileMap: Record<string, any> = {};
    for (const p of profiles || []) {
      profileMap[p.id] = p;
    }

    const transactions = payments.map((p) => ({
      id: p.id,
      username: profileMap[p.user_id]?.username || "Anonymous",
      full_name: profileMap[p.user_id]?.full_name || null,
      avatar_url: profileMap[p.user_id]?.avatar_url || null,
      amount_usd: p.amount_usd || 0,
      amount_sats: p.amount_sats || 0,
      tier: p.tier,
      method: p.payment_hash?.startsWith("stripe_") ? "card" : "lightning",
      paid_at: p.paid_at,
    }));

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
