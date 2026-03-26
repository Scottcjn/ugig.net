import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/funding/contributors
 * Public endpoint — returns latest funding transactions with user info.
 */
export async function GET() {
  try {
    const supabase = createServiceClient();

    // Get from both funding_payments (lightning + card) and payments (crypto via CoinPayPortal)
    const { data: fundingPayments } = await supabase
      .from("funding_payments")
      .select("id, user_id, amount_usd, amount_sats, tier, payment_hash, paid_at, created_at")
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(10);

    const { data: cryptoPayments } = await supabase
      .from("payments")
      .select("id, user_id, amount_usd, blockchain, crypto_amount, status, confirmed_at, forwarded_at, created_at")
      .eq("type", "tip")
      .in("status", ["confirmed", "forwarded"] as any)
      .order("created_at", { ascending: false })
      .limit(10);

    // Merge and sort by date
    const allPayments = [
      ...(fundingPayments || []).map((p) => ({
        id: p.id,
        user_id: p.user_id,
        amount_usd: p.amount_usd || 0,
        amount_sats: p.amount_sats || 0,
        tier: p.tier || "supporter",
        method: (p.payment_hash?.startsWith("stripe_") ? "card" : "lightning") as "card" | "lightning" | "crypto",
        paid_at: p.paid_at || p.created_at,
      })),
      ...(cryptoPayments || []).map((p) => ({
        id: p.id,
        user_id: p.user_id,
        amount_usd: p.amount_usd || 0,
        amount_sats: 0,
        tier: "crypto",
        method: "crypto" as "card" | "lightning" | "crypto",
        paid_at: p.forwarded_at || p.confirmed_at || p.created_at,
        blockchain: p.blockchain,
        crypto_amount: p.crypto_amount,
      })),
    ]
      .sort((a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime())
      .slice(0, 10);

    if (allPayments.length === 0) {
      return NextResponse.json({ transactions: [] });
    }

    // Get profile info
    const userIds = [...new Set(allPayments.map((p) => p.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url")
      .in("id", userIds);

    const profileMap: Record<string, any> = {};
    for (const p of profiles || []) {
      profileMap[p.id] = p;
    }

    const transactions = allPayments.map((p) => ({
      id: p.id,
      username: profileMap[p.user_id]?.username || "Anonymous",
      full_name: profileMap[p.user_id]?.full_name || null,
      avatar_url: profileMap[p.user_id]?.avatar_url || null,
      amount_usd: p.amount_usd,
      amount_sats: p.amount_sats,
      tier: p.tier,
      method: p.method,
      blockchain: (p as any).blockchain || null,
      crypto_amount: (p as any).crypto_amount || null,
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
