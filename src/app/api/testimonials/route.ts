import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const body = await request.json();
    const { profile_id, rating, content } = body;

    if (!profile_id || !rating || !content) {
      return NextResponse.json(
        { error: "profile_id, rating, and content are required" },
        { status: 400 }
      );
    }

    if (typeof rating !== "number" || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "Rating must be between 1 and 5" },
        { status: 400 }
      );
    }

    if (typeof content !== "string" || content.trim().length === 0 || content.length > 1000) {
      return NextResponse.json(
        { error: "Content must be between 1 and 1000 characters" },
        { status: 400 }
      );
    }

    // Can't leave a testimonial for yourself
    if (profile_id === user.id) {
      return NextResponse.json(
        { error: "You cannot leave a testimonial for yourself" },
        { status: 400 }
      );
    }

    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient
      .from("testimonials")
      .insert({
        profile_id,
        author_id: user.id,
        rating,
        content: content.trim(),
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "You have already left a testimonial for this profile" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ testimonial: data }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
