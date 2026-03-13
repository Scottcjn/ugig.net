"use client";

import { Zap } from "lucide-react";
import { useBtcRate } from "@/components/providers/BtcRateProvider";

interface SatsAmountProps {
  sats: number;
  className?: string;
  showIcon?: boolean;
  iconClassName?: string;
  sign?: boolean; // show +/- prefix
}

export function SatsAmount({ sats, className = "", showIcon = false, iconClassName, sign = false }: SatsAmountProps) {
  const { satsToFiat } = useBtcRate();
  const fiat = satsToFiat(sats);
  const prefix = sign ? (sats >= 0 ? "+" : "") : "";

  return (
    <span className={className}>
      {showIcon && <Zap className={iconClassName || "h-4 w-4 fill-amber-500 text-amber-500 inline mr-0.5"} />}
      {prefix}{Math.abs(sats).toLocaleString()} sats
      {fiat && <span className="text-muted-foreground ml-1">(~{fiat})</span>}
    </span>
  );
}

export function SatsFiatHint({ sats, className = "" }: { sats: number; className?: string }) {
  const { satsToFiat } = useBtcRate();
  const fiat = satsToFiat(sats);
  if (!fiat) return null;
  return <span className={`text-muted-foreground ${className}`}>(~{fiat})</span>;
}
