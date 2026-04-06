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
    // Poll: 5min when active, 15min when hidden
    let timer: ReturnType<typeof setTimeout>;
    function schedule() {
      const delay = document.hidden ? 15 * 60_000 : 300_000;
      timer = setTimeout(() => { load(); schedule(); }, delay);
    }
    schedule();
    function onVis() { clearTimeout(timer); if (!document.hidden) load(); schedule(); }
    document.addEventListener("visibilitychange", onVis);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  return { data, loading };
}
