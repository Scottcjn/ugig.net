import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { PLATFORM_FEE_RATE, PLATFORM_WALLET_USER_ID } from "@/lib/constants";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { recipient_id, amount_sats, target_type, target_id, note } = await request.json();

    if (!recipient_id || !amount_sats || !target_type || !target_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (amount_sats <= 0) {
      return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
    }
    if (!["post", "gig", "comment"].includes(target_type)) {
      return NextResponse.json({ error: "Invalid target_type" }, { status: 400 });
    }

    const senderId = auth.user.id;
    if (senderId === recipient_id) {
      return NextResponse.json({ error: "Cannot zap yourself" }, { status: 400 });
    }

    const admin = createServiceClient();

    // Calculate fee
    const fee_sats = Math.floor(amount_sats * PLATFORM_FEE_RATE);
    const recipient_amount = amount_sats - fee_sats;

    // Get sender wallet
    const { data: senderWallet } = await admin
      .from("wallets" as any)
      .select("id, balance_sats")
      .eq("user_id", senderId)
      .single();

    const senderBalance = (senderWallet as any)?.balance_sats ?? 0;
    if (senderBalance < amount_sats) {
      return NextResponse.json({ error: "Insufficient balance", balance_sats: senderBalance }, { status: 400 });
    }

    // Deduct full amount from sender
    const newSenderBalance = senderBalance - amount_sats;
    await admin.from("wallets" as any).update({ balance_sats: newSenderBalance, updated_at: new Date().toISOString() }).eq("user_id", senderId);

    // Credit recipient (amount minus fee)
    const { data: recipientWallet } = await admin
      .from("wallets" as any)
      .select("id, balance_sats")
      .eq("user_id", recipient_id)
      .single();

    let newRecipientBalance: number;
    if (recipientWallet) {
      newRecipientBalance = ((recipientWallet as any).balance_sats ?? 0) + recipient_amount;
      await admin.from("wallets" as any).update({ balance_sats: newRecipientBalance, updated_at: new Date().toISOString() }).eq("user_id", recipient_id);
    } else {
      newRecipientBalance = recipient_amount;
      await admin.from("wallets" as any).insert({ user_id: recipient_id, balance_sats: newRecipientBalance });
    }

    // Credit platform wallet with fee
    let newPlatformBalance = 0;
    if (fee_sats > 0) {
      const { data: platformWallet } = await admin
        .from("wallets" as any)
        .select("id, balance_sats")
        .eq("user_id", PLATFORM_WALLET_USER_ID)
        .single();

      if (platformWallet) {
        newPlatformBalance = ((platformWallet as any).balance_sats ?? 0) + fee_sats;
        await admin.from("wallets" as any).update({ balance_sats: newPlatformBalance, updated_at: new Date().toISOString() }).eq("user_id", PLATFORM_WALLET_USER_ID);
      } else {
        newPlatformBalance = fee_sats;
        await admin.from("wallets" as any).insert({ user_id: PLATFORM_WALLET_USER_ID, balance_sats: newPlatformBalance });
      }
    }

    // Create zap record (with fee)
    const { data: zap } = await admin
      .from("zaps" as any)
      .insert({ sender_id: senderId, recipient_id, amount_sats, fee_sats, target_type, target_id, note: note || null })
      .select()
      .single();

    const zapId = (zap as any)?.id;

    // Create wallet transactions: sender, recipient, platform fee
    const txns: any[] = [
      { user_id: senderId, type: "zap_sent", amount_sats, balance_after: newSenderBalance, reference_id: zapId, status: "completed" },
      { user_id: recipient_id, type: "zap_received", amount_sats: recipient_amount, balance_after: newRecipientBalance, reference_id: zapId, status: "completed" },
    ];
    if (fee_sats > 0) {
      txns.push({ user_id: PLATFORM_WALLET_USER_ID, type: "zap_fee", amount_sats: fee_sats, balance_after: newPlatformBalance, reference_id: zapId, status: "completed" });
    }
    await admin.from("wallet_transactions" as any).insert(txns);


    // Notify recipient
    const { data: recipientProfile } = await admin
      .from("profiles")
      .select("ln_address, username" as any)
      .eq("id", recipient_id)
      .single();

    const { data: senderProfile } = await admin
      .from("profiles")
      .select("username")
      .eq("id", senderId)
      .single();

    const senderName = senderProfile?.username || "Someone";

    if ((recipientProfile as any)?.ln_address) {
      await (admin.from("notifications") as any).insert({

        user_id: recipient_id,
        type: "zap_received",
        title: "You received a zap! ⚡",
        body: `${senderName} zapped you ${recipient_amount.toLocaleString()} sats`,
        data: { zap_id: zapId, amount_sats: recipient_amount, target_type, target_id },
      });
    } else {
      await (admin.from("notifications") as any).insert({

        user_id: recipient_id,
        type: "zap_received",
        title: "You received a zap! ⚡",
        body: `${senderName} zapped you ${recipient_amount.toLocaleString()} sats. Add a Lightning Address to your profile to withdraw.`,
        data: { zap_id: zapId, amount_sats: recipient_amount, target_type, target_id, action_url: "/profile" },
      });
    }

    return NextResponse.json({ ok: true, zap, new_balance: newSenderBalance, fee_sats });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
