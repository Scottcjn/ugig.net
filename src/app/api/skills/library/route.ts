import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/skills/library - Get current user's purchased skills
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createServiceClient();

    const { data: purchases, error } = await admin
      .from("skill_purchases" as any)
      .select(
        `
        id,
        price_sats,
        fee_sats,
        created_at,
        listing:skill_listings!listing_id (
          id, slug, title, tagline, description, price_sats, category, tags,
          cover_image_url, status, downloads_count, rating_avg, rating_count,
          seller:profiles!seller_id (id, username, full_name, avatar_url)
        )
      `
      )
      .eq("buyer_id", auth.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ purchases: purchases || [] });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
