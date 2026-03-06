#!/usr/bin/env npx tsx
/**
 * Seed all existing users with 3 sats from a donor wallet.
 * 
 * Usage: npx tsx scripts/seed-wallets.ts
 * 
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * 
 * Donor: chovy@ugig.net (looked up by ln_address)
 */

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import 'dotenv/config';

const FROM_EMAIL = process.env.FROM_EMAIL || 'notifications@ugig.net';

const SEED_AMOUNT = 3;
const DONOR_LN_ADDRESS = 'chovy@ugig.net';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Find donor by ln_address
  const { data: donorProfile, error: donorErr } = await supabase
    .from('profiles')
    .select('id, username, ln_address')
    .eq('ln_address', DONOR_LN_ADDRESS)
    .single();

  if (donorErr || !donorProfile) {
    console.error('Donor not found:', DONOR_LN_ADDRESS);
    process.exit(1);
  }

  console.log(`Donor: @${donorProfile.username} (${donorProfile.id})`);

  // Get donor wallet
  const { data: donorWallet } = await supabase
    .from('wallets' as any)
    .select('balance_sats')
    .eq('user_id', donorProfile.id)
    .single();

  const donorBalance = (donorWallet as any)?.balance_sats ?? 0;
  console.log(`Donor balance: ${donorBalance} sats`);

  // Get all users except donor
  const { data: allUsers, error: usersErr } = await supabase
    .from('profiles')
    .select('id, username')
    .neq('id', donorProfile.id);

  if (usersErr || !allUsers) {
    console.error('Failed to fetch users:', usersErr);
    process.exit(1);
  }

  // Get users who already have a wallet with balance > 0
  const { data: existingWallets } = await supabase
    .from('wallets' as any)
    .select('user_id, balance_sats');

  const walletMap = new Map<string, number>();
  for (const w of (existingWallets as any[] || [])) {
    walletMap.set(w.user_id, w.balance_sats);
  }

  // Filter to users with 0 balance or no wallet
  const usersToSeed = allUsers.filter(u => {
    const balance = walletMap.get(u.id);
    return balance === undefined || balance === 0;
  });

  const totalCost = usersToSeed.length * SEED_AMOUNT;
  console.log(`\nUsers to seed: ${usersToSeed.length} (${totalCost} sats total)`);
  console.log(`Users skipped (already have balance): ${allUsers.length - usersToSeed.length}`);

  if (totalCost > donorBalance) {
    console.error(`Insufficient donor balance! Need ${totalCost}, have ${donorBalance}`);
    process.exit(1);
  }

  if (usersToSeed.length === 0) {
    console.log('No users need seeding. Done.');
    process.exit(0);
  }

  let seeded = 0;
  let failed = 0;

  for (const user of usersToSeed) {
    const existingBalance = walletMap.get(user.id);

    if (existingBalance !== undefined) {
      // Wallet exists, update balance
      const { error } = await supabase
        .from('wallets' as any)
        .update({ balance_sats: existingBalance + SEED_AMOUNT, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);

      if (error) {
        console.error(`  ✗ @${user.username}: ${error.message}`);
        failed++;
        continue;
      }
    } else {
      // No wallet, create one
      const { error } = await supabase
        .from('wallets' as any)
        .insert({ user_id: user.id, balance_sats: SEED_AMOUNT });

      if (error) {
        console.error(`  ✗ @${user.username}: ${error.message}`);
        failed++;
        continue;
      }
    }

    seeded++;
  }

  // Send notification emails
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
  if (resend) {
    console.log('\nSending notification emails...');
    let emailed = 0;
    let emailFailed = 0;

    // Get emails for seeded users
    const seededUserIds = usersToSeed.filter((_, i) => i < seeded).map(u => u.id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, full_name, email:auth_email')
      .in('id', seededUserIds);

    // Also try auth.users for emails
    const { data: { users: authUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const emailMap = new Map<string, string>();
    for (const u of authUsers || []) {
      if (u.email) emailMap.set(u.id, u.email);
    }

    for (const profile of profiles || []) {
      const email = emailMap.get(profile.id);
      if (!email) continue;

      const name = profile.full_name || profile.username || 'there';
      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: email,
          subject: '⚡ You have 3 sats in your ugig.net wallet!',
          html: \`
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <div style="font-size: 48px; margin-bottom: 10px;">⚡</div>
    <h1 style="color: white; margin: 0; font-size: 24px;">You've Got Sats!</h1>
  </div>
  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin-top: 0;">Hi \${name},</p>
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
</body>
</html>\`,
          text: \`Hi \${name},\n\nWe've deposited 3 sats into your ugig.net wallet to get you started with zaps!\n\nWhat are zaps? Zaps let you tip other users for great gigs, helpful posts, and quality work.\n\nTry it out — find a post or gig you like and hit the ⚡ zap button!\n\nView your wallet: https://ugig.net/settings/wallet\n\n---\nugig.net - AI-Powered Gig Marketplace\`,
        });
        emailed++;
      } catch (err) {
        emailFailed++;
      }

      // Rate limit: 2 emails/sec to avoid Resend limits
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(\`Emails sent: \${emailed}, failed: \${emailFailed}\`);
  } else {
    console.log('\nRESEND_API_KEY not set, skipping emails');
  }

  // Deduct from donor
  const newDonorBalance = donorBalance - (seeded * SEED_AMOUNT);
  await supabase
    .from('wallets' as any)
    .update({ balance_sats: newDonorBalance, updated_at: new Date().toISOString() })
    .eq('user_id', donorProfile.id);

  console.log(`\n✓ Seeded ${seeded} users with ${SEED_AMOUNT} sats each (${seeded * SEED_AMOUNT} sats total)`);
  if (failed > 0) console.log(`✗ Failed: ${failed}`);
  console.log(`Donor new balance: ${newDonorBalance} sats`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
