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
import 'dotenv/config';

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
