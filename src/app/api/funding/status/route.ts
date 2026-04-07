import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCoinpayPaymentStatus } from "@/lib/coinpay-client";

/**
 * GET /api/funding/status?payment_id=xxx
 * Public — polls CoinPay for the latest status of a funding payment and
 * mirrors it into funding_payments. Returns DB row.
 */
export async function GET(request: NextRequest) {
  const paymentId = request.nextUrl.searchParams.get("payment_id");
  if (!paymentId) {
    return NextResponse.json({ error: "payment_id required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: row, error } = (await (supabase.from("funding_payments") as any)
    .select(
      "id, coinpay_payment_id, status, amount_usd, amount_crypto, currency, paid_at, created_at, tx_hash"
    )
    .eq("coinpay_payment_id", paymentId)
    .single()) as { data: any; error: any };

  if (error || !row) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  // If still pending, ask CoinPay directly so the UI can advance even if
  // the webhook hasn't landed yet.
  if (row.status === "pending") {
    try {
      const cp = await getCoinpayPaymentStatus(paymentId);
      const upstream = cp.status;
      if (
        upstream === "confirmed" ||
        upstream === "forwarded" ||
        upstream === "expired" ||
        upstream === "failed"
      ) {
        const now = new Date().toISOString();
        const update: Record<string, unknown> = {
          status: upstream,
          updated_at: now,
          tx_hash: cp.tx_hash ?? null,
        };
        if (upstream === "confirmed" || upstream === "forwarded")
          update.paid_at = now;
        await (supabase.from("funding_payments") as any)
          .update(update)
          .eq("id", row.id)
          .eq("status", "pending");
        return NextResponse.json({ ...row, ...update });
      }
    } catch (e) {
      console.error("[funding/status] CoinPay check failed:", e);
    }
  }

  return NextResponse.json(row);
}
