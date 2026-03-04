import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createServiceClient();
    const { data: wallet } = await admin
      .from("wallets" as any)
      .select("balance_sats")
      .eq("user_id", auth.user.id)
      .single() as any;

    if (wallet) {
      return NextResponse.json({ balance_sats: wallet.balance_sats });
    }

    await admin.from("wallets" as any).insert({ user_id: auth.user.id, balance_sats: 0 });
    return NextResponse.json({ balance_sats: 0 });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
