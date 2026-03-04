#!/usr/bin/env npx tsx
/**
 * Backfill LNbits wallets for existing users who don't have one yet.
 * 
 * Usage: npx tsx scripts/backfill-ln-wallets.ts
 * 
 * Requires: LNBITS_URL, LNBITS_ADMIN_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const LNBITS_URL = process.env.LNBITS_URL || "https://ln.coinpayportal.com";
const LNBITS_ADMIN_KEY = process.env.LNBITS_ADMIN_KEY || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function createWallet(username: string) {
  // Create wallet
  const res = await fetch(`${LNBITS_URL}/api/v1/account`, {
    method: "POST",
    headers: { "X-Api-Key": LNBITS_ADMIN_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ name: `ugig-${username}` }),
  });

  if (!res.ok) {
    console.error(`  [FAIL] Wallet creation failed: ${await res.text()}`);
    return null;
  }

  const wallet = await res.json();

  // Wait for extensions to be available on new wallet
  await new Promise((r) => setTimeout(r, 3000));

  // Create pay link (with retry)
  let payRes = await fetch(`${LNBITS_URL}/lnurlp/api/v1/links`, {
    method: "POST",
    headers: { "X-Api-Key": wallet.adminkey, "Content-Type": "application/json" },
    body: JSON.stringify({
      description: `ugig.net wallet for ${username}`,
      min: 1,
      max: 10000000,
      comment_chars: 255,
      username: `${username}-ugig`,
    }),
  });

  // Retry once after longer delay if extension not ready
  if (!payRes.ok) {
    const errCheck = await payRes.text();
    if (errCheck.includes("not enabled")) {
      await new Promise((r) => setTimeout(r, 5000));
      payRes = await fetch(`${LNBITS_URL}/lnurlp/api/v1/links`, {
        method: "POST",
        headers: { "X-Api-Key": wallet.adminkey, "Content-Type": "application/json" },
        body: JSON.stringify({
          description: `ugig.net wallet for ${username}`,
          min: 1,
          max: 10000000,
          comment_chars: 255,
          username: `${username}-ugig`,
        }),
      });
    }
  }

  let ln_address = "";
  if (payRes.ok) {
    ln_address = `${username}-ugig@coinpayportal.com`;
  } else {
    let errText = "";
    try { errText = await payRes.text(); } catch {}
    if (errText.includes("already") || errText.includes("unique")) {
      ln_address = `${username}-ugig@coinpayportal.com`;
      console.log(`  [WARN] Pay link already exists, reusing`);
    } else {
      console.error(`  [WARN] Pay link failed: ${errText}`);
    }
  }

  return { wallet_id: wallet.id, admin_key: wallet.adminkey, invoice_key: wallet.inkey || wallet.adminkey, ln_address };
}

async function main() {
  console.log("Fetching users without LN wallets...\n");

  // Get all profiles with usernames
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, username, ln_address")
    .not("username", "is", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch profiles:", error);
    process.exit(1);
  }

  // Get existing wallet user_ids
  const { data: existingWallets } = await supabase
    .from("user_ln_wallets" as any)
    .select("user_id") as any;

  const hasWallet = new Set((existingWallets || []).map((w: any) => w.user_id));

  const needsWallet = (profiles || []).filter((p) => p.username && !hasWallet.has(p.id) && !(p.ln_address && p.ln_address.includes("-ugig@")));

  console.log(`Total profiles: ${profiles?.length || 0}`);
  console.log(`Already have wallet: ${hasWallet.size}`);
  console.log(`Need wallet: ${needsWallet.length}\n`);

  let created = 0;
  let failed = 0;

  for (const profile of needsWallet) {
    console.log(`[${created + failed + 1}/${needsWallet.length}] Creating wallet for ${profile.username}...`);

    try {
      const result = await createWallet(profile.username);
      if (!result) {
        failed++;
        continue;
      }

      // Store wallet credentials
      const { error: insertErr } = await supabase
        .from("user_ln_wallets" as any)
        .upsert({
          user_id: profile.id,
          wallet_id: result.wallet_id,
          admin_key: result.admin_key,
          invoice_key: result.invoice_key,
        }, { onConflict: "user_id" }) as any;

      if (insertErr) {
        console.error(`  [FAIL] DB insert failed:`, insertErr);
        failed++;
        continue;
      }

      // Update ln_address if not already set or if it's the old format
      if (!profile.ln_address || !profile.ln_address.includes("-ugig@")) {
        await supabase
          .from("profiles" as any)
          .update({ ln_address: result.ln_address } as any)
          .eq("id", profile.id);
      }

      console.log(`  [OK] ${result.ln_address} (wallet: ${result.wallet_id.slice(0, 8)}...)`);
      created++;
    } catch (err) {
      console.error(`  [FAIL] Error:`, err);
      failed++;
    }
  }

  console.log(`\nDone! Created: ${created}, Failed: ${failed}, Skipped: ${hasWallet.size}`);
}

main();
