"use client";

import { useState, useEffect } from "react";
import { Zap } from "lucide-react";

export function PlatformBalance() {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/wallet/platform-balance")
      .then((r) => r.json())
      .then((d) => setBalance(d.balance_sats ?? null))
      .catch(() => {});
  }, []);

  if (balance === null) return null;

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground" title="Platform Lightning wallet balance">
      <Zap className="h-3 w-3 text-amber-500 fill-amber-500" />
      <span>{balance.toLocaleString()} sats</span>
    </div>
  );
}
