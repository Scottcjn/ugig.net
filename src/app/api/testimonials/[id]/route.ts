import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;
    const { id } = await params;

    const body = await request.json();
    const { status } = body;

    if (!status || !["approved", "rejected"].includes(status)) {
      return NextResponse.json(
        { error: "Status must be 'approved' or 'rejected'" },
        { status: 400 }
      );
    }

    const serviceClient = createServiceClient();

    // First fetch the testimonial to check ownership
    const { data: testimonial, error: fetchError } = await serviceClient
      .from("testimonials")
      .select("id, profile_id, gig_id")
      .eq("id", id)
      .single();

    if (fetchError || !testimonial) {
      return NextResponse.json(
        { error: "Testimonial not found" },
        { status: 404 }
      );
    }

    // Check permission: profile owner for profile testimonials, gig poster for gig testimonials
    let hasPermission = false;
    if (testimonial.profile_id && testimonial.profile_id === user.id) {
      hasPermission = true;
    } else if (testimonial.gig_id) {
      const { data: gig } = await serviceClient
        .from("gigs")
        .select("poster_id")
        .eq("id", testimonial.gig_id)
        .single();
      if (gig && gig.poster_id === user.id) {
        hasPermission = true;
      }
    }

    if (!hasPermission) {
      return NextResponse.json(
        { error: "You don't have permission to manage this testimonial" },
        { status: 403 }
      );
    }

    const { data, error } = await serviceClient
      .from("testimonials")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Failed to update testimonial" },
        { status: 400 }
      );
    }

    return NextResponse.json({ testimonial: data });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;
    const { id } = await params;

    // RLS ensures only author can delete
    const { error } = await createServiceClient()
      .from("testimonials")
      .delete()
      .eq("id", id)
      .eq("author_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
