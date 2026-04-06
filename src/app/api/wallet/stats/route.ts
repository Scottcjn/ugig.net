import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { PLATFORM_WALLET_USER_ID } from "@/lib/constants";
import { getLnBalance } from "@/lib/lightning/wallet-utils";

/**
 * GET /api/wallet/stats — Platform wallet statistics
 * Requires admin auth (#81)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only allow the platform/admin user to view global stats (#81)
    if (auth.user.id !== PLATFORM_WALLET_USER_ID) {
      // Check if user is an admin
      const admin = createServiceClient();
      const { data: profile } = await admin
        .from("profiles")
        .select("role")
        .eq("id", auth.user.id)
        .single();

      if (!profile || (profile as any).role !== "admin") {
        return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
      }
    }

    const admin = createServiceClient();

    // Get platform wallet balance
    const { data: platformWallet } = await admin
      .from("lightning_wallets" as any)
      .select("invoice_key")
      .eq("user_id", PLATFORM_WALLET_USER_ID)
      .single();

    let balance_sats = 0;
    if (platformWallet) {
      balance_sats = await getLnBalance((platformWallet as any).invoice_key).catch(() => 0);
    }

    return NextResponse.json({ balance_sats });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
