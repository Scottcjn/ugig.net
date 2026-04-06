"use client";

import { useState } from "react";
import { FileText, Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PromptDownloadButtonProps {
  slug: string;
}

export function PromptDownloadButton({ slug }: PromptDownloadButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promptInfo, setPromptInfo] = useState<{
    prompt_text: string;
    model_compatibility: string[];
    example_output: string | null;
    use_case: string | null;
    title: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleDownload() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/prompts/${slug}/download`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to get prompt details");
        return;
      }

      setPromptInfo(data);
    } catch {
      setError("Failed to get prompt details");
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (promptInfo) {
    return (
      <div className="space-y-3">
        <div className="p-4 bg-muted/50 border border-border rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Full Prompt
            </p>
            <button
              onClick={() => copyToClipboard(promptInfo.prompt_text)}
              className="p-1.5 rounded-md hover:bg-muted transition-colors shrink-0"
              title="Copy prompt"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          </div>

          <pre className="text-xs bg-background border border-border rounded px-3 py-2 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
            {promptInfo.prompt_text}
          </pre>

          {promptInfo.model_compatibility.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Compatible Models</p>
              <div className="flex flex-wrap gap-1">
                {promptInfo.model_compatibility.map((model) => (
                  <span
                    key={model}
                    className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full"
                  >
                    {model}
                  </span>
                ))}
              </div>
            </div>
          )}

          {promptInfo.example_output && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Example Output</p>
              <pre className="text-xs bg-background border border-border rounded px-3 py-2 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                {promptInfo.example_output}
              </pre>
            </div>
          )}
        </div>
      </div>
    );
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
          <FileText className="h-4 w-4 mr-2" />
        )}
        View Full Prompt
      </Button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
