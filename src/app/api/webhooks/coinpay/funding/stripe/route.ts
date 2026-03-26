import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe";
import { sendEmail } from "@/lib/email";
import type Stripe from "stripe";

const BUSINESS_EMAIL = process.env.COINPAY_BUSINESS_EMAIL || "payments@ugig.net";

function getWebhookSecret(): string {
  return process.env.COINPAY_STRIPE_WEBHOOK_SECRET || "";
}

/**
 * POST /api/webhooks/coinpay/funding/stripe
 *
 * Receives Stripe Connect webhook events from CoinPayPortal.
 * Handles payment_intent.succeeded and charge.succeeded for card-funded contributions.
 *
 * The webhook is signed by Stripe using the whsec_ signing secret.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const sig = request.headers.get("stripe-signature");

    if (!sig) {
      return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
    }

    const webhookSecret = getWebhookSecret();
    if (!webhookSecret) {
      console.error("[CoinPay Stripe Webhook] COINPAY_STRIPE_WEBHOOK_SECRET not configured");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
    }

    // Verify Stripe signature using official SDK
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err) {
      console.error("[CoinPay Stripe Webhook] Signature verification failed:", (err as Error).message);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    console.log(`[CoinPay Stripe Webhook] Received event: ${event.type}`);

    switch (event.type) {
      case "checkout.session.completed":
        await handlePaymentSucceeded(event.data.object as any);
        break;
      case "payment_intent.succeeded":
      case "charge.succeeded":
        // These don't have user_id in metadata — handled via checkout.session.completed
        console.log(`[CoinPay Stripe Webhook] Skipping ${event.type} (handled via checkout.session.completed)`);
        break;
      case "charge.refunded":
        await handleRefund(event.data.object as any);
        break;
      default:
        console.log(`[CoinPay Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[CoinPay Stripe Webhook] Error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}



/**
 * Handle a successful payment (payment_intent.succeeded or charge.succeeded).
 * Look up the funding_payment by Stripe payment ID and apply rewards.
 */
async function handlePaymentSucceeded(paymentObject: any) {
  if (!paymentObject) return;

  const supabase = createServiceClient();

  // Extract metadata — could be on payment_intent or charge
  const metadata = paymentObject.metadata || {};
  const userId = metadata.user_id;
  const rawAmount = paymentObject.amount_total || paymentObject.amount || 0;
  const amountUsd = rawAmount ? rawAmount / 100 : parseFloat(metadata.amount_usd || "0");
  const paymentId = paymentObject.id;

  console.log(
    `[CoinPay Stripe Webhook] Payment succeeded: ${paymentId}, user=${userId}, amount=$${amountUsd}`
  );

  if (!userId) {
    console.error("[CoinPay Stripe Webhook] No user_id in payment metadata");
    return;
  }

  // Check if we already have a funding_payment for this Stripe payment
  const paymentHash = `stripe_${paymentId}`;
  const { data: existing } = await supabase
    .from("funding_payments")
    .select("id, status")
    .eq("payment_hash", paymentHash)
    .single();

  if (existing?.status === "paid") {
    console.log(`[CoinPay Stripe Webhook] Already processed: ${paymentId}`);
    return;
  }

  // Create or update funding_payment record
  if (existing) {
    await supabase
      .from("funding_payments")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    const { error: insertError } = await (supabase.from("funding_payments") as any).insert({
      user_id: userId,
      amount_usd: amountUsd,
      amount_sats: 1, // Card payment placeholder
      payment_hash: paymentHash,
      bolt11: "card_payment",
      tier: metadata.tier || determineTier(amountUsd),
      status: "paid",
      paid_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
    });

    if (insertError) {
      console.error("[CoinPay Stripe Webhook] Insert error:", insertError);
      return;
    }
  }

  // Apply rewards: credits based on USD amount
  const creditsToAward = Math.floor(amountUsd * 1000); // $1 = 1000 credits
  if (creditsToAward > 0) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits")
      .eq("id", userId)
      .single();

    const currentCredits = (profile?.credits as number) ?? 0;
    await supabase
      .from("profiles")
      .update({ credits: currentCredits + creditsToAward })
      .eq("id", userId);

    console.log(
      `[CoinPay Stripe Webhook] Awarded ${creditsToAward} credits to user ${userId}`
    );
  }

  // Notify user (in-app)
  await supabase.from("notifications").insert({
    user_id: userId,
    type: "payment_received",
    title: "Card payment received! 💳",
    body: `Your $${amountUsd.toFixed(2)} funding payment was successful. ${creditsToAward.toLocaleString()} credits added to your account.`,
    data: { payment_id: paymentId, amount_usd: amountUsd, credits: creditsToAward },
  });

  // Get user email for confirmation
  const { data: userProfile } = await supabase
    .from("profiles")
    .select("username, full_name, email:id")
    .eq("id", userId)
    .single();

  // Get user email from auth
  const { data: authData } = await (supabase as any).auth.admin.getUserById(userId);
  const userEmail = authData?.user?.email;
  const displayName = userProfile?.full_name || userProfile?.username || "Contributor";

  // Email to contributor
  if (userEmail) {
    await sendEmail({
      to: userEmail,
      subject: `Thank you for your $${amountUsd.toFixed(2)} contribution to ugig.net! 💳`,
      html: `
        <h2>Thank you, ${displayName}! 🎉</h2>
        <p>Your card payment of <strong>$${amountUsd.toFixed(2)}</strong> has been received.</p>
        ${creditsToAward > 0 ? `<p><strong>${creditsToAward.toLocaleString()} credits</strong> have been added to your account.</p>` : ""}
        <p>Your support helps build the future of AI-powered freelancing.</p>
        <p><a href="https://ugig.net/funding">View funding progress →</a></p>
        <p>— The ugig.net team</p>
      `,
    }).catch((err) => console.error("[CoinPay Stripe Webhook] User email failed:", err));
  }

  // Email to business owner
  await sendEmail({
    to: BUSINESS_EMAIL,
    subject: `New funding: $${amountUsd.toFixed(2)} from ${displayName} 💳`,
    html: `
      <h2>New Card Funding Received</h2>
      <ul>
        <li><strong>From:</strong> ${displayName} (${userEmail || "no email"})</li>
        <li><strong>Amount:</strong> $${amountUsd.toFixed(2)}</li>
        <li><strong>Credits awarded:</strong> ${creditsToAward.toLocaleString()}</li>
        <li><strong>Stripe Payment:</strong> ${paymentId}</li>
        <li><strong>Time:</strong> ${new Date().toISOString()}</li>
      </ul>
      <p><a href="https://ugig.net/funding">View funding page →</a></p>
    `,
  }).catch((err) => console.error("[CoinPay Stripe Webhook] Business email failed:", err));
}

/**
 * Handle a refund event.
 */
async function handleRefund(chargeObject: any) {
  if (!chargeObject) return;

  const supabase = createServiceClient();
  const paymentId = chargeObject.payment_intent || chargeObject.id;

  console.log(`[CoinPay Stripe Webhook] Refund for: ${paymentId}`);

  // Mark funding_payment as refunded
  const { data: payment } = await supabase
    .from("funding_payments")
    .select("id, user_id, amount_usd")
    .eq("payment_hash", `stripe_${paymentId}`)
    .single();

  if (payment) {
    await supabase
      .from("funding_payments")
      .update({ status: "refunded" })
      .eq("id", payment.id);

    // Reverse credits
    const creditsToRemove = Math.floor(Number(payment.amount_usd) * 1000);
    if (creditsToRemove > 0) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("credits")
        .eq("id", payment.user_id)
        .single();

      const currentCredits = (profile?.credits as number) ?? 0;
      await supabase
        .from("profiles")
        .update({ credits: Math.max(0, currentCredits - creditsToRemove) })
        .eq("id", payment.user_id);
    }

    await supabase.from("notifications").insert({
      user_id: payment.user_id,
      type: "payment_received",
      title: "Payment refunded",
      body: `Your $${Number(payment.amount_usd).toFixed(2)} funding payment has been refunded.`,
      data: { payment_id: paymentId },
    });
  }
}

/**
 * Determine funding tier based on USD amount.
 */
function determineTier(amountUsd: number): string {
  if (amountUsd >= 50) return "lifetime";
  if (amountUsd >= 10) return "supporter";
  return "credits_100k";
}
