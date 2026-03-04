"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";

export function WalletBalance() {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/wallet/balance")
      .then((r) => r.json())
      .then((d) => setBalance(d.balance_sats ?? null))
      .catch(() => {});
  }, []);

  if (balance === null) return null;

  return (
    <Link href="/settings/wallet" className="flex items-center gap-1 text-sm text-amber-500 hover:text-amber-400 transition-colors" title="Wallet">
      <Zap className="h-4 w-4 fill-amber-500" />
      <span className="font-medium">{balance.toLocaleString()}</span>
    </Link>
  );
}
