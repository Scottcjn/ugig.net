#!/usr/bin/env -S npx tsx
/**
 * Send email notifications to all users who have exactly 3 sats (were just seeded).
 * Usage: ./scripts/notify-wallet-seed.ts
 */
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import 'dotenv/config';

const FROM_EMAIL = process.env.FROM_EMAIL || 'notifications@ugig.net';

function buildEmail(name: string) {
  return {
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <div style="font-size: 48px; margin-bottom: 10px;">⚡</div>
    <h1 style="color: white; margin: 0; font-size: 24px;">You've Got Sats!</h1>
  </div>
  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin-top: 0;">Hi ${name},</p>
    <p>We've deposited <strong>3 sats</strong> into your ugig.net wallet to get you started with zaps! ⚡</p>
    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="font-size: 32px; font-weight: bold; color: #f59e0b; margin: 0;">3 sats</p>
      <p style="color: #6b7280; margin: 5px 0 0 0;">Available in your wallet</p>
    </div>
    <p><strong>What are zaps?</strong> Zaps let you tip other users for great gigs, helpful posts, and quality work. It's a way to show appreciation using Bitcoin's Lightning Network.</p>
    <p>Try it out — find a post or gig you like and hit the ⚡ zap button!</p>
    <div style="text-align: center; margin: 25px 0;">
      <a href="https://ugig.net/settings/wallet" style="display: inline-block; background: #f59e0b; color: white; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">View Your Wallet</a>
    </div>
    <p style="color: #6b7280; font-size: 14px;">You can deposit more sats anytime from your <a href="https://ugig.net/settings/wallet" style="color: #667eea;">wallet settings</a>.</p>
  </div>
  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">ugig.net - AI-Powered Gig Marketplace</p>
  </div>
</body></html>`,
    text: `Hi ${name},\n\nWe deposited 3 sats into your ugig.net wallet to get you started with zaps! ⚡\n\nWhat are zaps? Zaps let you tip other users for great gigs, helpful posts, and quality work.\n\nTry it out — find a post or gig you like and hit the ⚡ zap button!\n\nView your wallet: https://ugig.net/settings/wallet\n\n---\nugig.net - AI-Powered Gig Marketplace`,
  };
}

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const resend = new Resend(process.env.RESEND_API_KEY!);

  const { data: wallets } = await supabase.from('wallets' as any).select('user_id').eq('balance_sats', 3);
  const userIds = (wallets as any[] || []).map((w: any) => w.user_id);
  console.log(`Found ${userIds.length} users with 3 sats`);
  if (!userIds.length) return;

  const { data: profiles } = await supabase.from('profiles').select('id, username, full_name').in('id', userIds);

  const emailMap = new Map<string, string>();
  let page = 1;
  while (true) {
    const { data: { users } } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (!users?.length) break;
    for (const u of users) { if (u.email) emailMap.set(u.id, u.email); }
    if (users.length < 1000) break;
    page++;
  }
  console.log(`Found ${emailMap.size} auth emails`);

  let sent = 0, skipped = 0, failed = 0;
  for (const profile of profiles || []) {
    const email = emailMap.get(profile.id);
    if (!email) { skipped++; continue; }
    const name = profile.full_name || profile.username || 'there';
    const { html, text } = buildEmail(name);
    try {
      await resend.emails.send({ from: FROM_EMAIL, to: email, subject: '⚡ You have 3 sats in your ugig.net wallet!', html, text });
      sent++;
      if (sent % 10 === 0) console.log(`  Sent ${sent}...`);
    } catch (err: any) {
      console.error(`  ✗ ${email}: ${err.message || err}`);
      failed++;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  console.log(`\n✓ Sent: ${sent}, Skipped (no email): ${skipped}, Failed: ${failed}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
