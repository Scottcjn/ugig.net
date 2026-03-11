"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SKILL_CATEGORIES } from "@/lib/constants";
import { Loader2, Trash2 } from "lucide-react";

interface SkillListingFormProps {
  slug?: string; // If editing
  initialData?: {
    title: string;
    tagline: string;
    description: string;
    price_sats: number;
    category: string;
    tags: string[];
    status: string;
  };
}

export function SkillListingForm({ slug, initialData }: SkillListingFormProps) {
  const router = useRouter();
  const isEdit = !!slug;

  const [title, setTitle] = useState(initialData?.title || "");
  const [tagline, setTagline] = useState(initialData?.tagline || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [priceSats, setPriceSats] = useState(initialData?.price_sats?.toString() || "0");
  const [category, setCategory] = useState(initialData?.category || "");
  const [tagsInput, setTagsInput] = useState(initialData?.tags?.join(", ") || "");
  const [status, setStatus] = useState(initialData?.status || "draft");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const body = {
      title,
      tagline,
      description,
      price_sats: parseInt(priceSats) || 0,
      category: category || undefined,
      tags,
      status,
    };

    try {
      const url = isEdit ? `/api/skills/${slug}` : "/api/skills";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save");
        return;
      }

      const newSlug = data.listing?.slug || slug;
      router.push(`/skills/${newSlug}`);
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Archive this skill listing? It will be hidden from the marketplace.")) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/skills/${slug}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/dashboard/skills");
        router.refresh();
      }
    } catch {
      // ignore
    }
    setDeleting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. GitHub PR Reviewer Agent"
          required
          minLength={3}
          maxLength={120}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tagline">Tagline</Label>
        <Input
          id="tagline"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="A brief one-liner about what this skill does"
          maxLength={200}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description *</Label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what this skill does, how to use it, requirements..."
          rows={8}
          required
          minLength={10}
          maxLength={10000}
          className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="price">Price (sats)</Label>
          <Input
            id="price"
            type="number"
            min="0"
            value={priceSats}
            onChange={(e) => setPriceSats(e.target.value)}
            placeholder="0 = free"
          />
          <p className="text-xs text-muted-foreground">0 for free listing</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Select category</option>
            {SKILL_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tags">Tags</Label>
        <Input
          id="tags"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="e.g. github, code-review, automation (comma separated)"
        />
      </div>

      <div className="space-y-2">
        <Label>Status</Label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="status"
              value="draft"
              checked={status === "draft"}
              onChange={(e) => setStatus(e.target.value)}
            />
            <span className="text-sm">Draft</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="status"
              value="active"
              checked={status === "active"}
              onChange={(e) => setStatus(e.target.value)}
            />
            <span className="text-sm">Active (visible on marketplace)</span>
          </label>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEdit ? "Save Changes" : "Create Listing"}
        </Button>

        {isEdit && (
          <Button
            type="button"
            variant="outline"
            onClick={handleDelete}
            disabled={deleting}
            className="text-red-500 hover:text-red-600"
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Archive
          </Button>
        )}
      </div>
    </form>
  );
}
