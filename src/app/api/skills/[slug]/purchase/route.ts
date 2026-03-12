import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { executeSkillPurchase } from "@/lib/skills/purchase";
import { recordConversion } from "@/lib/affiliates/commission";
import { findAttribution } from "@/lib/affiliates/tracking";

/**
 * POST /api/skills/[slug]/purchase - Buy a skill listing
 */
export async function POST(
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
    const { data: listing } = await admin
      .from("skill_listings" as any)
      .select("id, seller_id, price_sats, status, title")
      .eq("slug", slug)
      .single();

    if (!listing) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    if ((listing as any).status !== "active") {
      return NextResponse.json({ error: "Skill is not available for purchase" }, { status: 400 });
    }

    if ((listing as any).seller_id === auth.user.id) {
      return NextResponse.json({ error: "Cannot purchase your own skill" }, { status: 400 });
    }

    // Check if already purchased
    const { data: existing } = await admin
      .from("skill_purchases" as any)
      .select("id")
      .eq("listing_id", (listing as any).id)
      .eq("buyer_id", auth.user.id)
      .single();

    if (existing) {
      return NextResponse.json({ error: "Already purchased" }, { status: 409 });
    }

    // Get seller subscription plan for fee calculation
    const { data: sellerSub } = await admin
      .from("subscriptions")
      .select("plan, status")
      .eq("user_id", (listing as any).seller_id)
      .single();

    const sellerPlan =
      sellerSub?.status === "active" ? sellerSub.plan : "free";

    const result = await executeSkillPurchase(admin, {
      buyerId: auth.user.id,
      sellerId: (listing as any).seller_id,
      listingId: (listing as any).id,
      priceSats: (listing as any).price_sats,
      sellerPlan,
    });

    if (!result.ok) {
      const status = result.error === "Insufficient balance" ? 402 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    // Notify seller
    const { data: buyerProfile } = await admin
      .from("profiles")
      .select("username")
      .eq("id", auth.user.id)
      .single();

    await (admin.from("notifications") as any).insert({
      user_id: (listing as any).seller_id,
      type: "skill_purchased",
      title: "Skill purchased! 🎉",
      body: `${buyerProfile?.username || "Someone"} purchased "${(listing as any).title}"`,
      data: {
        listing_id: (listing as any).id,
        purchase_id: result.purchase_id,
        amount_sats: (listing as any).price_sats,
        fee_sats: result.fee_sats,
      },
    });

    // Check for affiliate attribution (non-blocking)
    try {
      const affRef = request.cookies.get("aff_ref")?.value;
      if (affRef && result.purchase_id) {
        // Find the affiliate offer linked to this skill listing
        const { data: affOffer } = await (admin as any)
          .from("affiliate_offers")
          .select("id")
          .eq("listing_id", (listing as any).id)
          .eq("status", "active")
          .single();

        if (affOffer) {
          // Find which affiliate referred this buyer
          const attribution = await findAttribution(admin, {
            offerId: affOffer.id,
            trackingCode: affRef,
          });

          if (attribution?.affiliated && attribution.affiliate_id) {
            const convResult = await recordConversion(admin, {
              offerId: affOffer.id,
              affiliateId: attribution.affiliate_id,
              buyerId: auth.user.id,
              clickId: attribution.click_id,
              purchaseId: result.purchase_id,
              saleAmountSats: (listing as any).price_sats,
            });

            if (convResult.ok) {
              // Notify affiliate about the sale
              await (admin as any)
                .from("notifications")
                .insert({
                  user_id: attribution.affiliate_id,
                  type: "affiliate_sale",
                  title: "Affiliate sale! 🎉",
                  body: `Someone purchased "${(listing as any).title}" through your link — ${convResult.commission_sats?.toLocaleString()} sats commission pending`,
                  data: {
                    conversion_id: convResult.conversion_id,
                    commission_sats: convResult.commission_sats,
                    settles_at: convResult.settles_at,
                  },
                });
            }
          }
        }
      }
    } catch (affErr) {
      // Affiliate attribution is non-blocking — don't fail the purchase
      console.error("[affiliate] Attribution failed (non-fatal):", affErr);
    }

    return NextResponse.json({
      ok: true,
      purchase_id: result.purchase_id,
      fee_sats: result.fee_sats,
      fee_rate: result.fee_rate,
      new_balance: result.new_balance,
    });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
