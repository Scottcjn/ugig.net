import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const target_type = url.searchParams.get("target_type");
    const target_id = url.searchParams.get("target_id");
    if (!target_type || !target_id) {
      return NextResponse.json({ error: "target_type and target_id required" }, { status: 400 });
    }

    const admin = createServiceClient();
    const { data: zaps } = await admin
      .from("zaps" as any)
      .select("id, sender_id, amount_sats, fee_sats, note, created_at")
      .eq("target_type", target_type)
      .eq("target_id", target_id)
      .order("created_at", { ascending: false }) as any;

    const total_sats = (zaps || []).reduce((sum: number, z: any) => sum + z.amount_sats, 0);
    return NextResponse.json({ zaps: zaps || [], total_sats, zap_count: (zaps || []).length });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
