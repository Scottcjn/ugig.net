import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

const BUCKET = "skill-files";
const SIGNED_URL_EXPIRY_SECONDS = 300; // 5 minutes

/**
 * GET /api/skills/[slug]/download - Download a skill file
 *
 * Entitlement check:
 *   - Seller (owner) can always download
 *   - Buyer who purchased can download
 *   - Free listings (price_sats=0) require a purchase record (claim)
 *   - Admin/service role can download (future)
 *
 * Returns a short-lived signed URL redirect (no public leakage).
 */
export async function GET(
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

    // Fetch listing
    const { data: listing, error: listingError } = await admin
      .from("skill_listings" as any)
      .select("id, seller_id, skill_file_path, status, price_sats, downloads_count")
      .eq("slug", slug)
      .single();

    if (listingError || !listing) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const l = listing as any;

    // Must be active or owned by seller
    if (l.status !== "active" && l.seller_id !== auth.user.id) {
      return NextResponse.json({ error: "Skill is not available" }, { status: 404 });
    }

    // Must have a file
    if (!l.skill_file_path) {
      return NextResponse.json({ error: "No file available for download" }, { status: 404 });
    }

    // Entitlement check
    const isOwner = l.seller_id === auth.user.id;

    if (!isOwner) {
      // Check purchase record
      const { data: purchase } = await admin
        .from("skill_purchases" as any)
        .select("id")
        .eq("listing_id", l.id)
        .eq("buyer_id", auth.user.id)
        .single();

      if (!purchase) {
        return NextResponse.json(
          { error: "Purchase required to download this skill" },
          { status: 403 }
        );
      }
    }

    // Generate signed URL (service role has full storage access)
    const { data: signedUrlData, error: signedError } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(l.skill_file_path, SIGNED_URL_EXPIRY_SECONDS);

    if (signedError || !signedUrlData?.signedUrl) {
      console.error("Signed URL error:", signedError);
      return NextResponse.json(
        { error: "Failed to generate download link" },
        { status: 500 }
      );
    }

    // Track download intent (best-effort). This measures successful entitlement-gated
    // download link generations via this endpoint.
    await admin
      .from("skill_listings" as any)
      .update({ downloads_count: (l.downloads_count ?? 0) + 1 })
      .eq("id", l.id);

    // Return the signed URL (client redirects)
    return NextResponse.json({
      url: signedUrlData.signedUrl,
      expires_in: SIGNED_URL_EXPIRY_SECONDS,
    });
  } catch (err) {
    console.error("Download error:", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
