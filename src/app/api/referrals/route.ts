import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

// GET /api/referrals - List my referrals
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const { data: referrals, error } = await (supabase as AnySupabase)
      .from("referrals")
      .select("*")
      .eq("referrer_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const total = referrals?.length || 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registered = referrals?.filter((r: any) => r.status !== "pending").length || 0;

    return NextResponse.json({
      data: referrals,
      stats: {
        total_invited: total,
        total_registered: registered,
        conversion_rate: total > 0 ? Math.round((registered / total) * 100) : 0,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// POST /api/referrals - Send invites
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const body = await request.json();
    const { emails } = body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json(
        { error: "Please provide an array of emails" },
        { status: 400 }
      );
    }

    if (emails.length > 20) {
      return NextResponse.json(
        { error: "Maximum 20 invites at a time" },
        { status: 400 }
      );
    }

    // Spam throttling: max 50 invites per day, max 10 per hour
    const svc = createServiceClient();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { count: hourlyCount } = await (svc as AnySupabase)
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("referrer_id", user.id)
      .gte("created_at", oneHourAgo);

    if ((hourlyCount ?? 0) + emails.length > 10) {
      return NextResponse.json(
        { error: "Too many invites. Max 10 per hour." },
        { status: 429 }
      );
    }

    const { count: dailyCount } = await (svc as AnySupabase)
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("referrer_id", user.id)
      .gte("created_at", oneDayAgo);

    if ((dailyCount ?? 0) + emails.length > 50) {
      return NextResponse.json(
        { error: "Daily invite limit reached. Max 50 per day." },
        { status: 429 }
      );
    }

    // Prevent duplicate invites to same email
    const normalizedEmails = emails.map((e: string) => e.trim().toLowerCase());
    const { data: existingInvites } = await (svc as AnySupabase)
      .from("referrals")
      .select("referred_email")
      .eq("referrer_id", user.id)
      .in("referred_email", normalizedEmails);

    const alreadyInvited = new Set((existingInvites || []).map((r: any) => r.referred_email));
    const newEmails = normalizedEmails.filter((e: string) => !alreadyInvited.has(e));

    if (newEmails.length === 0) {
      return NextResponse.json(
        { error: "All these emails have already been invited" },
        { status: 400 }
      );
    }

    // Get user's referral code
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("referral_code, username")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const referralCode = profile.referral_code || profile.username;

    // Validate emails and create referrals
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validEmails = newEmails.filter((e: string) => emailRegex.test(e));

    if (validEmails.length === 0) {
      return NextResponse.json(
        { error: "No valid email addresses provided" },
        { status: 400 }
      );
    }

    const referralRows = validEmails.map((email: string) => ({
      referrer_id: user.id,
      referred_email: email.trim().toLowerCase(),
      referral_code: referralCode,
      status: "pending" as const,
    }));

    const { data: referrals, error } = await (supabase as AnySupabase)
      .from("referrals")
      .insert(referralRows)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      message: `${validEmails.length} invite(s) created`,
      data: referrals,
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
