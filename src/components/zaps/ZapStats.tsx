"use client";

import { useState, useEffect } from "react";
import { Zap } from "lucide-react";

export function ZapStats({ userId }: { userId: string }) {
  const [stats, setStats] = useState<{ total_sats_received: number; zap_count: number } | null>(null);

  useEffect(() => {
    fetch(`/api/zaps/stats?user_id=${userId}`)
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {});
  }, [userId]);

  if (!stats || stats.zap_count === 0) return null;

  return (
    <div className="p-6 bg-card rounded-lg border border-border">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Zap className="h-5 w-5 text-amber-500" />
        Zaps Received
      </h2>
      <div className="flex gap-6">
        <div>
          <p className="text-2xl font-bold text-amber-500">{stats.total_sats_received.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">sats earned</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-muted-foreground">{stats.zap_count.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">zaps</p>
        </div>
      </div>
    </div>
  );
}
