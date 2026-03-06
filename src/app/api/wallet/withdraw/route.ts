import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

const LNBITS_URL = process.env.LNBITS_URL || "https://ln.coinpayportal.com";
const LNBITS_ADMIN_KEY = process.env.LNBITS_ADMIN_KEY || "";
const MIN_WITHDRAW = 10;
const MAX_WITHDRAW = 100000;
const DAILY_WITHDRAW_LIMIT = 500000;
const HOURLY_WITHDRAW_LIMIT = 3;

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { amount_sats, destination } = await request.json();

    if (!amount_sats || !destination) {
      return NextResponse.json({ error: "amount_sats and destination are required" }, { status: 400 });
    }
    if (!Number.isInteger(amount_sats)) {
      return NextResponse.json({ error: "Amount must be a whole number" }, { status: 400 });
    }
    if (amount_sats < MIN_WITHDRAW || amount_sats > MAX_WITHDRAW) {
      return NextResponse.json({ error: `Amount must be between ${MIN_WITHDRAW} and ${MAX_WITHDRAW.toLocaleString()} sats` }, { status: 400 });
    }

    const admin = createServiceClient();
    const userId = auth.user.id;

    // Rate limit: max N withdrawals per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await admin
      .from("wallet_transactions" as any)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("type", "withdrawal")
      .gte("created_at", oneHourAgo) as any;

    if ((recentCount ?? 0) >= HOURLY_WITHDRAW_LIMIT) {
      return NextResponse.json({ error: "Too many withdrawals. Max 3 per hour." }, { status: 429 });
    }

    // Daily limit check
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: dailyTxs } = await admin
      .from("wallet_transactions" as any)
      .select("amount_sats")
      .eq("user_id", userId)
      .eq("type", "withdrawal")
      .gte("created_at", oneDayAgo) as any;

    const dailyTotal = (dailyTxs || []).reduce((sum: number, tx: any) => sum + Math.abs(tx.amount_sats), 0);
    if (dailyTotal + amount_sats > DAILY_WITHDRAW_LIMIT) {
      return NextResponse.json({
        error: `Daily withdrawal limit is ${DAILY_WITHDRAW_LIMIT.toLocaleString()} sats. You've used ${dailyTotal.toLocaleString()} today.`,
      }, { status: 400 });
    }

    // ── STEP 1: Deduct balance BEFORE sending payment ──
    // Try atomic RPC first
    let newBalance: number | null = null;

    const { data: rpcResult, error: rpcError } = await (admin.rpc as any)("withdraw_balance", {
      p_user_id: userId,
      p_amount: amount_sats,
    });

    if (!rpcError && rpcResult && rpcResult.length > 0) {
      newBalance = rpcResult[0].balance_sats;
    } else {
      // Fallback: manual deduction with verification
      const { data: walletData } = await admin
        .from("wallets" as any)
        .select("balance_sats")
        .eq("user_id", userId)
        .single() as any;

      const currentBalance = walletData?.balance_sats ?? 0;
      if (currentBalance < amount_sats) {
        return NextResponse.json({ error: "Insufficient balance", balance_sats: currentBalance }, { status: 400 });
      }

      const targetBalance = currentBalance - amount_sats;

      // Optimistic lock: only update if balance hasn't changed
      const { data: updateResult } = await admin
        .from("wallets" as any)
        .update({ balance_sats: targetBalance, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("balance_sats", currentBalance)
        .select("balance_sats") as any;

      if (!updateResult || updateResult.length === 0) {
        // Balance changed between read and write — race condition
        return NextResponse.json({ error: "Balance changed. Please try again." }, { status: 409 });
      }

      newBalance = updateResult[0].balance_sats;
    }

    if (newBalance === null) {
      return NextResponse.json({ error: "Failed to deduct balance" }, { status: 500 });
    }

    // ── STEP 2: Resolve destination and send payment ──
    let paymentHash: string;
    let bolt11: string | null = null;

    try {
      if (destination.startsWith("lnbc") || destination.startsWith("lntb")) {
        bolt11 = destination;
        const payRes = await fetch(`${LNBITS_URL}/api/v1/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Api-Key": LNBITS_ADMIN_KEY },
          body: JSON.stringify({ out: true, bolt11: destination }),
        });

        if (!payRes.ok) {
          throw new Error(`LNbits error: ${await payRes.text()}`);
        }
        paymentHash = (await payRes.json()).payment_hash;

      } else if (destination.includes("@")) {
        const [name, domain] = destination.split("@");
        if (!name || !domain) {
          throw new Error("Invalid Lightning Address");
        }

        // Resolve LNURL
        const lnurlRes = await fetch(`https://${domain}/.well-known/lnurlp/${name}`);
        if (!lnurlRes.ok) throw new Error("Could not resolve Lightning Address");

        const lnurlData = await lnurlRes.json();
        if (!lnurlData.callback) throw new Error("Invalid Lightning Address (no callback)");

        const amountMsats = amount_sats * 1000;
        if (amountMsats < (lnurlData.minSendable || 1000) || amountMsats > (lnurlData.maxSendable || 100000000000)) {
          throw new Error(`Amount out of range for this address`);
        }

        const sep = lnurlData.callback.includes("?") ? "&" : "?";
        const invoiceRes = await fetch(`${lnurlData.callback}${sep}amount=${amountMsats}`);
        if (!invoiceRes.ok) throw new Error("Failed to get invoice");

        const invoiceData = await invoiceRes.json();
        if (!invoiceData.pr) throw new Error("No invoice returned");

        bolt11 = invoiceData.pr;

        const payRes = await fetch(`${LNBITS_URL}/api/v1/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Api-Key": LNBITS_ADMIN_KEY },
          body: JSON.stringify({ out: true, bolt11: invoiceData.pr }),
        });

        if (!payRes.ok) throw new Error(`LNbits error: ${await payRes.text()}`);
        paymentHash = (await payRes.json()).payment_hash;

      } else {
        throw new Error("Invalid destination");
      }
    } catch (payErr: any) {
      // ── PAYMENT FAILED: Refund the balance ──
      console.error("[Withdraw] Payment failed, refunding:", payErr.message);
      await admin.from("wallets" as any)
        .update({ balance_sats: newBalance + amount_sats, updated_at: new Date().toISOString() })
        .eq("user_id", userId);

      const errMsg = payErr.message?.includes("Invalid") ? payErr.message : "Lightning payment failed. Your balance has been restored.";
      return NextResponse.json({ error: errMsg }, { status: 502 });
    }

    // ── STEP 3: Record transaction ──
    await admin.from("wallet_transactions" as any).insert({
      user_id: userId,
      type: "withdrawal",
      amount_sats: -amount_sats,
      balance_after: newBalance,
      bolt11,
      payment_hash: paymentHash,
      status: "completed",
      metadata: { destination },
    });

    return NextResponse.json({
      ok: true,
      amount_sats,
      new_balance: newBalance,
      payment_hash: paymentHash,
      destination,
    });

  } catch (err) {
    console.error("[Withdraw] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
