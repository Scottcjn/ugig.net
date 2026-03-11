"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Zap, Loader2, Check } from "lucide-react";

interface SkillPurchaseButtonProps {
  slug: string;
  priceSats: number;
}

export function SkillPurchaseButton({ slug, priceSats }: SkillPurchaseButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handlePurchase() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/skills/${slug}/purchase`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          router.push(`/login?redirect=/skills/${slug}`);
          return;
        }
        setError(data.error || "Purchase failed");
        return;
      }

      setSuccess(true);
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 text-green-600 rounded-lg font-medium">
          <Check className="h-4 w-4" /> Purchased!
        </div>
      </div>
    );
  }

  return (
    <div>
      <Button
        onClick={handlePurchase}
        disabled={loading}
        className="w-full"
        size="lg"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : priceSats === 0 ? (
          "Get for Free"
        ) : (
          <>
            <Zap className="h-4 w-4 mr-2" />
            Buy for {priceSats.toLocaleString()} sats
          </>
        )}
      </Button>
      {error && (
        <p className="text-sm text-red-500 mt-2 text-center">{error}</p>
      )}
    </div>
  );
}
