"use client";

import { useState } from "react";
import { Shield, Loader2 } from "lucide-react";
import { PromptSecurityScanBadge } from "./PromptSecurityScanBadge";

interface PromptScanButtonProps {
  slug: string;
  currentStatus?: string;
}

interface ScanResponse {
  scan: {
    status: string;
    rating: string | null;
    security_score: number | null;
    findings_count: number;
    findings: Array<{ rule: string; severity: string; detail: string }>;
    scanner_version: string;
    scan_id: string | null;
    scanned_at: string;
  };
}

export function PromptScanButton({ slug, currentStatus }: PromptScanButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResponse["scan"] | null>(null);

  async function handleScan() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/prompts/${slug}/scan`, { method: "POST" });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Scan failed");
        return;
      }

      setResult(json.scan);
    } catch (err) {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={handleScan}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Scanning…
            </>
          ) : (
            <>
              <Shield className="h-4 w-4" />
              {currentStatus && currentStatus !== "unscanned" ? "Re-scan" : "Security Scan"}
            </>
          )}
        </button>
        {currentStatus && currentStatus !== "unscanned" && !result && (
          <span className="text-sm text-muted-foreground">
            Last scan: {currentStatus}
          </span>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      {result && (
        <PromptSecurityScanBadge
          status={result.status}
          rating={result.rating}
          securityScore={result.security_score}
          findingsCount={result.findings_count}
          findings={result.findings}
          scannedAt={result.scanned_at}
          scannerVersion={result.scanner_version}
        />
      )}
    </div>
  );
}
