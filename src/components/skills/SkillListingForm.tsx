"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SKILL_CATEGORIES } from "@/lib/constants";
import { Loader2, Trash2, Upload, Link as LinkIcon, Sparkles } from "lucide-react";

interface SkillListingFormProps {
  slug?: string; // If editing
  listingId?: string; // For file upload
  initialData?: {
    title: string;
    tagline: string;
    description: string;
    price_sats: number;
    category: string;
    tags: string[];
    status: string;
    source_url?: string;
    skill_file_url?: string;
    website_url?: string;
    skill_file_path?: string;
  };
}

export function SkillListingForm({ slug, listingId, initialData }: SkillListingFormProps) {
  const router = useRouter();
  const isEdit = !!slug;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(initialData?.title || "");
  const [tagline, setTagline] = useState(initialData?.tagline || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [priceSats, setPriceSats] = useState(initialData?.price_sats?.toString() || "0");
  const [category, setCategory] = useState(initialData?.category || "");
  const [tagsInput, setTagsInput] = useState(initialData?.tags?.join(", ") || "");
  const [status, setStatus] = useState(initialData?.status || "draft");
  const [sourceUrl, setSourceUrl] = useState(initialData?.source_url || "");
  const [skillFileUrl, setSkillFileUrl] = useState(initialData?.skill_file_url || "");
  const [websiteUrl, setWebsiteUrl] = useState(initialData?.website_url || "");
  const [skillFilePath, setSkillFilePath] = useState(initialData?.skill_file_path || "");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [autofilling, setAutofilling] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  async function handleAutofill() {
    if (!websiteUrl) return;
    setAutofilling(true);
    setError(null);

    try {
      const res = await fetch("/api/skills/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: websiteUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to fetch metadata");
        return;
      }

      const meta = data.metadata;
      if (meta.title && !title) setTitle(meta.title);
      if (meta.description && !description) setDescription(meta.description);
      if (meta.tags?.length && !tagsInput) setTagsInput(meta.tags.join(", "));
    } catch {
      setError("Failed to fetch metadata");
    } finally {
      setAutofilling(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Need a listing ID to upload
    const targetListingId = listingId;
    if (!targetListingId) {
      setError("Save the listing first before uploading a file.");
      return;
    }

    setUploading(true);
    setUploadStatus(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("listing_id", targetListingId);

      const res = await fetch("/api/skills/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.scan?.findings?.length) {
          setError(
            `Security scan: ${data.error} — ${data.scan.findings.map((f: any) => f.detail).join(", ")}`
          );
        } else {
          setError(data.error || "Upload failed");
        }
        return;
      }

      setSkillFilePath(data.file_path);
      setUploadStatus(`Uploaded (${data.scan.status}) — ${file.name}`);
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const body: Record<string, unknown> = {
      title,
      tagline,
      description,
      price_sats: parseInt(priceSats) || 0,
      category: category || undefined,
      tags,
      status,
      source_url: sourceUrl || undefined,
      skill_file_url: skillFileUrl || undefined,
      website_url: websiteUrl || undefined,
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
      {/* Skill File URL */}
      <div className="space-y-2">
        <Label htmlFor="skill_file_url">
          <LinkIcon className="h-3.5 w-3.5 inline mr-1" />
          Skill File URL <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id="skill_file_url"
          type="url"
          value={skillFileUrl}
          onChange={(e) => setSkillFileUrl(e.target.value)}
          placeholder="https://github.com/user/repo/blob/main/SKILL.md"
        />
        <p className="text-xs text-muted-foreground">
          Direct link to the skill file (e.g. SKILL.md on GitHub, npm package).
        </p>
      </div>

      {/* Website URL + Autofill */}
      <div className="space-y-2">
        <Label htmlFor="website_url">
          <LinkIcon className="h-3.5 w-3.5 inline mr-1" />
          Website URL <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <div className="flex gap-2">
          <Input
            id="website_url"
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://example.com/my-skill"
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAutofill}
            disabled={autofilling || !websiteUrl}
            className="shrink-0"
          >
            {autofilling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span className="ml-1.5 hidden sm:inline">Autofill from website</span>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Paste a website URL and click Autofill to populate title, description, and tags.
        </p>
      </div>

      {/* Legacy Source URL (hidden if empty, kept for backward compat) */}
      {sourceUrl && (
        <div className="space-y-2">
          <Label htmlFor="source_url">
            <LinkIcon className="h-3.5 w-3.5 inline mr-1" />
            Source URL <span className="text-muted-foreground font-normal">(legacy)</span>
          </Label>
          <Input
            id="source_url"
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://github.com/user/skill-repo"
          />
        </div>
      )}

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

      {/* File Upload */}
      <div className="space-y-2">
        <Label>
          <Upload className="h-3.5 w-3.5 inline mr-1" />
          Skill File
        </Label>
        {skillFilePath && (
          <p className="text-xs text-green-500">
            ✓ {uploadStatus || `File: ${skillFilePath.split("/").pop()}`}
          </p>
        )}
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileUpload}
            disabled={uploading || (!isEdit && !listingId)}
            className="text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 disabled:opacity-50"
          />
          {uploading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        {!isEdit && !listingId && (
          <p className="text-xs text-muted-foreground">
            Save the listing first, then upload a file.
          </p>
        )}
        {isEdit && !listingId && (
          <p className="text-xs text-amber-500">
            Listing ID needed for upload — refresh the page.
          </p>
        )}
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
