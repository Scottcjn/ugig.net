import { NextRequest, NextResponse } from "next/server";
import {
  verifyCoinpayWebhook,
  type CoinpayWebhookPayload,
} from "@/lib/coinpay-client";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Unified CoinPay webhook for funding (crypto + Stripe-routed card).
 * CoinPay only supports one webhook URL per business; it re-signs both
 * crypto and Stripe-routed events with its own HMAC.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.COINPAY_FUNDING_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[coinpay webhook] COINPAY_FUNDING_WEBHOOK_SECRET not set");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-coinpay-signature");
  if (!verifyCoinpayWebhook(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: CoinpayWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as CoinpayWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    console.error("[coinpay webhook] no supabase client");
    return NextResponse.json({ received: true, persisted: false });
  }

  const data = payload.data;
  const paymentId = data?.payment_id;
  if (!paymentId) {
    return NextResponse.json({ error: "Missing payment_id" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const amountCrypto =
    typeof data.amount_crypto === "string"
      ? parseFloat(data.amount_crypto)
      : (data.amount_crypto ?? null);

  let nextStatus: string | null = null;
  switch (payload.type) {
    case "payment.confirmed":
      nextStatus = "confirmed";
      break;
    case "payment.forwarded":
      nextStatus = "forwarded";
      break;
    case "payment.expired":
      nextStatus = "expired";
      break;
    case "payment.failed":
      nextStatus = "failed";
      break;
    default:
      return NextResponse.json({ received: true, ignored: payload.type });
  }

  const update: Record<string, unknown> = {
    status: nextStatus,
    updated_at: now,
    tx_hash: data.tx_hash ?? null,
  };
  if (amountCrypto !== null) update.amount_crypto = amountCrypto;
  if (nextStatus === "confirmed" || nextStatus === "forwarded")
    update.paid_at = now;

  const { error } = await (supabase.from("funding_payments") as any)
    .update(update)
    .eq("coinpay_payment_id", paymentId);

  if (error) {
    console.error("[coinpay webhook] update failed:", error);
    return NextResponse.json({ error: "DB update failed" }, { status: 500 });
  }

  console.log(
    `[coinpay webhook] received ${payload.type} for ${paymentId} -> ${nextStatus}`
  );
  return NextResponse.json({ received: true });
}
