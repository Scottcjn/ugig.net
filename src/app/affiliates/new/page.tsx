"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SKILL_CATEGORIES, AFFILIATE_PRODUCT_TYPES } from "@/lib/constants";

export default function NewOfferPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    title: "",
    description: "",
    product_url: "",
    product_type: "digital",
    price_sats: "",
    commission_rate: "20",
    commission_type: "percentage",
    cookie_days: "30",
    settlement_delay_days: "7",
    promo_text: "",
    category: "",
    tags: "",
  });

  function updateForm(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/affiliates/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        description: form.description,
        product_url: form.product_url || undefined,
        product_type: form.product_type,
        price_sats: parseInt(form.price_sats) || 0,
        commission_rate: parseFloat(form.commission_rate) / 100,
        commission_type: form.commission_type,
        cookie_days: parseInt(form.cookie_days) || 30,
        settlement_delay_days: parseInt(form.settlement_delay_days) || 7,
        promo_text: form.promo_text || undefined,
        category: form.category || undefined,
        tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      }),
    });

    const data = await res.json();

    if (res.ok) {
      router.push(`/affiliates/${data.offer.slug}`);
    } else {
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      setError(data.error || "Failed to create offer");
    }
    setLoading(false);
  }

  return (
    <main className="flex-1 container mx-auto px-4 py-8 max-w-2xl">
      <Link href="/affiliates" className="text-sm text-muted-foreground hover:underline mb-4 inline-block">
        ← Back to marketplace
      </Link>

      <h1 className="text-3xl font-bold mb-2">Create Affiliate Offer</h1>
      <p className="text-muted-foreground mb-6">
        Let affiliates promote your product and earn commissions in sats
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            value={form.title}
            onChange={(e) => updateForm("title", e.target.value)}
            placeholder="e.g., AI Coding Assistant Skill Pack"
            required
            minLength={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description *</Label>
          <Textarea
            id="description"
            value={form.description}
            onChange={(e) => updateForm("description", e.target.value)}
            placeholder="Describe what affiliates will be promoting. Supports markdown."
            rows={5}
            required
            minLength={10}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="product_type">Product Type</Label>
            <Select value={form.product_type} onValueChange={(v) => updateForm("product_type", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AFFILIATE_PRODUCT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select value={form.category} onValueChange={(v) => updateForm("category", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {SKILL_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="product_url">Product URL</Label>
          <Input
            id="product_url"
            type="url"
            value={form.product_url}
            onChange={(e) => updateForm("product_url", e.target.value)}
            placeholder="https://..."
          />
          <p className="text-xs text-muted-foreground">Where buyers land after clicking affiliate links</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="price_sats">Price (sats) *</Label>
            <Input
              id="price_sats"
              type="number"
              value={form.price_sats}
              onChange={(e) => updateForm("price_sats", e.target.value)}
              placeholder="10000"
              required
              min={0}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="commission_rate">Commission Rate (%)</Label>
            <Input
              id="commission_rate"
              type="number"
              value={form.commission_rate}
              onChange={(e) => updateForm("commission_rate", e.target.value)}
              placeholder="20"
              min={1}
              max={90}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cookie_days">Cookie Window (days)</Label>
            <Input
              id="cookie_days"
              type="number"
              value={form.cookie_days}
              onChange={(e) => updateForm("cookie_days", e.target.value)}
              min={1}
              max={365}
            />
            <p className="text-xs text-muted-foreground">How long clicks are attributed</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="settlement_delay_days">Settlement Delay (days)</Label>
            <Input
              id="settlement_delay_days"
              type="number"
              value={form.settlement_delay_days}
              onChange={(e) => updateForm("settlement_delay_days", e.target.value)}
              min={1}
              max={90}
            />
            <p className="text-xs text-muted-foreground">Hold period before payout</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="promo_text">Promo Materials (optional)</Label>
          <Textarea
            id="promo_text"
            value={form.promo_text}
            onChange={(e) => updateForm("promo_text", e.target.value)}
            placeholder="Swipe copy, talking points, or marketing materials for affiliates. Supports markdown."
            rows={4}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tags">Tags</Label>
          <Input
            id="tags"
            value={form.tags}
            onChange={(e) => updateForm("tags", e.target.value)}
            placeholder="ai, coding, automation (comma-separated)"
          />
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create Offer"}
          </Button>
          <Link href="/affiliates">
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
        </div>
      </form>
    </main>
  );
}
