import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserLnWallet, checkPayment, getLnBalance, syncBalanceCache } from "@/lib/lightning/wallet-utils";
import { getUserDid, onWalletDeposit } from "@/lib/reputation-hooks";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payment_hash = new URL(request.url).searchParams.get("payment_hash");
    if (!payment_hash) {
      return NextResponse.json({ error: "payment_hash required" }, { status: 400 });
    }

    const admin = createServiceClient();
    const userId = auth.user.id;

    // Get user's LNbits wallet
    const lnWallet = await getUserLnWallet(admin, userId);
    if (!lnWallet) {
      return NextResponse.json({ paid: false });
    }

    // Check payment status on the USER's wallet
    const { paid, amount_sats } = await checkPayment(lnWallet.invoice_key, payment_hash);
    if (!paid) {
      return NextResponse.json({ paid: false });
    }

    // Idempotency — check if already credited
    const { data: byHash } = (await admin
      .from("wallet_transactions" as any)
      .select("id")
      .eq("user_id", userId)
      .eq("type", "deposit")
      .eq("status", "completed")
      .eq("payment_hash", payment_hash)
      .single()) as any;

    // Get real balance from LNbits (source of truth)
    const balance_sats = await getLnBalance(lnWallet.invoice_key);

    if (byHash) {
      // Already credited — just sync cache and return
      await syncBalanceCache(admin, userId, balance_sats);
      return NextResponse.json({ paid: true, balance_sats });
    }

    // Update Supabase cache with real LNbits balance
    await syncBalanceCache(admin, userId, balance_sats);

    // Mark pending transaction as completed
    const { data: updated } = (await admin
      .from("wallet_transactions" as any)
      .update({ status: "completed", balance_after: balance_sats, payment_hash })
      .eq("user_id", userId)
      .eq("type", "deposit")
      .eq("status", "pending")
      .eq("payment_hash", payment_hash)
      .select("id")) as any;

    if (!updated?.length) {
      // Try matching by bolt11 as fallback
      await admin
        .from("wallet_transactions" as any)
        .update({ status: "completed", balance_after: balance_sats, payment_hash })
        .eq("user_id", userId)
        .eq("type", "deposit")
        .eq("status", "pending");
    }

    // DID reputation for deposit
    const userDid = await getUserDid(admin, userId);
    if (userDid) onWalletDeposit(userDid, amount_sats);

    return NextResponse.json({ paid: true, balance_sats });
  } catch (err) {
    console.error("Deposit check error:", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
