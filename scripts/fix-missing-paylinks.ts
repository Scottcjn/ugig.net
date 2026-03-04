#!/usr/bin/env npx tsx
/**
 * Fix existing LN wallets that are missing pay links.
 * Finds users with user_ln_wallets but no ln_address containing -ugig@
 */
import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const LNBITS_URL = process.env.LNBITS_URL || "https://ln.coinpayportal.com";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const { data: wallets } = await supabase.from("user_ln_wallets" as any).select("user_id, admin_key, wallet_id") as any;
  if (!wallets?.length) { console.log("No wallets found"); return; }

  let fixed = 0;
  for (const w of wallets) {
    const { data: profile } = await supabase.from("profiles").select("username, ln_address").eq("id", w.user_id).single();
    if (!profile?.username) continue;
    if (profile.ln_address?.includes("-ugig@")) { continue; } // already has pay link

    console.log(`Fixing ${profile.username}...`);

    // Enable lnurlp and wait
    const start = Date.now();
    let extReady = false;
    while (Date.now() - start < 15000) {
      const check = await fetch(`${LNBITS_URL}/lnurlp/api/v1/links`, {
        headers: { "X-Api-Key": w.admin_key },
      });
      if (check.status === 200) { extReady = true; break; }
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (!extReady) {
      console.log("  [FAIL] lnurlp not enabled after 15s");
      continue;
    }

    // Try creating pay link
    const res = await fetch(`${LNBITS_URL}/lnurlp/api/v1/links`, {
      method: "POST",
      headers: { "X-Api-Key": w.admin_key, "Content-Type": "application/json" },
      body: JSON.stringify({
        description: `ugig.net wallet for ${profile.username.toLowerCase()}`,
        min: 1, max: 10000000, comment_chars: 255,
        username: `${profile.username.toLowerCase()}-ugig`,
      }),
    });

    if (res.ok || (await res.text()).includes("already")) {
      const ln_address = `${profile.username.toLowerCase()}-ugig@coinpayportal.com`;
      await supabase.from("profiles" as any).update({ ln_address } as any).eq("id", w.user_id);
      console.log(`  [OK] ${ln_address}`);
      fixed++;
    } else {
      console.log(`  [FAIL] Could not create pay link`);
    }
  }
  console.log(`\nFixed: ${fixed}/${wallets.length}`);
}

main();
