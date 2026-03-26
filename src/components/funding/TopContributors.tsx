"use client";

import { useState, useEffect } from "react";
import { CreditCard, Zap, Coins } from "lucide-react";
import Link from "next/link";

interface Transaction {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  amount_usd: number;
  amount_sats: number;
  tier: string;
  method: "card" | "lightning" | "crypto";
  blockchain: string | null;
  crypto_amount: number | null;
  paid_at: string;
}

export function TopContributors() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/funding/contributors")
      .then((r) => r.json())
      .then((d) => setTransactions(d.transactions || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-muted rounded-lg" />
        ))}
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No contributions yet. Be the first!
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {transactions.map((tx) => (
        <div
          key={tx.id}
          className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
        >
          <div className="flex-shrink-0">
            {tx.avatar_url ? (
              <img
                src={tx.avatar_url}
                alt={tx.username}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                {tx.username[0]?.toUpperCase()}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <Link
              href={`/u/${tx.username}`}
              className="text-sm font-medium hover:underline truncate block"
            >
              {tx.full_name || tx.username}
            </Link>
            <p className="text-xs text-muted-foreground">
              {new Date(tx.paid_at).toLocaleDateString()} · {tx.tier}
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            {tx.method === "card" ? (
              <CreditCard className="h-3.5 w-3.5 text-blue-500" />
            ) : tx.method === "crypto" ? (
              <Coins className="h-3.5 w-3.5 text-purple-500" />
            ) : (
              <Zap className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
            )}
            <span className="text-sm font-semibold">
              {tx.method === "lightning" && tx.amount_sats > 0
                ? `${tx.amount_sats.toLocaleString()} sats`
                : tx.method === "crypto" && tx.crypto_amount
                ? `${tx.crypto_amount} ${tx.blockchain?.toUpperCase() || ""}`
                : `$${tx.amount_usd.toFixed(2)}`}
            </span>
            {tx.method === "crypto" && (
              <span className="text-xs text-muted-foreground">≈ ${tx.amount_usd.toFixed(2)}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
