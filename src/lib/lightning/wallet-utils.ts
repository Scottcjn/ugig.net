/**
 * LNbits wallet utilities.
 *
 * Each user has their own LNbits wallet (keys stored in `user_ln_wallets`).
 * All balance reads, deposits, withdrawals, and internal transfers go through
 * the user's wallet — Supabase `wallets.balance_sats` is only a cache.
 */

import { SupabaseClient } from "@supabase/supabase-js";

const LNBITS_URL = process.env.LNBITS_URL || "https://ln.coinpayportal.com";

export interface UserLnWallet {
  admin_key: string;
  invoice_key: string;
  wallet_id?: string;
}

/**
 * Look up a user's LNbits wallet keys from the `user_ln_wallets` table.
 */
export async function getUserLnWallet(
  admin: SupabaseClient,
  userId: string,
): Promise<UserLnWallet | null> {
  const { data } = (await admin
    .from("user_ln_wallets" as any)
    .select("admin_key, invoice_key, wallet_id")
    .eq("user_id", userId)
    .single()) as any;

  if (!data) return null;
  return {
    admin_key: data.admin_key,
    invoice_key: data.invoice_key,
    wallet_id: data.wallet_id ?? undefined,
  };
}

/**
 * Get the real LNbits balance (in sats) for a wallet.
 */
export async function getLnBalance(invoiceKey: string): Promise<number> {
  const res = await fetch(`${LNBITS_URL}/api/v1/wallet`, {
    headers: { "X-Api-Key": invoiceKey },
  });
  if (!res.ok) {
    console.error("[wallet-utils] getLnBalance failed:", res.status, await res.text());
    return 0;
  }
  const data = await res.json();
  // LNbits returns balance in msats
  return Math.floor((data.balance || 0) / 1000);
}

/**
 * Create a Lightning invoice on the given wallet.
 */
export async function createInvoice(
  invoiceKey: string,
  amountSats: number,
  memo: string,
): Promise<{ payment_request: string; payment_hash: string }> {
  const res = await fetch(`${LNBITS_URL}/api/v1/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": invoiceKey,
    },
    body: JSON.stringify({ out: false, amount: amountSats, memo }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LNbits createInvoice failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    payment_request: data.payment_request,
    payment_hash: data.payment_hash,
  };
}

/**
 * Pay a bolt11 invoice from the given wallet.
 */
export async function payInvoice(
  adminKey: string,
  bolt11: string,
): Promise<{ payment_hash: string }> {
  const res = await fetch(`${LNBITS_URL}/api/v1/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": adminKey,
    },
    body: JSON.stringify({ out: true, bolt11 }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LNbits payInvoice failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return { payment_hash: data.payment_hash };
}

/**
 * Internal transfer between two wallets on the same LNbits instance.
 * Creates an invoice on the recipient's wallet and pays it from the sender's wallet.
 * This is instant — no QR codes or user interaction needed.
 */
export async function internalTransfer(
  senderAdminKey: string,
  recipientInvoiceKey: string,
  amountSats: number,
  memo: string,
): Promise<{ payment_hash: string }> {
  // 1. Create invoice on recipient wallet
  const invoice = await createInvoice(recipientInvoiceKey, amountSats, memo);

  // 2. Pay it from sender wallet (instant on same instance)
  const payment = await payInvoice(senderAdminKey, invoice.payment_request);

  return { payment_hash: payment.payment_hash };
}

/**
 * Check if a payment (by hash) is paid on the given wallet.
 */
export async function checkPayment(
  invoiceKey: string,
  paymentHash: string,
): Promise<{ paid: boolean; amount_sats: number }> {
  const res = await fetch(`${LNBITS_URL}/api/v1/payments/${paymentHash}`, {
    headers: { "X-Api-Key": invoiceKey },
  });

  if (!res.ok) return { paid: false, amount_sats: 0 };

  const data = await res.json();
  const paid = !!data.paid || data.details?.status === "success";
  const amount_sats = Math.abs((data.amount ?? data.details?.amount ?? 0) / 1000);

  return { paid, amount_sats };
}

/**
 * Update the Supabase wallets cache with the real LNbits balance.
 */
export async function syncBalanceCache(
  admin: SupabaseClient,
  userId: string,
  balanceSats: number,
): Promise<void> {
  const { data: existing } = (await admin
    .from("wallets" as any)
    .select("id")
    .eq("user_id", userId)
    .single()) as any;

  if (existing) {
    await admin
      .from("wallets" as any)
      .update({ balance_sats: balanceSats, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
  } else {
    await admin
      .from("wallets" as any)
      .insert({ user_id: userId, balance_sats: balanceSats });
  }
}
