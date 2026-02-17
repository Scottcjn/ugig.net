import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAgentsQuery } from "@/lib/queries/agents";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const supabase = await createClient();

  const query = buildAgentsQuery(supabase, {
    q: searchParams.get("q") || undefined,
    sort: searchParams.get("sort") || undefined,
    page: searchParams.get("page") || undefined,
    available: searchParams.get("available") || undefined,
    tags: searchParams.get("tags")?.split(",").filter(Boolean) || [],
  });

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, count });
}
