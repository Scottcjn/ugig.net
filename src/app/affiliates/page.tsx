"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SKILL_CATEGORIES, AFFILIATE_PRODUCT_TYPES } from "@/lib/constants";

interface AffiliateOffer {
  id: string;
  slug: string;
  title: string;
  description: string;
  product_type: string;
  price_sats: number;
  commission_rate: number;
  commission_type: string;
  commission_flat_sats: number;
  cookie_days: number;
  total_affiliates: number;
  total_conversions: number;
  total_revenue_sats: number;
  category: string | null;
  tags: string[];
  created_at: string;
  profiles?: { username: string; avatar_url: string | null };
  skill_listings?: { title: string; slug: string } | null;
}

function formatSats(sats: number): string {
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1)}M`;
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(1)}K`;
  return sats.toLocaleString();
}

function commissionDisplay(offer: AffiliateOffer): string {
  if (offer.commission_type === "flat") {
    return `${formatSats(offer.commission_flat_sats)} sats/sale`;
  }
  return `${Math.round(offer.commission_rate * 100)}%`;
}

export default function AffiliatesPage() {
  const [offers, setOffers] = useState<AffiliateOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("newest");
  const [total, setTotal] = useState(0);

  const [fetchTrigger, setFetchTrigger] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (sort) params.set("sort", sort);
    if (search) params.set("q", search);

    fetch(`/api/affiliates/offers?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setOffers(data.offers || []);
          setTotal(data.total || 0);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [category, sort, fetchTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setFetchTrigger((n) => n + 1);
  }

  return (
    <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Affiliate Marketplace</h1>
          <p className="text-muted-foreground mt-1">
            Promote products and earn commissions in sats
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/affiliates">
            <Button variant="outline">My Dashboard</Button>
          </Link>
          <Link href="/affiliates/new">
            <Button>Create Offer</Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[200px]">
          <Input
            placeholder="Search offers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button type="submit" variant="outline">Search</Button>
        </form>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Categories</SelectItem>
            {SKILL_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="commission">Highest Commission</SelectItem>
            <SelectItem value="popular">Most Affiliates</SelectItem>
            <SelectItem value="revenue">Top Revenue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading offers...</div>
      ) : offers.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">No affiliate offers yet</p>
          <Link href="/affiliates/new">
            <Button>Create the first offer</Button>
          </Link>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">{total} offer{total !== 1 ? "s" : ""}</p>
          <div className="grid gap-4">
            {offers.map((offer) => (
              <Link
                key={offer.id}
                href={`/affiliates/${offer.slug}`}
                className="block border rounded-lg p-5 hover:border-primary transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-semibold truncate">{offer.title}</h3>
                      <Badge variant="outline" className="shrink-0">
                        {offer.product_type}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                      {offer.description}
                    </p>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {offer.profiles?.username && (
                        <span>by @{offer.profiles.username}</span>
                      )}
                      {offer.price_sats > 0 && (
                        <span>{formatSats(offer.price_sats)} sats</span>
                      )}
                      <span>{offer.cookie_days}d cookie</span>
                      <span>{offer.total_affiliates} affiliates</span>
                      <span>{offer.total_conversions} sales</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {commissionDisplay(offer)}
                    </div>
                    <div className="text-xs text-muted-foreground">commission</div>
                    {offer.total_revenue_sats > 0 && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatSats(offer.total_revenue_sats)} sats volume
                      </div>
                    )}
                  </div>
                </div>
                {offer.tags.length > 0 && (
                  <div className="flex gap-1 mt-3">
                    {offer.tags.slice(0, 5).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
