import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, createServiceClient } from "@/lib/auth/get-user";

const updateListingSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  description: z.string().max(500).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  logo_url: z.string().url().nullable().optional(),
  status: z.enum(["active", "hidden"]).optional(),
});

/**
 * GET /api/directory/[id] - Get a single project listing
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: listing, error } = await supabase
      .from("project_listings" as any)
      .select(
        `*, user:profiles!user_id (id, username, full_name, avatar_url)`
      )
      .eq("id", id)
      .single();

    if (error || !listing) {
      return NextResponse.json(
        { error: "Listing not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ listing });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/directory/[id] - Update own listing
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const admin = createServiceClient();

    // Verify ownership
    const { data: existing } = await admin
      .from("project_listings" as any)
      .select("id, user_id")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: "Listing not found" },
        { status: 404 }
      );
    }
    if ((existing as any).user_id !== auth.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rawBody = await request.json();
    const parsed = updateListingSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const updates: Record<string, any> = {
      ...parsed.data,
      updated_at: new Date().toISOString(),
    };

    const { data: listing, error } = await admin
      .from("project_listings" as any)
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ listing });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/directory/[id] - Delete own listing (no refund)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const admin = createServiceClient();

    // Verify ownership
    const { data: existing } = await admin
      .from("project_listings" as any)
      .select("id, user_id")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: "Listing not found" },
        { status: 404 }
      );
    }
    if ((existing as any).user_id !== auth.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await admin
      .from("project_listings" as any)
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
