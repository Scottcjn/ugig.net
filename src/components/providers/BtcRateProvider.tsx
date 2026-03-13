"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface BtcRateContextType {
  rate: number | null; // USD per 1 BTC
  satsToFiat: (sats: number) => string | null;
}

const BtcRateContext = createContext<BtcRateContextType>({
  rate: null,
  satsToFiat: () => null,
});

export function useBtcRate() {
  return useContext(BtcRateContext);
}

function formatFiat(usd: number): string {
  if (usd < 0.005) return "<$0.01";
  if (usd < 1) return `$${usd.toFixed(2)}`;
  if (usd < 100) return `$${usd.toFixed(2)}`;
  if (usd < 10000) return `$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${Math.round(usd).toLocaleString()}`;
}

export function BtcRateProvider({ children }: { children: ReactNode }) {
  const [rate, setRate] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/rates/btc")
      .then((r) => r.json())
      .then((d) => {
        if (d.rate) setRate(d.rate);
      })
      .catch(() => {});
  }, []);

  const satsToFiat = (sats: number): string | null => {
    if (!rate) return null;
    const usd = Math.abs(sats) * rate / 100_000_000;
    return formatFiat(usd);
  };

  return (
    <BtcRateContext.Provider value={{ rate, satsToFiat }}>
      {children}
    </BtcRateContext.Provider>
  );
}
