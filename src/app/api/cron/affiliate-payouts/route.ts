import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserLnWallet, internalTransfer } from "@/lib/lightning/wallet-utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * POST /api/cron/affiliate-payouts
 * Automatically pays settled conversions for offers with auto_pay=true
 */
export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceClient();
  const now = new Date().toISOString();

  // Find pending conversions that have settled on auto_pay offers
  const { data: conversions, error: queryErr } = await (admin as AnySupabase)
    .from("affiliate_conversions")
    .select(`
      id,
      offer_id,
      affiliate_id,
      commission_sats,
      affiliate_offers!inner(seller_id, auto_pay)
    `)
    .eq("status", "pending")
    .lte("settles_at", now)
    .eq("affiliate_offers.auto_pay", true);

  if (queryErr) {
    console.error("[Affiliate Payouts] Query error:", queryErr);
    return NextResponse.json({ error: queryErr.message }, { status: 500 });
  }

  if (!conversions || conversions.length === 0) {
    return NextResponse.json({ paid: 0, failed: 0, message: "No settled conversions to pay" });
  }

  let paid = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const conv of conversions) {
    const sellerId = conv.affiliate_offers?.seller_id;
    if (!sellerId) {
      errors.push(`${conv.id}: no seller_id`);
      failed++;
      continue;
    }

    try {
      const sellerWallet = await getUserLnWallet(admin, sellerId);
      const affiliateWallet = await getUserLnWallet(admin, conv.affiliate_id);

      if (!sellerWallet) {
        errors.push(`${conv.id}: seller has no LN wallet`);
        failed++;
        continue;
      }
      if (!affiliateWallet) {
        errors.push(`${conv.id}: affiliate has no LN wallet`);
        failed++;
        continue;
      }

      await internalTransfer(
        sellerWallet.admin_key,
        affiliateWallet.invoice_key,
        conv.commission_sats,
        `Auto affiliate payout (offer ${conv.offer_id})`
      );

      // Mark paid
      await (admin as AnySupabase)
        .from("affiliate_conversions")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", conv.id);

      // Record transactions
      await (admin as AnySupabase)
        .from("wallet_transactions")
        .insert([
          {
            user_id: sellerId,
            type: "affiliate_payout",
            amount_sats: -conv.commission_sats,
            balance_after: 0,
            status: "completed",
          },
          {
            user_id: conv.affiliate_id,
            type: "affiliate_commission",
            amount_sats: conv.commission_sats,
            balance_after: 0,
            status: "completed",
          },
        ]);

      paid++;
      console.log(`[Affiliate Payouts] Paid ${conv.commission_sats} sats for conversion ${conv.id}`);
    } catch (err: any) {
      errors.push(`${conv.id}: ${err.message}`);
      failed++;
    }
  }

  console.log(`[Affiliate Payouts] Done: ${paid} paid, ${failed} failed`);
  return NextResponse.json({ paid, failed, errors: errors.length > 0 ? errors : undefined });
}
