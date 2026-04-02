import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ExternalLink, ArrowLeft, Calendar, MessageSquare } from "lucide-react";
import { DirectoryOwnerActions } from "./DirectoryOwnerActions";
import { DirectoryVoteButton } from "@/components/directory/DirectoryVoteButton";
import { DirectoryComments } from "@/components/directory/DirectoryComments";
import { ZapButton } from "@/components/zaps/ZapButton";

interface DirectoryDetailProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: DirectoryDetailProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: listing } = await supabase
    .from("project_listings" as any)
    .select("title, description")
    .eq("id", id)
    .single();

  if (!listing) return { title: "Not Found | ugig.net" };

  return {
    title: `${(listing as any).title} | Project Directory | ugig.net`,
    description: (listing as any).description || `${(listing as any).title} on ugig.net project directory`,
  };
}

export default async function DirectoryDetailPage({
  params,
}: DirectoryDetailProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: listing } = await supabase
    .from("project_listings" as any)
    .select(
      `*, user:profiles!user_id (id, username, full_name, avatar_url)`
    )
    .eq("id", id)
    .single();

  if (!listing) notFound();

  const l = listing as any;

  // Check if current user is the owner
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = user?.id === l.user_id;
  const isAuthenticated = !!user;

  // Fetch current user's vote
  let initialUserVote: number | null = null;
  if (user) {
    const { data: vote } = await supabase
      .from("directory_votes" as any)
      .select("vote_type")
      .eq("listing_id", id)
      .eq("user_id", user.id)
      .single();
    if (vote) {
      initialUserVote = (vote as any).vote_type;
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <Link
            href="/directory"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Directory
          </Link>

          <div className="border border-border rounded-lg bg-card overflow-hidden">
            {/* Banner */}
            {l.banner_url && (
              <img
                src={l.banner_url}
                alt=""
                className="w-full h-48 object-cover"
              />
            )}

            <div className="p-6 md:p-8">
            {/* Header */}
            <div className="flex items-start gap-4 mb-6">
              {l.logo_url && (
                <img
                  src={l.logo_url}
                  alt=""
                  className="w-64 h-auto rounded-xl object-contain shrink-0"
                />
              )}
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl md:text-3xl font-bold mb-1">
                  {l.title}
                </h1>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
                >
                  <ExternalLink className="h-4 w-4" />
                  {l.url}
                </a>
              </div>
            </div>

            {/* Description */}
            {l.description && (
              <p className="text-muted-foreground mb-6 whitespace-pre-wrap">
                {l.description}
              </p>
            )}

            {/* Tags */}
            {l.tags && l.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {l.tags.map((tag: string) => (
                  <Link key={tag} href={`/directory?tag=${tag}`}>
                    <Badge variant="secondary" className="cursor-pointer">
                      {tag}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground border-t border-border pt-4">
              <Link
                href={`/${l.user?.username}`}
                className="flex items-center gap-2 hover:text-foreground"
              >
                <Avatar className="h-6 w-6">
                  {l.user?.avatar_url && (
                    <AvatarImage src={l.user.avatar_url} />
                  )}
                  <AvatarFallback className="text-[10px]">
                    {(l.user?.username || "?")[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span>Listed by {l.user?.username}</span>
              </Link>
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {new Date(l.created_at).toLocaleDateString()}
              </span>
              {l.comments_count > 0 && (
                <span className="flex items-center gap-1">
                  <MessageSquare className="h-4 w-4" />
                  {l.comments_count}
                </span>
              )}
            </div>

            {/* Vote, Zap, and Visit button */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a href={l.url} target="_blank" rel="noopener noreferrer">
                <Button>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Visit Project
                </Button>
              </a>
              <DirectoryVoteButton
                listingId={id}
                initialUpvotes={l.upvotes ?? 0}
                initialDownvotes={l.downvotes ?? 0}
                initialScore={l.score ?? 0}
                initialUserVote={initialUserVote}
              />
              <ZapButton
                targetType="directory"
                targetId={id}
                recipientId={l.user_id}
                totalSats={l.zaps_total ?? 0}
              />
            </div>

            {/* Homepage Screenshot */}
            {l.screenshot_url && (
              <div className="mt-6">
                <h2 className="text-sm font-medium text-muted-foreground mb-2">Homepage Preview</h2>
                <img
                  src={l.screenshot_url}
                  alt={`${l.title} homepage`}
                  className="w-full rounded-lg border border-border shadow-sm"
                />
              </div>
            )}

            {/* Owner actions */}
            {isOwner && (
              <DirectoryOwnerActions listing={l} />
            )}
          </div>
          </div>

          {/* Comments section */}
          <div className="mt-8 border border-border rounded-lg bg-card p-6 md:p-8">
            <DirectoryComments
              listingId={id}
              isAuthenticated={isAuthenticated}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
