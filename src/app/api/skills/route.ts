import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { skillListingSchema } from "@/lib/skills/validation";
import { slugify } from "@/lib/skills/validation";
import { importSkillFromUrl } from "@/lib/skills/url-import";
import { isScanAcceptable } from "@/lib/skills/security-scan";

/**
 * GET /api/skills - Public listing of active skills
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search") || "";
    const category = url.searchParams.get("category") || "";
    const tag = url.searchParams.get("tag") || "";
    const sort = url.searchParams.get("sort") || "newest";
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = 20;
    const offset = (page - 1) * limit;

    const supabase = await createClient();

    let query = supabase
      .from("skill_listings" as any)
      .select(
        `*, seller:profiles!seller_id (id, username, full_name, avatar_url, account_type, verified)`,
        { count: "exact" }
      )
      .eq("status", "active");

    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,tagline.ilike.%${search}%`);
    }

    if (category) {
      query = query.eq("category", category);
    }

    if (tag) {
      const tags = tag.split(",").map((t) => t.trim());
      query = query.overlaps("tags", tags);
    }

    switch (sort) {
      case "popular":
        query = query.order("downloads_count", { ascending: false });
        break;
      case "rating":
        query = query.order("rating_avg", { ascending: false });
        break;
      case "price_low":
        query = query.order("price_sats", { ascending: true });
        break;
      case "price_high":
        query = query.order("price_sats", { ascending: false });
        break;
      default:
        query = query.order("created_at", { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data: listings, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      listings: listings || [],
      total: count || 0,
      page,
      per_page: limit,
    });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

/**
 * POST /api/skills - Create a new skill listing (authenticated)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = skillListingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { title, tagline, description, price_sats, category, tags, status: requestedStatus, source_url, skill_file_url, website_url } = parsed.data;

    // Generate unique slug
    let slug = slugify(title);
    if (!slug) slug = "skill";

    const admin = createServiceClient();

    // Check for slug collision and append suffix
    const { data: existing } = await admin
      .from("skill_listings" as any)
      .select("id")
      .eq("slug", slug)
      .single();

    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    // When skill_file_url is provided, always start as draft — the scan
    // result determines whether we can promote to active.
    const initialStatus = skill_file_url ? "draft" : (requestedStatus || "draft");

    const { data: listing, error } = await admin
      .from("skill_listings" as any)
      .insert({
        seller_id: auth.user.id,
        slug,
        title,
        tagline: tagline || null,
        description,
        price_sats,
        category: category || null,
        tags: tags || [],
        status: initialStatus,
        source_url: source_url || null,
        skill_file_url: skill_file_url || null,
        website_url: website_url || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Auto-import and scan from skill_file_url if provided
    let importResult = null;
    if (skill_file_url && listing) {
      const l = listing as any;
      try {
        importResult = await importSkillFromUrl({
          skillFileUrl: skill_file_url,
          sellerId: auth.user.id,
          listingSlug: l.slug,
          listingId: l.id,
        });
      } catch (err) {
        console.error("URL import failed during create:", err);
        // Non-fatal: listing is still created, import can be retried via scan
      }
    }

    // If user requested active status and skill_file_url is set, enforce scan gate
    let finalStatus = initialStatus;
    if (requestedStatus === "active" && skill_file_url) {
      if (importResult && importResult.success && isScanAcceptable(importResult.scanResult)) {
        // Scan passed — promote to active
        finalStatus = "active";
        await admin
          .from("skill_listings" as any)
          .update({ status: "active" })
          .eq("id", (listing as any).id);
        (listing as any).status = "active";
      } else {
        // Scan failed/not clean — keep as draft, return error context
        const scanStatus = importResult?.scanResult?.status || "not_scanned";
        return NextResponse.json({
          error: `Security scan required before publishing. Scan status: ${scanStatus}. Listing saved as draft.`,
          listing: { ...(listing as any), status: "draft" },
          import: importResult ? {
            success: importResult.success,
            content_hash: importResult.contentHash,
            scan_status: importResult.scanResult.status,
            error: importResult.error || null,
          } : null,
        }, { status: 422 });
      }
    }

    return NextResponse.json({
      listing,
      import: importResult ? {
        success: importResult.success,
        content_hash: importResult.contentHash,
        scan_status: importResult.scanResult.status,
        error: importResult.error || null,
      } : null,
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
