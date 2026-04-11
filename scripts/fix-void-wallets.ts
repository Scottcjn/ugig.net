/**
 * Fix VoidWallets on LNbits.
 *
 * Accounts created via POST /api/v1/account before the LNbits instance had a
 * Lightning backend configured were assigned VoidWallets (can't create invoices).
 * New accounts now correctly get wallet_type: "lightning".
 *
 * This script:
 * 1. Fetches all user_ln_wallets from Supabase
 * 2. For each user, tries to create a test invoice on LNbits
 * 3. If it fails with VoidWallet, deletes the account and recreates it
 * 4. Updates the wallet keys in Supabase
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const LNBITS_URL = process.env.LNBITS_URL || "https://ln.coinpayportal.com";
const LNBITS_ADMIN_KEY = process.env.LNBITS_ADMIN_KEY || "";

async function main() {
  if (!LNBITS_ADMIN_KEY) {
    console.error("LNBITS_ADMIN_KEY not set");
    process.exit(1);
  }

  // Fetch all user wallets from Supabase
  console.log("Fetching user wallets from Supabase...");
  const walletsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/user_ln_wallets?select=user_id,wallet_id,admin_key,invoice_key,extra&limit=1000`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!walletsRes.ok) {
    console.error("Failed to fetch wallets:", await walletsRes.text());
    process.exit(1);
  }

  const wallets = await walletsRes.json();
  console.log(`Found ${wallets.length} user wallets`);

  let fixed = 0;
  let skipped = 0;
  let failed = 0;

  for (const wallet of wallets) {
    console.log(`\nChecking user ${wallet.user_id} (wallet: ${wallet.wallet_id})...`);

    // Test if this wallet can create an invoice
    const testInvoice = await fetch(`${LNBITS_URL}/api/v1/payments`, {
      method: "POST",
      headers: {
        "X-Api-Key": wallet.invoice_key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ out: false, amount: 1, memo: "void-check" }),
    });

    if (testInvoice.ok) {
      console.log("  ✓ Wallet is functional");
      skipped++;
      continue;
    }

    const errText = await testInvoice.text();
    if (!errText.includes("VoidWallet")) {
      console.log(`  ⚠ Not VoidWallet, different error: ${errText}`);
      failed++;
      continue;
    }

    console.log(`  ✗ VoidWallet detected — recreating...`);

    // Create a new account for this user
    // Extract the original name from the wallet if possible
    const acctName = wallet.extra?.name || `ugig-user-${wallet.user_id}`;

    const createRes = await fetch(`${LNBITS_URL}/api/v1/account`, {
      method: "POST",
      headers: {
        "X-Api-Key": LNBITS_ADMIN_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: acctName }),
    });

    if (!createRes.ok) {
      console.error(`  ✗ Failed to create new account: ${await createRes.text()}`);
      failed++;
      continue;
    }

    const newWallet = await createRes.json();
    console.log(`  ✓ New wallet created: ${newWallet.id} (type: ${newWallet.wallet_type})`);

    // Update Supabase with new keys
    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_ln_wallets?user_id=eq.${wallet.user_id}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          wallet_id: newWallet.id,
          admin_key: newWallet.adminkey,
          invoice_key: newWallet.inkey,
        }),
      }
    );

    if (!updateRes.ok) {
      console.error(`  ✗ Failed to update Supabase: ${await updateRes.text()}`);
      failed++;
      continue;
    }

    console.log(`  ✓ Supabase updated`);
    fixed++;

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total wallets checked: ${wallets.length}`);
  console.log(`Fixed (were VoidWallets): ${fixed}`);
  console.log(`Skipped (already working): ${skipped}`);
  console.log(`Failed: ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
