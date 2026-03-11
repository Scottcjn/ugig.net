import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Package, Star, Zap, ArrowLeft } from "lucide-react";

export const metadata = {
  title: "My Skill Library | ugig.net",
  description: "Skills you've purchased on ugig.net",
};

export default async function SkillLibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/skills/library");
  }

  // Use service client to get purchases with listing details
  const { createServiceClient } = await import("@/lib/supabase/service");
  const admin = createServiceClient();

  const { data: purchases } = await admin
    .from("skill_purchases" as any)
    .select(
      `
      id, price_sats, fee_sats, created_at,
      listing:skill_listings!listing_id (
        id, slug, title, tagline, price_sats, category, tags,
        cover_image_url, status, downloads_count, rating_avg, rating_count,
        seller:profiles!seller_id (id, username, full_name, avatar_url)
      )
    `
    )
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/skills"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="h-4 w-4" /> Back to marketplace
          </Link>

          <h1 className="text-3xl font-bold mb-2">My Skill Library</h1>
          <p className="text-muted-foreground mb-8">
            Skills you&apos;ve purchased. Access them anytime.
          </p>

          {!purchases || purchases.length === 0 ? (
            <div className="text-center py-12 bg-muted/30 rounded-lg">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                You haven&apos;t purchased any skills yet.
              </p>
              <Link
                href="/skills"
                className="text-primary hover:underline font-medium"
              >
                Browse the marketplace →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {(purchases as any[]).map((purchase) => {
                const listing = purchase.listing as any;
                if (!listing) return null;

                return (
                  <Link
                    key={purchase.id}
                    href={`/skills/${listing.slug}`}
                    className="flex items-center gap-4 p-4 border border-border rounded-lg bg-card hover:shadow-md hover:border-primary/30 transition-all duration-200"
                  >
                    <div className="p-3 bg-primary/10 rounded-xl">
                      <Package className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{listing.title}</h3>
                      {listing.tagline && (
                        <p className="text-sm text-muted-foreground truncate">
                          {listing.tagline}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Avatar className="h-4 w-4">
                            {listing.seller?.avatar_url && (
                              <AvatarImage src={listing.seller.avatar_url} />
                            )}
                            <AvatarFallback className="text-[8px]">
                              {(listing.seller?.username || "?")[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          {listing.seller?.username}
                        </span>
                        {listing.rating_count > 0 && (
                          <span className="flex items-center gap-1">
                            <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                            {Number(listing.rating_avg).toFixed(1)}
                          </span>
                        )}
                        <span>
                          Purchased{" "}
                          {new Date(purchase.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {purchase.price_sats === 0 ? (
                        <Badge variant="secondary">Free</Badge>
                      ) : (
                        <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                          <Zap className="h-3 w-3 mr-1" />
                          {purchase.price_sats.toLocaleString()}
                        </Badge>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
