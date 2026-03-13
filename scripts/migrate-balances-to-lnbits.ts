#!/usr/bin/env npx tsx
/**
 * Migrate user balances from Supabase (source of truth) to LNbits user wallets.
 *
 * Background: Old code tracked balances in Supabase only (zaps, purchases).
 * Deposits went to the shared "LNbits wallet" (paylink wallet).
 * New code reads from LNbits user wallets, so we need to fund them.
 *
 * Source of truth: wallet_transactions.balance_after (last completed tx per user)
 * Fallback: wallets.balance_sats (for users with no transactions, e.g. signup bonuses)
 *
 * Funding source: "LNbits wallet" (paylink) admin key
 */

const LNBITS_URL = process.env.LNBITS_URL!;
const PAYLINK_ADMIN_KEY = process.env.PAYLINK_ADMIN_KEY!;
const PLATFORM_USER_ID = "00000000-0000-0000-0000-000000000000";
const PLATFORM_INVOICE_KEY = process.env.LNBITS_INVOICE_KEY!;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!LNBITS_URL || !PAYLINK_ADMIN_KEY || !PLATFORM_INVOICE_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing required env vars. Need: LNBITS_URL, PAYLINK_ADMIN_KEY, LNBITS_INVOICE_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");

interface UserBalance {
  user_id: string;
  owed_sats: number;
  source: "transactions" | "wallets_table";
}

interface TransferResult {
  user_id: string;
  owed_sats: number;
  lnbits_balance_before: number;
  transferred: number;
  success: boolean;
  error?: string;
}

async function supabaseQuery(path: string, headers?: Record<string, string>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...headers,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function supabaseUpdate(table: string, match: Record<string, string>, data: Record<string, any>) {
  const params = Object.entries(match).map(([k, v]) => `${k}=eq.${v}`).join("&");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase update ${table}: ${res.status} ${await res.text()}`);
}

async function getLnBalance(invoiceKey: string): Promise<number> {
  const res = await fetch(`${LNBITS_URL}/api/v1/wallet`, {
    headers: { "X-Api-Key": invoiceKey },
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return Math.floor((data.balance || 0) / 1000);
}

async function createInvoice(invoiceKey: string, amountSats: number, memo: string) {
  const res = await fetch(`${LNBITS_URL}/api/v1/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": invoiceKey },
    body: JSON.stringify({ out: false, amount: amountSats, memo }),
  });
  if (!res.ok) throw new Error(`createInvoice failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function payInvoice(adminKey: string, bolt11: string) {
  const res = await fetch(`${LNBITS_URL}/api/v1/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": adminKey },
    body: JSON.stringify({ out: true, bolt11 }),
  });
  if (!res.ok) throw new Error(`payInvoice failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 2000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      if (i === retries - 1) throw err;
      const msg = err.message || "";
      if (msg.includes("520") || msg.includes("429") || msg.includes("Unable to connect")) {
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
      } else {
        throw err; // Don't retry non-transient errors
      }
    }
  }
  throw new Error("Unreachable");
}

async function internalTransfer(recipientInvoiceKey: string, amountSats: number, memo: string) {
  const invoice = await withRetry(() => createInvoice(recipientInvoiceKey, amountSats, memo));
  await new Promise((r) => setTimeout(r, 500));
  const payment = await withRetry(() => payInvoice(PAYLINK_ADMIN_KEY, invoice.payment_request));
  return payment;
}

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  BALANCE MIGRATION: Supabase → LNbits user wallets`);
  console.log(`  ${DRY_RUN ? "🔍 DRY RUN — no transfers will be made" : "⚡ LIVE RUN — real transfers!"}`);
  console.log(`${"=".repeat(60)}\n`);

  // 1. Check paylink wallet balance
  const PAYLINK_INVOICE_KEY = process.env.LNBITS_PAYLINK_KEY || PAYLINK_ADMIN_KEY;
  const paylinkBalance = await getLnBalance(PAYLINK_INVOICE_KEY);
  console.log(`Paylink wallet balance: ${paylinkBalance} sats\n`);

  // 2. Get balances from wallet_transactions (most recent completed tx per user)
  const txData: any[] = await supabaseQuery(
    "wallet_transactions?select=user_id,balance_after,created_at&status=eq.completed&order=created_at.desc&limit=1000"
  );
  const txBalances = new Map<string, number>();
  for (const tx of txData) {
    if (!txBalances.has(tx.user_id)) {
      txBalances.set(tx.user_id, tx.balance_after);
    }
  }

  // 3. Get balances from wallets table (fallback for users with no transactions)
  const walletData: any[] = await supabaseQuery(
    "wallets?select=user_id,balance_sats&limit=1000"
  );

  // 4. Build combined list — transactions take priority, wallets table as fallback
  const userBalances: UserBalance[] = [];
  const seen = new Set<string>();

  for (const [user_id, balance] of txBalances) {
    if (balance > 0) {
      userBalances.push({ user_id, owed_sats: balance, source: "transactions" });
      seen.add(user_id);
    }
  }

  for (const w of walletData) {
    if (!seen.has(w.user_id) && w.balance_sats > 0) {
      userBalances.push({ user_id: w.user_id, owed_sats: w.balance_sats, source: "wallets_table" });
      seen.add(w.user_id);
    }
  }

  userBalances.sort((a, b) => b.owed_sats - a.owed_sats);
  const totalOwed = userBalances.reduce((s, u) => s + u.owed_sats, 0);

  console.log(`Users with balances: ${userBalances.length}`);
  console.log(`Total owed: ${totalOwed} sats`);
  console.log(`Paylink has: ${paylinkBalance} sats`);
  if (totalOwed > paylinkBalance) {
    console.log(`⚠️  WARNING: Owed (${totalOwed}) exceeds paylink balance (${paylinkBalance})!`);
    console.log(`   Will transfer what we can, largest balances first.\n`);
  }
  console.log("");

  // 5. Get all user_ln_wallets
  const lnWallets: any[] = await supabaseQuery(
    "user_ln_wallets?select=user_id,invoice_key&limit=1000"
  );
  const lnWalletMap = new Map<string, string>();
  for (const w of lnWallets) {
    lnWalletMap.set(w.user_id, w.invoice_key);
  }

  // 6. Process transfers
  const results: TransferResult[] = [];
  let totalTransferred = 0;
  let remainingPaylink = paylinkBalance;

  for (const user of userBalances) {
    const { user_id, owed_sats } = user;

    // Determine the invoice key
    let invoiceKey: string;
    if (user_id === PLATFORM_USER_ID) {
      invoiceKey = PLATFORM_INVOICE_KEY;
    } else {
      const key = lnWalletMap.get(user_id);
      if (!key) {
        console.log(`❌ ${user_id}: NO LN WALLET — owed ${owed_sats} sats (${user.source})`);
        results.push({ user_id, owed_sats, lnbits_balance_before: 0, transferred: 0, success: false, error: "no_ln_wallet" });
        continue;
      }
      invoiceKey = key;
    }

    // Check current LNbits balance
    const currentLnBalance = await getLnBalance(invoiceKey);
    const needed = Math.max(0, owed_sats - currentLnBalance);

    if (needed === 0) {
      console.log(`✅ ${user_id}: already has ${currentLnBalance} sats (owed ${owed_sats}) — skip`);
      results.push({ user_id, owed_sats, lnbits_balance_before: currentLnBalance, transferred: 0, success: true });
      // Still update Supabase cache to match
      if (!DRY_RUN) {
        await supabaseUpdate("wallets", { user_id }, { balance_sats: owed_sats, updated_at: new Date().toISOString() });
      }
      continue;
    }

    if (needed > remainingPaylink) {
      console.log(`⚠️  ${user_id}: needs ${needed} sats but only ${remainingPaylink} left in paylink — transferring ${remainingPaylink}`);
    }

    const transferAmount = Math.min(needed, remainingPaylink);

    if (DRY_RUN) {
      console.log(`🔍 ${user_id}: would transfer ${transferAmount} sats (owed ${owed_sats}, has ${currentLnBalance}, from ${user.source})`);
      results.push({ user_id, owed_sats, lnbits_balance_before: currentLnBalance, transferred: transferAmount, success: true });
      remainingPaylink -= transferAmount;
      totalTransferred += transferAmount;
      continue;
    }

    try {
      await internalTransfer(invoiceKey, transferAmount, `ugig.net balance migration`);
      remainingPaylink -= transferAmount;
      totalTransferred += transferAmount;

      // Update Supabase cache
      const newBalance = currentLnBalance + transferAmount;
      await supabaseUpdate("wallets", { user_id }, { balance_sats: newBalance, updated_at: new Date().toISOString() });

      console.log(`⚡ ${user_id}: transferred ${transferAmount} sats (now ${newBalance}, owed ${owed_sats}, from ${user.source})`);
      results.push({ user_id, owed_sats, lnbits_balance_before: currentLnBalance, transferred: transferAmount, success: true });
    } catch (err: any) {
      console.log(`❌ ${user_id}: FAILED transferring ${transferAmount} sats — ${err.message}`);
      results.push({ user_id, owed_sats, lnbits_balance_before: currentLnBalance, transferred: 0, success: false, error: err.message });
    }

    // Respect LNbits rate limit (200 req/min = 300ms per req, we do 2 per transfer)
    await new Promise((r) => setTimeout(r, 700));
  }

  // 7. Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  SUMMARY`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  Total users processed: ${results.length}`);
  console.log(`  Successful transfers:  ${results.filter((r) => r.success && r.transferred > 0).length}`);
  console.log(`  Already funded:        ${results.filter((r) => r.success && r.transferred === 0).length}`);
  console.log(`  Failed:                ${results.filter((r) => !r.success).length}`);
  console.log(`  Total transferred:     ${totalTransferred} sats`);
  console.log(`  Paylink remaining:     ${remainingPaylink} sats`);
  if (DRY_RUN) console.log(`\n  🔍 This was a dry run. Run without --dry-run to execute.`);
  console.log("");

  // Log failures
  const failures = results.filter((r) => !r.success);
  if (failures.length > 0) {
    console.log("FAILURES:");
    for (const f of failures) {
      console.log(`  ${f.user_id}: owed ${f.owed_sats} — ${f.error}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
