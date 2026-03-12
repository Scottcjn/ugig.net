"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SkillDownloadButtonProps {
  slug: string;
  hasFile: boolean;
}

export function SkillDownloadButton({ slug, hasFile }: SkillDownloadButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hasFile) return null;

  async function handleDownload() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/skills/${slug}/download`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Download failed");
        return;
      }

      // Redirect to signed URL
      window.open(data.url, "_blank");
    } catch {
      setError("Download failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Button
        onClick={handleDownload}
        disabled={loading}
        variant="outline"
        className="w-full"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}
        Download Skill
      </Button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
