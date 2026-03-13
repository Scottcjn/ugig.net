import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserLnWallet, checkPayment, getLnBalance, syncBalanceCache } from "@/lib/lightning/wallet-utils";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createServiceClient();
    const userId = auth.user.id;

    // Get user's LNbits wallet
    const lnWallet = await getUserLnWallet(admin, userId);
    if (!lnWallet) {
      return NextResponse.json({ resolved: false, message: "No Lightning wallet found" });
    }

    // Find pending deposit transactions
    const { data: pending } = (await admin
      .from("wallet_transactions" as any)
      .select("id, bolt11, payment_hash, amount_sats")
      .eq("user_id", userId)
      .eq("type", "deposit")
      .eq("status", "pending")) as any;

    let totalCredited = 0;

    for (const tx of pending || []) {
      if (!tx.payment_hash) continue;

      // Check on the USER's wallet
      const { paid } = await checkPayment(lnWallet.invoice_key, tx.payment_hash);

      if (paid) {
        totalCredited += tx.amount_sats;
        await admin
          .from("wallet_transactions" as any)
          .update({ status: "completed" })
          .eq("id", tx.id);
      }
    }

    // Sync balance from LNbits (source of truth)
    const balance_sats = await getLnBalance(lnWallet.invoice_key);
    await syncBalanceCache(admin, userId, balance_sats);

    if (totalCredited > 0) {
      return NextResponse.json({
        resolved: true,
        credited_sats: totalCredited,
        balance_sats,
      });
    }

    return NextResponse.json({ resolved: false, message: "No paid invoices found to resolve" });
  } catch (err) {
    console.error("Deposit resolve error:", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
