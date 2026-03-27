"use client";

import { useState, useEffect } from "react";

interface FundingTotal {
  total_usd: number;
  contributors: number;
}

export function useFundingTotal() {
  const [data, setData] = useState<FundingTotal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => {
      fetch("/api/funding/total")
        .then((res) => (res.ok ? res.json() : null))
        .then((d) => setData(d))
        .catch(() => null)
        .finally(() => setLoading(false));
    };
    load();
    // Poll every 5 minutes — funding totals don't change frequently
    const interval = setInterval(load, 300_000);
    return () => clearInterval(interval);
  }, []);

  return { data, loading };
}
