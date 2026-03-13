import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { skillListingSchema } from "@/lib/skills/validation";
import { importSkillFromUrl } from "@/lib/skills/url-import";
import { isScanAcceptable, isScanStatusAcceptable } from "@/lib/skills/security-scan";

/**
 * GET /api/skills/[slug] - Get a single skill listing by slug
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = await createClient();

    const { data: listing, error } = await supabase
      .from("skill_listings" as any)
      .select(
        `*, seller:profiles!seller_id (id, username, full_name, avatar_url, bio, account_type, verified)`
      )
      .eq("slug", slug)
      .single();

    if (error || !listing) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    // Check if current user has purchased + their vote
    let purchased = false;
    let userVote: number | null = null;
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: purchase } = await supabase
        .from("skill_purchases" as any)
        .select("id")
        .eq("listing_id", (listing as any).id)
        .eq("buyer_id", user.id)
        .single();

      purchased = !!purchase;

      // Get user's vote
      const { data: vote } = await supabase
        .from("skill_votes" as any)
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
      .from("skill_reviews" as any)
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
      .eq("target_type", "skill")
      .eq("target_id", (listing as any).id);

    const zapsTotal = (zapAgg || []).reduce((sum: number, z: any) => sum + (z.amount_sats || 0), 0);

    // Fetch latest security scan (public-safe fields only)
    const { data: scanRow } = await admin
      .from("skill_security_scans" as any)
      .select("scan_status, findings_summary, scanned_at, scan_source, source_url, content_hash, scanner_version, findings_count_by_severity")
      .eq("listing_id", (listing as any).id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    let security_scan: Record<string, unknown> | null = null;
    if (scanRow) {
      const s = scanRow as any;
      const summary = s.findings_summary || {};
      security_scan = {
        status: s.scan_status,
        risk_level: summary.risk_level ?? null,
        issues_count: Array.isArray(summary.issues) ? summary.issues.length : 0,
        issues: Array.isArray(summary.issues)
          ? (summary.issues as any[]).map((i: any) => ({
              severity: i.severity,
              detail: i.detail,
            }))
          : [],
        scanner_version: s.scanner_version ?? summary.scanner_version ?? null,
        scanned_at: s.scanned_at,
        scan_source: s.scan_source ?? null,
        source_url: s.source_url ?? null,
        content_hash: s.content_hash ?? null,
        findings_count_by_severity: s.findings_count_by_severity ?? {},
      };
    }

    return NextResponse.json({
      listing: { ...(listing as any), zaps_total: zapsTotal },
      purchased,
      user_vote: userVote,
      reviews: reviews || [],
      security_scan,
    });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

/**
 * PATCH /api/skills/[slug] - Update a skill listing (owner only)
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
      .from("skill_listings" as any)
      .select("id, seller_id, skill_file_url, scan_status")
      .eq("slug", slug)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    if ((existing as any).seller_id !== auth.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = skillListingSchema.partial().safeParse(body);
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
    if (parsed.data.source_url !== undefined) updateData.source_url = parsed.data.source_url || null;
    if (parsed.data.skill_file_url !== undefined) updateData.skill_file_url = parsed.data.skill_file_url || null;
    if (parsed.data.website_url !== undefined) updateData.website_url = parsed.data.website_url || null;
    if (parsed.data.clawhub_url !== undefined) updateData.clawhub_url = parsed.data.clawhub_url || null;

    // Determine effective skill_file_url (new value or existing)
    const effectiveSkillFileUrl = parsed.data.skill_file_url !== undefined
      ? (parsed.data.skill_file_url || null)
      : (existing as any).skill_file_url;

    const skillFileUrlChanged = parsed.data.skill_file_url !== undefined
      && parsed.data.skill_file_url !== (existing as any).skill_file_url;

    // Auto-import from skill_file_url if it changed (run BEFORE status enforcement)
    let importResult = null;
    if (skillFileUrlChanged && parsed.data.skill_file_url) {
      try {
        importResult = await importSkillFromUrl({
          skillFileUrl: parsed.data.skill_file_url,
          sellerId: auth.user.id,
          listingSlug: slug,
          listingId: (existing as any).id,
        });
      } catch (err) {
        console.error("URL import failed during update:", err);
      }
    }

    // ── Enforce scan gate for publishing ─────────────────────────
    // If the listing has a skill_file_url and the requested status is "active",
    // verify that the latest scan is acceptable.
    const requestedStatus = parsed.data.status;
    if (requestedStatus === "active" && effectiveSkillFileUrl) {
      let scanPassed = false;

      if (importResult) {
        // We just ran a scan — use its result
        scanPassed = importResult.success && isScanAcceptable(importResult.scanResult);
      } else {
        // No new scan — check the existing scan_status on the listing
        scanPassed = isScanStatusAcceptable((existing as any).scan_status);
      }

      if (!scanPassed) {
        // Block publishing — force status back to draft
        updateData.status = "draft";

        // Still apply other field updates
        const { data: listing, error } = await admin
          .from("skill_listings" as any)
          .update(updateData)
          .eq("id", (existing as any).id)
          .select()
          .single();

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const scanStatus = importResult?.scanResult?.status || (existing as any).scan_status || "not_scanned";
        return NextResponse.json({
          error: `Security scan must pass before publishing. Current scan status: ${scanStatus}. Listing kept as draft.`,
          listing,
          import: importResult ? {
            success: importResult.success,
            content_hash: importResult.contentHash,
            scan_status: importResult.scanResult.status,
            error: importResult.error || null,
          } : null,
        }, { status: 422 });
      }
    }

    const { data: listing, error } = await admin
      .from("skill_listings" as any)
      .update(updateData)
      .eq("id", (existing as any).id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      listing,
      import: importResult ? {
        success: importResult.success,
        content_hash: importResult.contentHash,
        scan_status: importResult.scanResult.status,
        error: importResult.error || null,
      } : null,
    });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

/**
 * DELETE /api/skills/[slug] - Archive a skill listing (owner only)
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
      .from("skill_listings" as any)
      .select("id, seller_id")
      .eq("slug", slug)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    if ((existing as any).seller_id !== auth.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Soft-delete: archive instead of hard delete
    await admin
      .from("skill_listings" as any)
      .update({ status: "archived" })
      .eq("id", (existing as any).id);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
