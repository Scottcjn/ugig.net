import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { promptListingSchema } from "@/lib/prompts/validation";
import { scanPrompt } from "@/lib/prompts/security-scan";

/**
 * GET /api/prompts/[slug] - Get a single prompt listing by slug
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = await createClient();

    const { data: listing, error } = await supabase
      .from("prompt_listings" as any)
      .select(
        `*, seller:profiles!seller_id (id, username, full_name, avatar_url, bio, account_type, verified)`
      )
      .eq("slug", slug)
      .single();

    if (error || !listing) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    // Check if current user has purchased + their vote
    let purchased = false;
    let userVote: number | null = null;
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: purchase } = await supabase
        .from("prompt_purchases" as any)
        .select("id")
        .eq("listing_id", (listing as any).id)
        .eq("buyer_id", user.id)
        .single();

      purchased = !!purchase;

      // Get user's vote
      const { data: vote } = await supabase
        .from("prompt_votes" as any)
        .select("vote_type")
        .eq("listing_id", (listing as any).id)
        .eq("user_id", user.id)
        .single();

      if (vote) {
        userVote = (vote as any).vote_type;
      }
    }

    // Fetch reviews
    const { data: reviews } = await supabase
      .from("prompt_reviews" as any)
      .select(
        `*, reviewer:profiles!reviewer_id (id, username, full_name, avatar_url)`
      )
      .eq("listing_id", (listing as any).id)
      .order("created_at", { ascending: false })
      .limit(20);

    // Fetch zap totals for this listing
    const admin = createServiceClient();
    const { data: zapAgg } = await admin
      .from("zaps" as any)
      .select("amount_sats")
      .eq("target_type", "prompt")
      .eq("target_id", (listing as any).id);

    const zapsTotal = (zapAgg || []).reduce((sum: number, z: any) => sum + (z.amount_sats || 0), 0);

    return NextResponse.json({
      listing: { ...(listing as any), zaps_total: zapsTotal },
      purchased,
      user_vote: userVote,
      reviews: reviews || [],
    });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

/**
 * PATCH /api/prompts/[slug] - Update a prompt listing (owner only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createServiceClient();

    // Verify ownership
    const { data: existing } = await admin
      .from("prompt_listings" as any)
      .select("id, seller_id")
      .eq("slug", slug)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    if ((existing as any).seller_id !== auth.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = promptListingSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
    if (parsed.data.tagline !== undefined) updateData.tagline = parsed.data.tagline || null;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.price_sats !== undefined) updateData.price_sats = parsed.data.price_sats;
    if (parsed.data.category !== undefined) updateData.category = parsed.data.category || null;
    if (parsed.data.tags !== undefined) updateData.tags = parsed.data.tags;
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
    if (parsed.data.prompt_text !== undefined) updateData.prompt_text = parsed.data.prompt_text;
    if (parsed.data.model_compatibility !== undefined) updateData.model_compatibility = parsed.data.model_compatibility;
    if (parsed.data.example_output !== undefined) updateData.example_output = parsed.data.example_output || null;
    if (parsed.data.use_case !== undefined) updateData.use_case = parsed.data.use_case || null;

    const { data: listing, error } = await admin
      .from("prompt_listings" as any)
      .update(updateData)
      .eq("id", (existing as any).id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Auto-rescan if prompt_text or other scannable content changed
    const contentChanged = parsed.data.prompt_text !== undefined ||
      parsed.data.example_output !== undefined ||
      parsed.data.use_case !== undefined ||
      parsed.data.description !== undefined;

    if (contentChanged && listing) {
      const l = listing as any;
      try {
        const scanResult = scanPrompt({
          promptText: l.prompt_text,
          exampleOutput: l.example_output,
          useCase: l.use_case,
          description: l.description,
        });

        await admin.from("prompt_security_scans" as any).insert({
          listing_id: l.id,
          scanner_version: scanResult.scannerVersion,
          status: scanResult.status,
          rating: scanResult.rating,
          security_score: scanResult.securityScore,
          findings: scanResult.findings,
        });

        await admin.from("prompt_listings" as any).update({
          scan_status: scanResult.status,
          scan_rating: scanResult.rating,
        }).eq("id", l.id);

        console.log(`[Prompt Auto-Scan] ${slug} updated: ${scanResult.status}`);
      } catch (err) {
        console.error("[Prompt Auto-Scan] Scan failed:", err);
      }
    }

    return NextResponse.json({ listing });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

/**
 * DELETE /api/prompts/[slug] - Archive a prompt listing (owner only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createServiceClient();

    const { data: existing } = await admin
      .from("prompt_listings" as any)
      .select("id, seller_id")
      .eq("slug", slug)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    if ((existing as any).seller_id !== auth.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Soft-delete: archive instead of hard delete
    await admin
      .from("prompt_listings" as any)
      .update({ status: "archived" })
      .eq("id", (existing as any).id);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
