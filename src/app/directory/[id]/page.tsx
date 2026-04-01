import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ExternalLink, ArrowLeft, Calendar } from "lucide-react";
import { DirectoryOwnerActions } from "./DirectoryOwnerActions";

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

          <div className="border border-border rounded-lg bg-card p-6 md:p-8">
            {/* Header */}
            <div className="flex items-start gap-4 mb-6">
              {l.logo_url && (
                <img
                  src={l.logo_url}
                  alt=""
                  className="w-16 max-h-24 rounded-xl object-contain shrink-0"
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
            </div>

            {/* Visit button */}
            <div className="mt-6">
              <a href={l.url} target="_blank" rel="noopener noreferrer">
                <Button>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Visit Project
                </Button>
              </a>
            </div>

            {/* Owner actions */}
            {isOwner && (
              <DirectoryOwnerActions listing={l} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
