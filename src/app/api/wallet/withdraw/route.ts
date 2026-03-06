import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

const LNBITS_URL = process.env.LNBITS_URL || "https://ln.coinpayportal.com";
const LNBITS_ADMIN_KEY = process.env.LNBITS_ADMIN_KEY || "";
const MIN_WITHDRAW = 10; // minimum 10 sats to withdraw
const MAX_WITHDRAW = 100000; // max 100k sats per withdrawal

/**
 * POST /api/wallet/withdraw
 * Withdraw sats to a Lightning Address or bolt11 invoice.
 * 
 * Body: { amount_sats: number, destination: string }
 * destination can be:
 *   - Lightning Address (user@wallet.com)
 *   - bolt11 invoice (lnbc...)
 */
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
    if (amount_sats < MIN_WITHDRAW || amount_sats > MAX_WITHDRAW) {
      return NextResponse.json({ error: `Amount must be between ${MIN_WITHDRAW} and ${MAX_WITHDRAW.toLocaleString()} sats` }, { status: 400 });
    }

    const admin = createServiceClient();
    const userId = auth.user.id;

    // Check balance
    const { data: wallet } = await admin
      .from("wallets" as any)
      .select("balance_sats")
      .eq("user_id", userId)
      .single() as any;

    const balance = wallet?.balance_sats ?? 0;
    if (balance < amount_sats) {
      return NextResponse.json({ error: "Insufficient balance", balance_sats: balance }, { status: 400 });
    }

    let paymentHash: string;
    let bolt11: string | null = null;

    if (destination.startsWith("lnbc") || destination.startsWith("lntb")) {
      // Pay a bolt11 invoice directly
      bolt11 = destination;
      const payRes = await fetch(`${LNBITS_URL}/api/v1/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": LNBITS_ADMIN_KEY,
        },
        body: JSON.stringify({ out: true, bolt11: destination }),
      });

      if (!payRes.ok) {
        const errText = await payRes.text();
        console.error("[Withdraw] LNbits pay error:", errText);
        return NextResponse.json({ error: "Lightning payment failed. Please try again." }, { status: 502 });
      }

      const payData = await payRes.json();
      paymentHash = payData.payment_hash;

    } else if (destination.includes("@")) {
      // Lightning Address — resolve via LNURL
      const [name, domain] = destination.split("@");
      if (!name || !domain) {
        return NextResponse.json({ error: "Invalid Lightning Address" }, { status: 400 });
      }

      // Step 1: Fetch LNURL metadata
      const lnurlRes = await fetch(`https://${domain}/.well-known/lnurlp/${name}`);
      if (!lnurlRes.ok) {
        return NextResponse.json({ error: "Could not resolve Lightning Address" }, { status: 400 });
      }

      const lnurlData = await lnurlRes.json();
      if (!lnurlData.callback) {
        return NextResponse.json({ error: "Invalid Lightning Address (no callback)" }, { status: 400 });
      }

      const amountMsats = amount_sats * 1000;
      const minSendable = lnurlData.minSendable || 1000;
      const maxSendable = lnurlData.maxSendable || 100000000000;

      if (amountMsats < minSendable || amountMsats > maxSendable) {
        return NextResponse.json({
          error: `Amount out of range for this address (${Math.ceil(minSendable / 1000)}-${Math.floor(maxSendable / 1000)} sats)`,
        }, { status: 400 });
      }

      // Step 2: Get invoice from callback
      const sep = lnurlData.callback.includes("?") ? "&" : "?";
      const invoiceRes = await fetch(`${lnurlData.callback}${sep}amount=${amountMsats}`);
      if (!invoiceRes.ok) {
        return NextResponse.json({ error: "Failed to get invoice from Lightning Address" }, { status: 502 });
      }

      const invoiceData = await invoiceRes.json();
      if (!invoiceData.pr) {
        return NextResponse.json({ error: "Lightning Address returned no invoice" }, { status: 502 });
      }

      bolt11 = invoiceData.pr;

      // Step 3: Pay the invoice via platform LNbits wallet
      const payRes = await fetch(`${LNBITS_URL}/api/v1/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": LNBITS_ADMIN_KEY,
        },
        body: JSON.stringify({ out: true, bolt11: invoiceData.pr }),
      });

      if (!payRes.ok) {
        const errText = await payRes.text();
        console.error("[Withdraw] LNbits pay error:", errText);
        return NextResponse.json({ error: "Lightning payment failed. Please try again." }, { status: 502 });
      }

      const payData = await payRes.json();
      paymentHash = payData.payment_hash;

    } else {
      return NextResponse.json({ error: "Invalid destination. Provide a Lightning Address (user@domain) or bolt11 invoice." }, { status: 400 });
    }

    // Deduct from internal balance
    const newBalance = balance - amount_sats;
    await admin.from("wallets" as any)
      .update({ balance_sats: newBalance, updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    // Record transaction
    await admin.from("wallet_transactions" as any).insert({
      user_id: userId,
      type: "withdraw",
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
