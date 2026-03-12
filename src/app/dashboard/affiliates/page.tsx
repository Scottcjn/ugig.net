"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface AffiliateStats {
  total_clicks_30d: number;
  total_conversions: number;
  total_earned_sats: number;
  total_pending_sats: number;
  active_offers: number;
}

interface SellerStats {
  total_offers: number;
  total_revenue_sats: number;
  total_commissions_sats: number;
  total_affiliates: number;
}

function formatSats(sats: number): string {
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1)}M`;
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(1)}K`;
  return sats.toLocaleString();
}

function StatCard({ label, value, suffix }: { label: string; value: string | number; suffix?: string }) {
  return (
    <div className="border rounded-lg p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">
        {value}{suffix && <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span>}
      </div>
    </div>
  );
}

export default function AffiliateDashboardPage() {
  const [affData, setAffData] = useState<any>(null);
  const [sellerData, setSellerData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("affiliate");

  useEffect(() => {
    Promise.all([
      fetch("/api/affiliates/my?view=affiliate").then((r) => r.json()),
      fetch("/api/affiliates/my?view=seller").then((r) => r.json()),
    ]).then(([aff, seller]) => {
      setAffData(aff);
      setSellerData(seller);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl">
        <p className="text-muted-foreground">Loading dashboard...</p>
      </main>
    );
  }

  const affStats: AffiliateStats = affData?.stats || {};
  const sellerStats: SellerStats = sellerData?.stats || {};

  return (
    <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Affiliate Dashboard</h1>
        <div className="flex gap-2">
          <Link href="/affiliates">
            <Button variant="outline">Marketplace</Button>
          </Link>
          <Link href="/affiliates/new">
            <Button>Create Offer</Button>
          </Link>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="affiliate">As Affiliate</TabsTrigger>
          <TabsTrigger value="seller">As Seller</TabsTrigger>
        </TabsList>

        {/* Affiliate view */}
        <TabsContent value="affiliate">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <StatCard label="Active Offers" value={affStats.active_offers || 0} />
            <StatCard label="Clicks (30d)" value={affStats.total_clicks_30d || 0} />
            <StatCard label="Conversions" value={affStats.total_conversions || 0} />
            <StatCard label="Earned" value={formatSats(affStats.total_earned_sats || 0)} suffix="sats" />
            <StatCard label="Pending" value={formatSats(affStats.total_pending_sats || 0)} suffix="sats" />
          </div>

          <h2 className="text-xl font-semibold mb-4">My Offers</h2>
          {(affData?.applications || []).length === 0 ? (
            <div className="text-center py-8 border rounded-lg">
              <p className="text-muted-foreground mb-3">You haven&apos;t joined any affiliate programs yet</p>
              <Link href="/affiliates">
                <Button>Browse Offers</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3 mb-8">
              {affData.applications.map((app: any) => (
                <div key={app.id} className="border rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{app.affiliate_offers?.title || "Unknown"}</span>
                      <Badge variant={app.status === "approved" ? "default" : "secondary"}>
                        {app.status}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {Math.round((app.affiliate_offers?.commission_rate || 0) * 100)}% commission
                      {app.affiliate_offers?.profiles?.username && (
                        <> · by @{app.affiliate_offers.profiles.username}</>
                      )}
                    </div>
                  </div>
                  {app.status === "approved" && (
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                        {app.tracking_code}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const url = `${window.location.origin}/api/affiliates/click?ref=${app.tracking_code}`;
                          navigator.clipboard.writeText(url);
                        }}
                      >
                        Copy Link
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {(affData?.conversions || []).length > 0 && (
            <>
              <h2 className="text-xl font-semibold mb-4">Recent Conversions</h2>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-3">Offer</th>
                      <th className="text-right p-3">Sale</th>
                      <th className="text-right p-3">Commission</th>
                      <th className="text-center p-3">Status</th>
                      <th className="text-right p-3">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {affData.conversions.map((conv: any) => (
                      <tr key={conv.id} className="border-t">
                        <td className="p-3">{conv.affiliate_offers?.title || "—"}</td>
                        <td className="text-right p-3">{formatSats(conv.sale_amount_sats)} sats</td>
                        <td className="text-right p-3 font-medium text-green-600 dark:text-green-400">
                          {formatSats(conv.commission_sats)} sats
                        </td>
                        <td className="text-center p-3">
                          <Badge variant={conv.status === "paid" ? "default" : "secondary"}>
                            {conv.status}
                          </Badge>
                        </td>
                        <td className="text-right p-3 text-muted-foreground">
                          {new Date(conv.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </TabsContent>

        {/* Seller view */}
        <TabsContent value="seller">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard label="Offers" value={sellerStats.total_offers || 0} />
            <StatCard label="Affiliates" value={sellerStats.total_affiliates || 0} />
            <StatCard label="Revenue" value={formatSats(sellerStats.total_revenue_sats || 0)} suffix="sats" />
            <StatCard label="Commissions Paid" value={formatSats(sellerStats.total_commissions_sats || 0)} suffix="sats" />
          </div>

          <h2 className="text-xl font-semibold mb-4">My Offers</h2>
          {(sellerData?.offers || []).length === 0 ? (
            <div className="text-center py-8 border rounded-lg">
              <p className="text-muted-foreground mb-3">You haven&apos;t created any affiliate offers yet</p>
              <Link href="/affiliates/new">
                <Button>Create an Offer</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {sellerData.offers.map((offer: any) => (
                <Link
                  key={offer.id}
                  href={`/affiliates/${offer.slug}`}
                  className="block border rounded-lg p-4 hover:border-primary transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{offer.title}</span>
                        <Badge variant={offer.status === "active" ? "default" : "secondary"}>
                          {offer.status}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {Math.round(offer.commission_rate * 100)}% commission
                        · {offer.total_affiliates} affiliates
                        · {offer.total_conversions} sales
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{formatSats(offer.total_revenue_sats || 0)} sats</div>
                      <div className="text-xs text-muted-foreground">revenue</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </main>
  );
}
