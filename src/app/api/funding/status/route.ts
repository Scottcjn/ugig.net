import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkPayment } from "@/lib/lnbits";
import { FUNDING_TIERS, LIFETIME_THRESHOLD_USD } from "@/lib/funding";

/**
 * GET /api/funding/status?paymentHash=xxx
 * Poll payment status for the current user.
 * If DB says pending, actively checks LNbits and processes payment if paid.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const paymentHash = request.nextUrl.searchParams.get("paymentHash");
    if (!paymentHash) {
      return NextResponse.json({ error: "paymentHash required" }, { status: 400 });
    }

    const { data: payment, error } = await supabase
      .from("funding_payments")
      .select("id, status, tier, amount_sats, amount_usd, paid_at, expires_at, created_at, user_id")
      .eq("payment_hash", paymentHash)
      .eq("user_id", user.id)
      .single();

    if (error || !payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // Check if expired
    if (payment.status === "pending" && new Date(payment.expires_at) < new Date()) {
      return NextResponse.json({ ...payment, status: "expired" });
    }

    // Active LNbits check: if DB still says pending, ask LNbits directly
    if (payment.status === "pending") {
      try {
        const lnbitsStatus = await checkPayment(paymentHash);
        if (lnbitsStatus.paid) {
          // Payment confirmed by LNbits but webhook was missed — process it now
          const serviceClient = createServiceClient();
          const paidAt = new Date().toISOString();

          const { error: updateError } = await serviceClient
            .from("funding_payments")
            .update({ status: "paid", paid_at: paidAt })
            .eq("id", payment.id)
            .eq("status", "pending"); // optimistic lock

          if (!updateError) {
            console.log(`[Funding Status] Recovered missed webhook for ${paymentHash}`);

            // Apply rewards (same logic as webhook handler)
            await applyFundingRewards(serviceClient, payment);

            return NextResponse.json({
              ...payment,
              status: "paid",
              paid_at: paidAt,
            });
          }
        }
      } catch (lnErr) {
        // LNbits check failed — fall through to return DB status
        console.error("[Funding Status] LNbits check failed:", lnErr);
      }
    }

    return NextResponse.json(payment);
  } catch (error) {
    console.error("Funding status error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Apply funding rewards (credits, lifetime, badge) — mirrors webhook logic.
 */
async function applyFundingRewards(
  supabase: ReturnType<typeof createServiceClient>,
  payment: { id: string; user_id: string; tier: string; amount_sats: number; amount_usd: number | null }
) {
  const tier = payment.tier as string;
  const tierConfig = FUNDING_TIERS[tier as keyof typeof FUNDING_TIERS];
  const rewards: Array<{
    user_id: string;
    funding_payment_id: string;
    reward_type: string;
    amount: number | null;
    metadata: Record<string, string | number>;
  }> = [];

  // Credits
  if (tierConfig && tierConfig.creditsAwarded > 0) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits")
      .eq("id", payment.user_id)
      .single();

    const currentCredits = (profile?.credits as number) ?? 0;
    await supabase
      .from("profiles")
      .update({ credits: currentCredits + tierConfig.creditsAwarded })
      .eq("id", payment.user_id);

    rewards.push({
      user_id: payment.user_id,
      funding_payment_id: payment.id,
      reward_type: "credits",
      amount: tierConfig.creditsAwarded,
      metadata: { tier, sats: payment.amount_sats },
    });
  }

  // Lifetime premium
  const amountUsd = Number(payment.amount_usd) || 0;
  if (amountUsd >= LIFETIME_THRESHOLD_USD) {
    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("id, plan")
      .eq("user_id", payment.user_id)
      .single();

    if (existingSub) {
      await supabase
        .from("subscriptions")
        .update({ plan: "lifetime", status: "active" })
        .eq("id", existingSub.id);
    } else {
      await supabase.from("subscriptions").insert({
        user_id: payment.user_id,
        plan: "lifetime",
        status: "active",
        cancel_at_period_end: false,
      });
    }

    rewards.push({
      user_id: payment.user_id,
      funding_payment_id: payment.id,
      reward_type: "lifetime",
      amount: null,
      metadata: { amount_usd: amountUsd, tier: tier as string },
    });
  }

  // Supporter badge
  if (tier === "supporter") {
    rewards.push({
      user_id: payment.user_id,
      funding_payment_id: payment.id,
      reward_type: "badge",
      amount: null,
      metadata: { badge: "supporter", sats: payment.amount_sats },
    });
  }

  if (rewards.length > 0) {
    const { error: rewardError } = await supabase
      .from("funding_rewards_log")
      .insert(rewards);

    if (rewardError) {
      console.error("[Funding Status] Failed to write rewards:", rewardError);
    }
  }
}
