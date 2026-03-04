import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/zaps/stats?user_id=xxx - Public zap stats for a user
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("user_id");
  if (!userId) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: zaps } = await supabase
    .from("zaps" as any)
    .select("amount_sats, fee_sats")
    .eq("recipient_id", userId);

  const totalReceived = (zaps || []).reduce((sum: number, z: any) => sum + (z.amount_sats - (z.fee_sats || 0)), 0);
  const zapCount = (zaps || []).length;

  return NextResponse.json({ total_sats_received: totalReceived, zap_count: zapCount });
}
