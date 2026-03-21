import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { releaseEscrow } from "@/lib/coinpayportal";
import { getUserDid, onGigCompleted } from "@/lib/reputation-hooks";
import { z } from "zod";

const releaseSchema = z.object({
  escrow_id: z.string().uuid(),
});

// POST /api/gigs/[id]/escrow/release - Release escrow to worker
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gigId } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const body = await request.json();
    const validationResult = releaseSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { escrow_id } = validationResult.data;

    // Get escrow — must be poster and funded
    const { data: escrow } = await (supabase as any)
      .from("gig_escrows")
      .select("*")
      .eq("id", escrow_id)
      .eq("gig_id", gigId)
      .single();

    if (!escrow) {
      return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
    }

    if (escrow.poster_id !== user.id) {
      return NextResponse.json(
        { error: "Only the gig poster can release escrow" },
        { status: 403 }
      );
    }

    if (escrow.status !== "funded") {
      return NextResponse.json(
        { error: `Cannot release escrow in '${escrow.status}' status. Must be 'funded'.` },
        { status: 400 }
      );
    }

    if (!escrow.coinpay_escrow_id) {
      return NextResponse.json(
        { error: "Escrow has no CoinPayPortal ID" },
        { status: 400 }
      );
    }

    // Release on CoinPayPortal
    const releaseResult = await releaseEscrow(escrow.coinpay_escrow_id);

    // Update local record
    const now = new Date().toISOString();
    const { error: updateError } = await (supabase as any)
      .from("gig_escrows")
      .update({
        status: "released",
        released_at: now,
        updated_at: now,
        metadata: {
          ...escrow.metadata,
          release_tx_hash: releaseResult.escrow.tx_hash,
        },
      })
      .eq("id", escrow_id);

    if (updateError) {
      console.error("Failed to update escrow status:", updateError);
    }

    // Update application status to completed
    await supabase
      .from("applications")
      .update({
        status: "completed" as any,
        updated_at: now,
      })
      .eq("id", escrow.application_id);

    // Get gig title for notifications
    const { data: gig } = await supabase
      .from("gigs")
      .select("title")
      .eq("id", gigId)
      .single();

    // Notify worker
    await supabase.from("notifications").insert({
      user_id: escrow.worker_id,
      type: "payment_received",
      title: "Payment released!",
      body: `$${escrow.amount_usd - escrow.platform_fee_usd} has been released for "${gig?.title || "your gig"}". Funds are on their way!`,
      data: {
        gig_id: gigId,
        escrow_id: escrow.id,
        amount_usd: escrow.amount_usd,
        platform_fee_usd: escrow.platform_fee_usd,
      },
    });

    // Submit reputation receipt for completed work
    try {
      const workerDid = await getUserDid(supabase, escrow.worker_id);
      if (workerDid) {
        await onGigCompleted(workerDid, gigId);
      }
    } catch (err) {
      console.error("Reputation receipt failed (non-fatal):", err);
    }

    return NextResponse.json({
      data: {
        escrow_id: escrow.id,
        status: "released",
        released_at: now,
        amount_usd: escrow.amount_usd,
        platform_fee_usd: escrow.platform_fee_usd,
        worker_receives: escrow.amount_usd - escrow.platform_fee_usd,
      },
    });
  } catch (error) {
    console.error("Escrow release error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
