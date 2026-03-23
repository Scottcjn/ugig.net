"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Zap,
  Copy,
  Check,
  Loader2,
  Clock,
  AlertCircle,
  Crown,
  CreditCard,
} from "lucide-react";
import { QRCodeCanvas } from "@/components/funding/QRCode";

type TierId =
  | "credits_100k"
  | "credits_500k"
  | "credits_1m"
  | "lifetime"
  | "supporter";

type InvoiceState = {
  paymentRequest: string;
  paymentHash: string;
  expiresAt: string;
  tier: TierId;
  amountSats: number;
} | null;

type PaymentStatus = "idle" | "pending" | "paid" | "expired" | "error";

const TIERS: Array<{
  id: TierId;
  label: string;
  sats: string;
  usd: string;
  description: string;
  highlight?: boolean;
  icon: typeof Zap;
}> = [
  {
    id: "supporter",
    label: "Supporter",
    sats: "10,000",
    usd: "~$1",
    description: "Supporter badge on your profile",
    icon: Zap,
  },
  {
    id: "credits_100k",
    label: "100k Credits",
    sats: "100,000",
    usd: "$100",
    description: "100,000 sats → $100 in platform credits",
    icon: CreditCard,
  },
  {
    id: "credits_500k",
    label: "500k Credits",
    sats: "500,000",
    usd: "$600",
    description: "500,000 sats → $600 in credits (20% bonus)",
    highlight: true,
    icon: CreditCard,
  },
  {
    id: "credits_1m",
    label: "1M Credits",
    sats: "1,000,000",
    usd: "$1,500",
    description: "1,000,000 sats → $1,500 in credits (50% bonus)",
    icon: CreditCard,
  },
  {
    id: "lifetime",
    label: "Lifetime Premium",
    sats: "200,000",
    usd: "$20+",
    description:
      "Unlimited job postings, premium placement, API access, Founder badge",
    highlight: true,
    icon: Crown,
  },
];

export function FundingClient() {
  const [selectedTier, setSelectedTier] = useState<TierId | null>(null);
  const [invoice, setInvoice] = useState<InvoiceState>(null);
  const [status, setStatus] = useState<PaymentStatus>("idle");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectTier = async (tier: TierId) => {
    setSelectedTier(tier);
    setError(null);
    setStatus("idle");
    setInvoice(null);
    setLoading(true);

    try {
      const res = await fetch("/api/funding/create-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (res.status === 401) {
          setError("Please log in to fund ugig.net");
        } else {
          setError(data.error || "Failed to create invoice");
        }
        setLoading(false);
        return;
      }

      const data = await res.json();
      setInvoice(data);
      setStatus("pending");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Poll for payment status
  const pollStatus = useCallback(async () => {
    if (!invoice) return;
    try {
      const res = await fetch(
        `/api/funding/status?paymentHash=${invoice.paymentHash}`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === "paid") {
        setStatus("paid");
      } else if (
        data.status === "expired" ||
        new Date(invoice.expiresAt) < new Date()
      ) {
        setStatus("expired");
      }
    } catch {
      // ignore poll errors
    }
  }, [invoice]);

  useEffect(() => {
    if (status !== "pending" || !invoice) return;
    const interval = setInterval(pollStatus, 3000);
    return () => clearInterval(interval);
  }, [status, invoice, pollStatus]);

  const handleCopy = async () => {
    if (!invoice) return;
    await navigator.clipboard.writeText(invoice.paymentRequest);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setSelectedTier(null);
    setInvoice(null);
    setStatus("idle");
    setError(null);
  };

  // Payment confirmed view
  if (status === "paid") {
    return (
      <div className="border border-green-500/50 rounded-lg p-8 text-center space-y-4 bg-green-500/5">
        <Check className="h-16 w-16 text-green-500 mx-auto" />
        <h2 className="text-2xl font-bold text-green-500">Payment Received!</h2>
        <p className="text-muted-foreground">
          Your {selectedTier?.replace("_", " ")} contribution has been
          processed. Rewards have been applied to your account.
        </p>
        <Button onClick={handleReset} variant="outline">
          Make Another Contribution
        </Button>
      </div>
    );
  }

  // Invoice view
  if (invoice && status === "pending") {
    return (
      <div className="space-y-6">
        <div className="border rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Pay with Lightning ⚡</h2>
            <Badge variant="secondary">
              {invoice.amountSats.toLocaleString()} sats
            </Badge>
          </div>

          <div className="flex justify-center py-4">
            <QRCodeCanvas value={invoice.paymentRequest} size={256} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted p-3 rounded-md break-all max-h-20 overflow-auto">
                {invoice.paymentRequest}
              </code>
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>
              Invoice expires at{" "}
              {new Date(invoice.expiresAt).toLocaleTimeString()}
            </span>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Waiting for payment confirmation...</span>
          </div>
        </div>

        <Button variant="ghost" onClick={handleReset} className="w-full">
          Cancel &amp; go back
        </Button>
      </div>
    );
  }

  // Expired view
  if (status === "expired") {
    return (
      <div className="border border-yellow-500/50 rounded-lg p-8 text-center space-y-4 bg-yellow-500/5">
        <AlertCircle className="h-16 w-16 text-yellow-500 mx-auto" />
        <h2 className="text-2xl font-bold">Invoice Expired</h2>
        <p className="text-muted-foreground">
          The Lightning invoice has expired. Please create a new one.
        </p>
        <Button onClick={handleReset}>Try Again</Button>
      </div>
    );
  }

  // Tier selection view
  return (
    <div className="space-y-6">
      {error && (
        <div className="border border-destructive/50 rounded-lg p-4 text-destructive flex items-center gap-2">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TIERS.map((tier) => {
          const Icon = tier.icon;
          return (
            <button
              key={tier.id}
              onClick={() => handleSelectTier(tier.id)}
              disabled={loading}
              className={`text-left border rounded-lg p-6 space-y-3 transition-colors hover:border-primary hover:bg-accent/50 ${
                tier.highlight ? "border-primary/50 bg-primary/5" : ""
              } ${
                loading && selectedTier === tier.id
                  ? "opacity-50 cursor-wait"
                  : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">{tier.label}</h3>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{tier.sats}</span>
                <span className="text-sm text-muted-foreground">sats</span>
                <span className="text-sm text-muted-foreground">
                  ({tier.usd})
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {tier.description}
              </p>
              {loading && selectedTier === tier.id && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
            </button>
          );
        })}
      </div>

      <div className="text-xs text-muted-foreground space-y-1 border-t pt-4">
        <p>
          <strong>Disclaimer:</strong> This is a prepaid usage and supporter
          program. Contributions are non-refundable. No tokens, equity, or
          revenue sharing is offered. There is no expectation of profit or
          return on any contribution.
        </p>
        <p>
          Credits are for use within the ugig.net platform only. Lifetime
          Premium includes all current and future premium features at no
          additional cost.
        </p>
      </div>
    </div>
  );
}
