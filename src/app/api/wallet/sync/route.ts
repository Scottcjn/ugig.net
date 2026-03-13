import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserLnWallet, getLnBalance, syncBalanceCache } from "@/lib/lightning/wallet-utils";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createServiceClient();
    const userId = auth.user.id;

    // Get user's LNbits wallet
    const lnWallet = await getUserLnWallet(admin, userId);
    if (!lnWallet) {
      return NextResponse.json({ synced: 0, message: "No Lightning wallet found" });
    }

    // Read real balance from LNbits and update Supabase cache
    const balance_sats = await getLnBalance(lnWallet.invoice_key);
    await syncBalanceCache(admin, userId, balance_sats);

    return NextResponse.json({ synced: 1, balance_sats });
  } catch (err) {
    console.error("Wallet sync error:", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
