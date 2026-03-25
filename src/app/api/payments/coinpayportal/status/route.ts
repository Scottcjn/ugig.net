import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/payments/coinpayportal/status?payment_id=X
 *
 * Poll payment status from local DB (updated by webhook).
 */
export async function GET(request: NextRequest) {
  try {
    const paymentId = request.nextUrl.searchParams.get("payment_id");
    if (!paymentId) {
      return NextResponse.json(
        { error: "payment_id is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: payment, error } = await supabase
      .from("payments")
      .select("id, status, updated_at")
      .eq("id", paymentId)
      .eq("user_id", user.id)
      .single();

    if (error || !payment) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: payment.status,
      updated_at: payment.updated_at,
    });
  } catch (error) {
    console.error("Payment status error:", error);
    return NextResponse.json(
      { error: "Failed to check payment status" },
      { status: 500 }
    );
  }
}
