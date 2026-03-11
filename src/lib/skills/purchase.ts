import { SupabaseClient } from "@supabase/supabase-js";
import { SKILL_FEE_RATES, PLATFORM_WALLET_USER_ID } from "@/lib/constants";

export interface PurchaseResult {
  ok: boolean;
  purchase_id?: string;
  fee_sats?: number;
  fee_rate?: number;
  new_balance?: number;
  error?: string;
}

/**
 * Determine the fee rate for a seller based on their subscription plan.
 */
export function getSellerFeeRate(plan: string | null | undefined): number {
  if (plan === "pro") return SKILL_FEE_RATES.pro;
  return SKILL_FEE_RATES.free;
}

/**
 * Calculate the fee in sats for a skill purchase.
 */
export function calculateSkillFee(priceSats: number, feeRate: number): number {
  return Math.floor(priceSats * feeRate);
}

/**
 * Execute a skill purchase using wallet ledger.
 * Runs as service role — caller must authorize.
 */
export async function executeSkillPurchase(
  admin: SupabaseClient,
  params: {
    buyerId: string;
    sellerId: string;
    listingId: string;
    priceSats: number;
    sellerPlan: string | null;
  }
): Promise<PurchaseResult> {
  const { buyerId, sellerId, listingId, priceSats, sellerPlan } = params;

  // Free skills: just create the purchase record, no wallet flow
  if (priceSats === 0) {
    const { data: purchase, error } = await admin
      .from("skill_purchases" as any)
      .insert({
        listing_id: listingId,
        buyer_id: buyerId,
        seller_id: sellerId,
        price_sats: 0,
        fee_sats: 0,
        fee_rate: 0,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") return { ok: false, error: "Already purchased" };
      return { ok: false, error: error.message };
    }

    return { ok: true, purchase_id: (purchase as any).id, fee_sats: 0, fee_rate: 0 };
  }

  // Paid skills: wallet flow
  const feeRate = getSellerFeeRate(sellerPlan);
  const feeSats = calculateSkillFee(priceSats, feeRate);
  const sellerAmount = priceSats - feeSats;

  // Check buyer balance
  const { data: buyerWallet } = await admin
    .from("wallets" as any)
    .select("balance_sats")
    .eq("user_id", buyerId)
    .single();

  const buyerBalance = (buyerWallet as any)?.balance_sats ?? 0;
  if (buyerBalance < priceSats) {
    return { ok: false, error: "Insufficient balance" };
  }

  // Deduct from buyer
  const newBuyerBalance = buyerBalance - priceSats;
  await admin
    .from("wallets" as any)
    .update({ balance_sats: newBuyerBalance, updated_at: new Date().toISOString() })
    .eq("user_id", buyerId);

  // Credit seller
  const { data: sellerWallet } = await admin
    .from("wallets" as any)
    .select("balance_sats")
    .eq("user_id", sellerId)
    .single();

  let newSellerBalance: number;
  if (sellerWallet) {
    newSellerBalance = ((sellerWallet as any).balance_sats ?? 0) + sellerAmount;
    await admin
      .from("wallets" as any)
      .update({ balance_sats: newSellerBalance, updated_at: new Date().toISOString() })
      .eq("user_id", sellerId);
  } else {
    newSellerBalance = sellerAmount;
    await admin
      .from("wallets" as any)
      .insert({ user_id: sellerId, balance_sats: newSellerBalance });
  }

  // Credit platform fee
  let newPlatformBalance = 0;
  if (feeSats > 0) {
    const { data: platformWallet } = await admin
      .from("wallets" as any)
      .select("balance_sats")
      .eq("user_id", PLATFORM_WALLET_USER_ID)
      .single();

    if (platformWallet) {
      newPlatformBalance = ((platformWallet as any).balance_sats ?? 0) + feeSats;
      await admin
        .from("wallets" as any)
        .update({ balance_sats: newPlatformBalance, updated_at: new Date().toISOString() })
        .eq("user_id", PLATFORM_WALLET_USER_ID);
    } else {
      newPlatformBalance = feeSats;
      await admin
        .from("wallets" as any)
        .insert({ user_id: PLATFORM_WALLET_USER_ID, balance_sats: newPlatformBalance });
    }
  }

  // Create purchase record
  const { data: purchase, error: purchaseError } = await admin
    .from("skill_purchases" as any)
    .insert({
      listing_id: listingId,
      buyer_id: buyerId,
      seller_id: sellerId,
      price_sats: priceSats,
      fee_sats: feeSats,
      fee_rate: feeRate,
    })
    .select("id")
    .single();

  if (purchaseError) {
    // Rollback: ideally use a DB transaction. For MVP, log the error.
    console.error("Purchase insert failed after wallet ops:", purchaseError);
    if (purchaseError.code === "23505") return { ok: false, error: "Already purchased" };
    return { ok: false, error: purchaseError.message };
  }

  const purchaseId = (purchase as any).id;

  // Record wallet transactions
  const txns: any[] = [
    {
      user_id: buyerId,
      type: "skill_purchase",
      amount_sats: priceSats,
      balance_after: newBuyerBalance,
      reference_id: purchaseId,
      status: "completed",
    },
    {
      user_id: sellerId,
      type: "skill_sale",
      amount_sats: sellerAmount,
      balance_after: newSellerBalance,
      reference_id: purchaseId,
      status: "completed",
    },
  ];
  if (feeSats > 0) {
    txns.push({
      user_id: PLATFORM_WALLET_USER_ID,
      type: "skill_sale_fee",
      amount_sats: feeSats,
      balance_after: newPlatformBalance,
      reference_id: purchaseId,
      status: "completed",
    });
  }
  await admin.from("wallet_transactions" as any).insert(txns);

  return {
    ok: true,
    purchase_id: purchaseId,
    fee_sats: feeSats,
    fee_rate: feeRate,
    new_balance: newBuyerBalance,
  };
}
