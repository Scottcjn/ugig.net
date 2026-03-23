import { NextRequest, NextResponse } from "next/server";
import { POST as handleCoinPayWebhook } from "@/app/api/payments/coinpayportal/webhook/route";

/**
 * Dedicated CoinPay funding webhook endpoint.
 *
 * This route adds an optional shared-secret gate and then forwards
 * to the canonical CoinPay webhook handler.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.COINPAY_FUNDING_WEBHOOK_SECRET;

  // If secret is configured, require it from header.
  if (expected) {
    const received =
      request.headers.get("x-webhook-secret") ||
      request.headers.get("x-coinpay-webhook-secret") ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

    if (!received || received !== expected) {
      return NextResponse.json({ error: "Unauthorized webhook" }, { status: 401 });
    }
  }

  // Delegate to existing CoinPay webhook logic (signature verification,
  // payment updates, funding rewards/lifetime handling, etc.)
  return handleCoinPayWebhook(request);
}
