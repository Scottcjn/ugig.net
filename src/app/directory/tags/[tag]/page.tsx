import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, ExternalLink, FolderOpen, ThumbsUp, MessageSquare } from "lucide-react";

interface TagPageProps {
  params: Promise<{ tag: string }>;
}

export async function generateMetadata({
  params,
}: TagPageProps): Promise<Metadata> {
  const { tag } = await params;
  const decoded = decodeURIComponent(tag);
  return {
    title: `${decoded} projects | ugig.net directory`,
    description: `Discover projects tagged "${decoded}" in the ugig.net community directory.`,
  };
}

export default async function TagPage({ params }: TagPageProps) {
  const { tag } = await params;
  const decoded = decodeURIComponent(tag);
  const supabase = await createClient();

  const { data: listings } = await supabase
    .from("project_listings" as any)
    .select(
      `*, user:profiles!user_id (id, username, full_name, avatar_url)`
    )
    .eq("status", "active")
    .contains("tags", [decoded])
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <Link
            href="/directory"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Directory
          </Link>

          <h1 className="text-3xl font-bold mb-2">
            Projects tagged: <Badge variant="secondary" className="text-xl px-3 py-1">{decoded}</Badge>
          </h1>
          <p className="text-muted-foreground mb-8">
            {listings?.length ?? 0} project{(listings?.length ?? 0) !== 1 ? "s" : ""} found
          </p>

          {!listings || listings.length === 0 ? (
            <div className="text-center py-12 bg-muted/30 rounded-lg">
              <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                No projects found with this tag.
              </p>
              <Link href="/directory" className="text-primary hover:underline mt-2 inline-block">
                Browse all projects
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(listings as any[]).map((listing) => (
                <Link
                  key={listing.id}
                  href={`/directory/${listing.id}`}
                  className="group border border-border rounded-lg bg-card hover:shadow-md hover:border-primary/30 transition-all duration-200 overflow-hidden"
                >
                  {(listing.banner_url || listing.screenshot_url) && (
                    <img
                      src={listing.banner_url || listing.screenshot_url}
                      alt=""
                      className="w-full h-32 object-cover"
                    />
                  )}

                  <div className="p-5">
                    <div className="flex items-start gap-3 mb-3">
                      {listing.logo_url && (
                        <img
                          src={listing.logo_url}
                          alt=""
                          className="w-48 h-auto rounded-lg object-contain shrink-0"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-lg group-hover:text-primary transition-colors line-clamp-1">
                          {listing.title}
                        </h3>
                        <span className="text-xs text-muted-foreground flex items-center gap-1 line-clamp-1">
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          {listing.url.replace(/^https?:\/\//, "")}
                        </span>
                      </div>
                    </div>

                    {listing.description && (
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                        {listing.description}
                      </p>
                    )}

                    {listing.tags && listing.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {listing.tags.slice(0, 4).map((t: string) => (
                          <span
                            key={t}
                            className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground"
                          >
                            {t}
                          </span>
                        ))}
                        {listing.tags.length > 4 && (
                          <span className="text-xs text-muted-foreground">
                            +{listing.tags.length - 4}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          {listing.user?.avatar_url && (
                            <AvatarImage src={listing.user.avatar_url} />
                          )}
                          <AvatarFallback className="text-[10px]">
                            {(listing.user?.username || "?")[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span>{listing.user?.username}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {(listing.score != null && listing.score !== 0) && (
                          <span className={`flex items-center gap-0.5 ${listing.score > 0 ? "text-green-500" : listing.score < 0 ? "text-red-500" : ""}`}>
                            <ThumbsUp className="h-3.5 w-3.5" />
                            {listing.score}
                          </span>
                        )}
                        {(listing.comments_count != null && listing.comments_count > 0) && (
                          <span className="flex items-center gap-0.5">
                            <MessageSquare className="h-3.5 w-3.5" />
                            {listing.comments_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
