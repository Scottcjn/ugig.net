/**
 * Migrate ugig.net Lightning Addresses from username-ugig@coinpayportal.com to username@ugig.net
 * 
 * This script:
 * 1. Fetches all ugig profiles with ln_address
 * 2. Updates LNBits pay link username from "username-ugig" to "username"
 * 3. Updates the ln_address in the ugig Supabase DB
 * 
 * Balances are NOT affected — they're on the LNBits wallet, not the pay link.
 * 
 * Usage: npx tsx scripts/migrate-ln-addresses.ts [--dry-run]
 */

const LNBITS_URL = process.env.LNBITS_URL || "https://ln.coinpayportal.com";
const LNBITS_ADMIN_KEY = process.env.LNBITS_ADMIN_KEY || "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  console.log(`Migration: username-ugig@coinpayportal.com → username@ugig.net`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}\n`);

  // Fetch all profiles with old ln_address format
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=id,username,ln_address&ln_address=like.*-ugig@coinpayportal.com&limit=500`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  const profiles = await res.json();
  console.log(`Found ${profiles.length} profiles to migrate\n`);

  // Also fetch user_ln_wallets to get admin keys for each user
  const walletsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/user_ln_wallets?select=user_id,wallet_id,admin_key&limit=500`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  const userWallets = await walletsRes.json();
  const walletMap = new Map<string, { wallet_id: string; admin_key: string }>();
  if (Array.isArray(userWallets)) {
    for (const w of userWallets) {
      walletMap.set(w.user_id, w);
    }
  }

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const profile of profiles) {
    const { id, username, ln_address } = profile;
    const oldLnUser = username.toLowerCase() + "-ugig";
    const newLnUser = username.toLowerCase();
    const newAddress = `${newLnUser}@ugig.net`;

    console.log(`[${username}] ${ln_address} → ${newAddress}`);

    if (dryRun) {
      success++;
      continue;
    }

    // Get user's LNBits admin key
    const wallet = walletMap.get(id);
    const adminKey = wallet?.admin_key || LNBITS_ADMIN_KEY;

    try {
      // Find the pay link on LNBits
      const linksRes = await fetch(`${LNBITS_URL}/lnurlp/api/v1/links`, {
        headers: { "X-Api-Key": adminKey },
      });

      if (!linksRes.ok) {
        console.log(`  ⚠ Cannot list pay links (using admin key): ${linksRes.status}`);
        // Try with global admin key
        const globalLinksRes = await fetch(`${LNBITS_URL}/lnurlp/api/v1/links`, {
          headers: { "X-Api-Key": LNBITS_ADMIN_KEY },
        });
        if (!globalLinksRes.ok) {
          console.log(`  ✗ Cannot list pay links with global key either`);
          failed++;
          continue;
        }
      }

      const links = await linksRes.json();
      const link = Array.isArray(links) ? links.find((l: any) => l.username === oldLnUser) : null;

      if (link) {
        // Update the pay link username
        const updateRes = await fetch(`${LNBITS_URL}/lnurlp/api/v1/links/${link.id}`, {
          method: "PUT",
          headers: {
            "X-Api-Key": adminKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...link,
            username: newLnUser,
          }),
        });

        if (!updateRes.ok) {
          const err = await updateRes.text();
          if (err.includes("already") || err.includes("unique")) {
            console.log(`  ⚠ Username "${newLnUser}" already exists on LNBits, keeping`);
          } else {
            console.log(`  ✗ Failed to update pay link: ${err}`);
            failed++;
            continue;
          }
        } else {
          console.log(`  ✓ LNBits pay link updated: ${oldLnUser} → ${newLnUser}`);
        }
      } else {
        console.log(`  ⚠ No pay link found for "${oldLnUser}", skipping LNBits update`);
      }

      // Update Supabase profile
      const dbRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${id}`,
        {
          method: "PATCH",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ ln_address: newAddress }),
        }
      );

      if (dbRes.ok) {
        console.log(`  ✓ DB updated: ${newAddress}`);
        success++;
      } else {
        console.log(`  ✗ DB update failed: ${dbRes.status}`);
        failed++;
      }
    } catch (err) {
      console.log(`  ✗ Error: ${err}`);
      failed++;
    }
  }

  console.log(`\nDone: ${success} migrated, ${skipped} skipped, ${failed} failed`);
}

main().catch(console.error);
