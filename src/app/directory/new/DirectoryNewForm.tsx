"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Zap, ArrowLeft } from "lucide-react";
import { createClient as createBrowserClient } from "@/lib/supabase/client";

export function DirectoryNewForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    async function init() {
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login?redirect=/directory/new");
        return;
      }
      setCheckingAuth(false);

      try {
        const res = await fetch("/api/wallet/balance");
        if (res.ok) {
          const data = await res.json();
          setBalance(data.balance_sats ?? data.balance ?? null);
        }
      } catch {
        // balance display is optional
      }
    }
    init();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const body: Record<string, any> = { title, url };
      if (description) body.description = description;
      if (tags.length > 0) body.tags = tags;
      if (logoUrl) body.logo_url = logoUrl;

      const res = await fetch("/api/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create listing");
        setLoading(false);
        return;
      }

      router.push("/directory?success=1");
    } catch {
      setError("An unexpected error occurred");
      setLoading(false);
    }
  }

  if (checkingAuth) {
    return (
      <div className="max-w-lg mx-auto text-center text-muted-foreground py-12">
        Loading...
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <Link
        href="/directory"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Directory
      </Link>

      <h1 className="text-3xl font-bold mb-2">List Your Project</h1>
      <p className="text-muted-foreground mb-6">
        Add your project to the directory for 500 ⚡ sats. Listing is active for
        1 year.
      </p>

      {balance !== null && (
        <div className="flex items-center gap-2 mb-6 p-3 bg-muted/30 rounded-lg text-sm">
          <Zap className="h-4 w-4 text-amber-500" />
          <span>
            Wallet balance: <strong>{balance.toLocaleString()} sats</strong>
          </span>
          {balance < 500 && (
            <span className="text-destructive ml-auto">
              Need at least 500 sats
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="mb-6 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <Label htmlFor="title">
            Project Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My Awesome Project"
            maxLength={100}
            required
          />
        </div>

        <div>
          <Label htmlFor="url">
            Project URL <span className="text-destructive">*</span>
          </Label>
          <Input
            id="url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            required
          />
        </div>

        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of your project (max 500 chars)"
            maxLength={500}
            rows={3}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {description.length}/500
          </p>
        </div>

        <div>
          <Label htmlFor="tags">Tags</Label>
          <Input
            id="tags"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="bitcoin, saas, open-source (comma-separated)"
          />
        </div>

        <div>
          <Label htmlFor="logo_url">Logo URL</Label>
          <Input
            id="logo_url"
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://example.com/logo.png"
          />
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={loading || !title || !url}
        >
          {loading ? (
            "Processing..."
          ) : (
            <>
              <Zap className="h-4 w-4 mr-1" />
              Pay 500 ⚡ & List
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
