"use client";

import { useState, useRef, useEffect } from "react";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const ZAP_AMOUNTS = [21, 100, 420, 1000, 5000];

interface ZapButtonProps {
  targetType: "post" | "gig" | "comment";
  targetId: string;
  recipientId: string;
  totalSats?: number;
  zapCount?: number;
}

export function ZapButton({ targetType, targetId, recipientId, totalSats: initialTotal = 0, zapCount: initialCount = 0 }: ZapButtonProps) {
  const [open, setOpen] = useState(false);
  const [totalSats, setTotalSats] = useState(initialTotal);
  const [, setZapCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleZap(amount: number) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet/zap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient_id: recipientId, amount_sats: amount, target_type: targetType, target_id: targetId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to zap");
        return;
      }
      setTotalSats((prev) => prev + amount);
      setZapCount((prev) => prev + 1);
      setOpen(false);
      setFlash(true);
      setTimeout(() => setFlash(false), 600);
    } catch {
      setError("Failed to zap");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div ref={ref} className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 text-xs text-muted-foreground hover:text-amber-500 transition-all ${flash ? "text-amber-400 scale-110" : ""}`}
        title="Zap"
      >
        <Zap className={`h-3.5 w-3.5 ${totalSats > 0 ? "text-amber-500 fill-amber-500" : ""}`} />
        {totalSats > 0 && <span className="text-amber-500 font-medium">{totalSats.toLocaleString()}</span>}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-2 min-w-[160px]">
          <div className="text-xs text-muted-foreground mb-1.5 px-1">Zap sats ⚡</div>
          <div className="flex flex-wrap gap-1">
            {ZAP_AMOUNTS.map((amt) => (
              <Button key={amt} size="sm" variant="outline" className="text-xs h-7 px-2" disabled={loading} onClick={() => handleZap(amt)}>
                {amt.toLocaleString()}
              </Button>
            ))}
          </div>
          {error && (
            <div className="text-xs text-red-500 mt-1.5 px-1">
              {error === "Insufficient balance" ? (
                <Link href="/settings/wallet" className="underline">Deposit sats</Link>
              ) : error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
