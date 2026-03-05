"use client";

import { useState, useEffect } from "react";
import { Zap, TrendingUp } from "lucide-react";

export function PlatformBalance() {
  const [balance, setBalance] = useState<number | null>(null);
  const [commission, setCommission] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/wallet/platform-balance")
      .then((r) => r.json())
      .then((d) => {
        setBalance(d.balance_sats ?? null);
        setCommission(d.commission_sats ?? null);
      })
      .catch(() => {});
  }, []);

  if (balance === null && commission === null) return null;

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      {balance !== null && (
        <div className="flex items-center gap-1" title="Total wallet deposits">
          <Zap className="h-3 w-3 text-amber-500 fill-amber-500" />
          <span>{balance.toLocaleString()} sats</span>
        </div>
      )}
      {commission !== null && commission > 0 && (
        <div className="flex items-center gap-1" title="Platform commissions earned">
          <TrendingUp className="h-3 w-3 text-green-500" />
          <span>{commission.toLocaleString()} sats</span>
        </div>
      )}
    </div>
  );
}
