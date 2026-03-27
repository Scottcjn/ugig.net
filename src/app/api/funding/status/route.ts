import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkPayment } from "@/lib/lnbits";

/**
 * GET /api/funding/status?paymentHash=xxx
 * Poll payment status for the current user.
 *
 * If DB says "pending" but LNbits says "paid", we process the payment
 * inline as a fallback (webhook may have failed or never fired).
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
      .select("id, status, tier, amount_sats, amount_usd, paid_at, expires_at, created_at")
      .eq("payment_hash", paymentHash)
      .eq("user_id", user.id)
      .single();

    if (error || !payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // If already paid, return immediately
    if (payment.status === "paid") {
      return NextResponse.json(payment);
    }

    // Check if expired
    if (payment.status === "pending" && new Date(payment.expires_at) < new Date()) {
      return NextResponse.json({ ...payment, status: "expired" });
    }

    // Fallback: check LNbits directly if DB still says pending
    // (handles cases where webhook failed or never fired)
    if (payment.status === "pending") {
      try {
        const lnStatus = await checkPayment(paymentHash);
        if (lnStatus.paid) {
          console.log(
            `[Funding Status] LNbits confirms paid but DB was pending: ${paymentHash}. Processing inline.`
          );

          // Mark as paid using service client (bypasses RLS)
          const serviceClient = createServiceClient();
          const { error: updateError } = await serviceClient
            .from("funding_payments")
            .update({ status: "paid", paid_at: new Date().toISOString() })
            .eq("id", payment.id)
            .eq("status", "pending"); // optimistic lock

          if (!updateError) {
            // Fire the webhook handler logic inline
            // We do this via an internal POST to reuse the reward logic
            try {
              const baseUrl =
                process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";
              await fetch(`${baseUrl}/api/funding/lnbits-webhook`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ payment_hash: paymentHash }),
              });
            } catch (webhookErr) {
              console.error(
                "[Funding Status] Inline webhook call failed:",
                webhookErr
              );
              // Payment is still marked paid — rewards will be applied on retry
            }

            return NextResponse.json({ ...payment, status: "paid", paid_at: new Date().toISOString() });
          }
        }
      } catch (lnErr) {
        // LNbits check failed — not critical, just return DB status
        console.error("[Funding Status] LNbits check failed:", lnErr);
      }
    }

    return NextResponse.json(payment);
  } catch (error) {
    console.error("Funding status error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
