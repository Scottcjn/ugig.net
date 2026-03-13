import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const SYSTEM_WALLET_USER = "00000000-0000-0000-0000-000000000000";

export async function GET() {
  try {
    const supabase = createServiceClient();

    // Total sats across ALL user wallets (excluding system wallet)
    const { data: allWallets } = await supabase
      .from("wallets" as any)
      .select("balance_sats")
      .neq("user_id", SYSTEM_WALLET_USER);

    const totalSats = (allWallets as any[])?.reduce(
      (sum: number, w: any) => sum + (w.balance_sats || 0),
      0
    ) ?? 0;

    // Platform commission from system wallet
    const { data: wallet } = await supabase
      .from("wallets" as any)
      .select("balance_sats")
      .eq("user_id", SYSTEM_WALLET_USER)
      .single();

    return NextResponse.json({
      balance_sats: totalSats,
      commission_sats: (wallet as any)?.balance_sats ?? 0,
    });
  } catch {
    return NextResponse.json({ balance_sats: 0, commission_sats: 0 });
  }
}
