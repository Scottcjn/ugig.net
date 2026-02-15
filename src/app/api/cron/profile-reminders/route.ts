import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail, profileReminderEmail } from "@/lib/email";

/**
 * Weekly cron: send profile completion reminders to users who:
 * - Have NOT completed their profile (profile_completed = false)
 * - Signed up at least 3 days ago
 * - Haven't received a reminder in the last 7 days
 *
 * Auth: requires CRON_SECRET header to prevent unauthorized calls.
 */
export async function POST(request: NextRequest) {
  try {
    const cronSecret = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace("Bearer ", "");
    if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Find users with incomplete profiles who signed up 3+ days ago
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: users, error } = await supabase
      .from("profiles")
      .select("id, username, full_name, created_at, reminder_sent_at")
      .eq("profile_completed", false)
      .lt("created_at", threeDaysAgo)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      console.error("[profile-reminders] Query error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    // Filter out users who received a reminder in the last 7 days
    const eligible = users.filter((u) => {
      if (!u.reminder_sent_at) return true;
      return new Date(u.reminder_sent_at) < new Date(sevenDaysAgo);
    });

    let sent = 0;
    let failed = 0;

    for (const user of eligible) {
      // Get user email from auth
      const { data: authData } = await supabase.auth.admin.getUserById(user.id);
      if (!authData?.user?.email) {
        continue;
      }

      const daysAgo = Math.floor(
        (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      const email = profileReminderEmail({
        name: user.full_name || user.username || "there",
        daysAgo,
      });

      try {
        await sendEmail({
          to: authData.user.email,
          ...email,
        });

        // Mark reminder sent
        await supabase
          .from("profiles")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", user.id);

        sent++;
      } catch (err) {
        console.error(`[profile-reminders] Failed to send to ${user.username}:`, err);
        failed++;
      }
    }

    console.log(`[profile-reminders] Sent ${sent}, failed ${failed}, skipped ${(users?.length || 0) - eligible.length}`);

    return NextResponse.json({
      sent,
      failed,
      total: users?.length || 0,
      eligible: eligible.length,
    });
  } catch (err) {
    console.error("[profile-reminders] Unexpected error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
