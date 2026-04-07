import { NextRequest } from "next/server";
import { processCoinPayWebhook } from "@/app/api/payments/coinpayportal/webhook/route";

/**
 * Dedicated CoinPay funding webhook endpoint.
 *
 * Verifies the X-CoinPay-Signature HMAC using COINPAY_FUNDING_CRYPTO_WEBHOOK_SECRET
 * (separate from the canonical /api/payments/coinpayportal/webhook secret).
 */
export async function POST(request: NextRequest) {
  return processCoinPayWebhook(request, process.env.COINPAY_FUNDING_CRYPTO_WEBHOOK_SECRET);
}
