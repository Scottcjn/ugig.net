import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserLnWallet, getLnBalance, syncBalanceCache } from "@/lib/lightning/wallet-utils";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createServiceClient();
    const userId = auth.user.id;

    // Look up user's LNbits wallet
    const lnWallet = await getUserLnWallet(admin, userId);
    if (!lnWallet) {
      // No LNbits wallet yet — ensure Supabase cache exists and return 0
      await syncBalanceCache(admin, userId, 0);
      return NextResponse.json({ balance_sats: 0 });
    }

    // Get real balance from LNbits
    const balance_sats = await getLnBalance(lnWallet.invoice_key);

    // Update Supabase cache
    await syncBalanceCache(admin, userId, balance_sats);

    return NextResponse.json({ balance_sats });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
