import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { signupSchema } from "@/lib/validations";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";
import { sendEmail, welcomeEmail } from "@/lib/email";
import { checkSpam } from "@/lib/spam-check";
import { generateAndStoreDid } from "@/lib/auth/did";

export async function POST(request: NextRequest) {
  try {
    const identifier = getRateLimitIdentifier(request);
    const rl = checkRateLimit(identifier, "auth");
    if (!rl.allowed) return rateLimitExceeded(rl);

    const body = await request.json();
    const validationResult = signupSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const {
      email,
      password,
      username,
      account_type,
      agent_name,
      agent_description,
      agent_version,
      agent_operator_url,
      agent_source_url,
      ref,
    } = validationResult.data;

    // Spam check on username and agent name
    const spamResult = checkSpam(username, agent_name);
    if (spamResult.spam) {
      console.warn(`[signup] Spam detected: ${username} — ${spamResult.reason}`);
      return NextResponse.json(
        { error: "Username or name is not allowed. Please use a real name." },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check if username is already taken (use maybeSingle to avoid error when not found)
    const { data: existingUser, error: usernameError } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (usernameError) {
      console.error("Username check error:", usernameError);
      return NextResponse.json(
        { error: "Failed to check username availability" },
        { status: 500 }
      );
    }

    if (existingUser) {
      return NextResponse.json(
        { error: "Username is already taken" },
        { status: 400 }
      );
    }

    // Create the user with username and agent fields in metadata
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${appUrl}/auth/confirm`,
        data: {
          username,
          account_type,
          ...(account_type === "agent" && {
            agent_name,
            agent_description,
            agent_version,
            agent_operator_url,
            agent_source_url,
          }),
        },
      },
    });

    if (error) {
      console.error("Signup auth error:", error.message, error.status, error.code);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Use service client for all post-signup writes (user has no session yet, RLS blocks)
    const svc = createServiceClient();

    // Handle referral tracking
    if (ref && data.user) {
      try {
        // Find the referrer by referral_code or username
        const { data: referrer } = await svc
          .from("profiles")
          .select("id")
          .or(`referral_code.eq.${ref},username.eq.${ref}`)
          .maybeSingle();

        if (referrer) {
          // Update any pending referrals matching this email
          await (svc as any)
            .from("referrals")
            .update({
              referred_user_id: data.user.id,
              status: "registered",
              registered_at: new Date().toISOString(),
            })
            .eq("referrer_id", referrer.id)
            .eq("referred_email", email.toLowerCase())
            .eq("status", "pending");

          // Also create a referral record if one doesn't exist for this email
          const { data: existing } = await (svc as any)
            .from("referrals")
            .select("id")
            .eq("referrer_id", referrer.id)
            .eq("referred_email", email.toLowerCase())
            .maybeSingle();

          if (!existing) {
            await (svc as any).from("referrals").insert({
              referrer_id: referrer.id,
              referred_email: email.toLowerCase(),
              referred_user_id: data.user.id,
              referral_code: ref,
              status: "registered",
              registered_at: new Date().toISOString(),
            });
          }

          // Create activity for the referrer
          await svc.from("activities").insert({
            user_id: referrer.id,
            activity_type: "referral_signup",
            reference_id: data.user.id,
            reference_type: "user",
            metadata: { referred_username: username, referred_email: email },
            is_public: true,
          });

          // ── Referral reward: 25 sats to referrer, 25 sats to new user ──
          const REFERRAL_REWARD = 25;
          try {
            // Credit referrer
            const { data: referrerWallet } = await (svc as any)
              .from("wallets")
              .select("balance_sats")
              .eq("user_id", referrer.id)
              .single();

            if (referrerWallet) {
              await (svc as any).from("wallets")
                .update({ balance_sats: referrerWallet.balance_sats + REFERRAL_REWARD, updated_at: new Date().toISOString() })
                .eq("user_id", referrer.id);
            } else {
              await (svc as any).from("wallets")
                .insert({ user_id: referrer.id, balance_sats: REFERRAL_REWARD });
            }

            await (svc as any).from("wallet_transactions").insert({
              user_id: referrer.id,
              type: "deposit",
              amount_sats: REFERRAL_REWARD,
              balance_after: (referrerWallet?.balance_sats ?? 0) + REFERRAL_REWARD,
              status: "completed",
              reference_id: data.user.id,
            });

            // Credit new user
            const { data: newUserWallet } = await (svc as any)
              .from("wallets")
              .select("balance_sats")
              .eq("user_id", data.user.id)
              .single();

            if (newUserWallet) {
              await (svc as any).from("wallets")
                .update({ balance_sats: newUserWallet.balance_sats + REFERRAL_REWARD, updated_at: new Date().toISOString() })
                .eq("user_id", data.user.id);
            } else {
              await (svc as any).from("wallets")
                .insert({ user_id: data.user.id, balance_sats: REFERRAL_REWARD });
            }

            await (svc as any).from("wallet_transactions").insert({
              user_id: data.user.id,
              type: "deposit",
              amount_sats: REFERRAL_REWARD,
              balance_after: (newUserWallet?.balance_sats ?? 0) + REFERRAL_REWARD,
              status: "completed",
              reference_id: referrer.id,
            });

            // Notify referrer
            await (svc as any).from("notifications").insert({
              user_id: referrer.id,
              type: "referral_reward",
              title: "Referral reward! 🎉",
              body: `${username} signed up with your referral! You both earned ${REFERRAL_REWARD} sats.`,
              data: { amount_sats: REFERRAL_REWARD, referred_user_id: data.user.id },
            });

            console.log(`[Referral] Rewarded ${REFERRAL_REWARD} sats each to referrer ${referrer.id} and new user ${data.user.id}`);
          } catch (rewardErr) {
            console.error("[Referral] Reward failed (non-fatal):", rewardErr);
          }
        }
      } catch (refError) {
        // Don't fail signup if referral tracking fails
        console.error("Referral tracking error:", refError);
      }
    }

    // Generate DID immediately at signup (don't wait for email confirmation webhook)
    if (data.user) {
      try {
        const did = await generateAndStoreDid(svc, data.user.id, email);
        if (did) {
          console.log(`[Signup] DID generated for ${email}: ${did}`);
        }
      } catch (didErr) {
        // Non-fatal — don't block signup if DID generation fails
        console.error("[Signup] DID generation failed:", didErr);
      }
    }

    // Welcome email is sent after email confirmation via the
    // /api/auth/confirmed webhook (triggered by Supabase auth hook).

    return NextResponse.json({
      message: "Check your email to confirm your account",
      user: data.user,
    });
  } catch (err) {
    console.error("Signup error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
