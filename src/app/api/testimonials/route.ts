import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail } from "@/lib/email";

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

    // Send notification + email to profile owner
    try {
      // Get author profile
      const { data: authorProfile } = await serviceClient
        .from("profiles")
        .select("full_name, username")
        .eq("id", user.id)
        .single();

      const authorName = authorProfile?.full_name || authorProfile?.username || "Someone";
      const stars = "★".repeat(rating) + "☆".repeat(5 - rating);

      // In-app notification
      await serviceClient.from("notifications").insert({
        user_id: profile_id,
        type: "testimonial",
        title: `${authorName} left you a ${rating}-star testimonial`,
        message: content.trim().slice(0, 200),
        link: "/dashboard/testimonials",
      });

      // Email notification
      const { data: profileOwnerAuth } = await serviceClient.auth.admin.getUserById(profile_id);
      const ownerEmail = profileOwnerAuth?.user?.email;

      if (ownerEmail) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";
        await sendEmail({
          to: ownerEmail,
          subject: `${authorName} left you a ${rating}-star testimonial on ugig.net`,
          html: `
            <div style="font-family: sans-serif; max-width: 500px;">
              <h2>New Testimonial ${stars}</h2>
              <p><strong>${authorName}</strong> left you a ${rating}-star testimonial:</p>
              <blockquote style="border-left: 3px solid #6366f1; padding-left: 12px; color: #555; margin: 16px 0;">
                "${content.trim()}"
              </blockquote>
              <p>
                <a href="${baseUrl}/dashboard/testimonials" style="display: inline-block; padding: 10px 20px; background: #6366f1; color: white; text-decoration: none; border-radius: 6px;">
                  Review & Approve
                </a>
              </p>
              <p style="color: #888; font-size: 13px;">
                Testimonials appear on your profile after you approve them.
              </p>
            </div>
          `,
          text: `${authorName} left you a ${rating}-star testimonial: "${content.trim()}"\n\nReview it at ${baseUrl}/dashboard/testimonials`,
        });
      }
    } catch (notifyErr) {
      // Don't fail the request if notification fails
      console.error("Failed to send testimonial notification:", notifyErr);
    }

    return NextResponse.json({ testimonial: data }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
