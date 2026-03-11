"use client";

import { useState } from "react";
import { Shield, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SecurityScanBadge } from "./SecurityScanBadge";

interface ScanIssue {
  severity: string;
  detail: string;
}

interface ScanResponse {
  status: string;
  risk_level: string;
  issues_count: number;
  issues: ScanIssue[];
  file_hash: string;
  scanner_version: string;
  scanned_at: string;
  content_hash?: string;
  scan_source?: string;
  source_url?: string;
  findings_count_by_severity?: Record<string, number>;
}

interface GenerateScanButtonProps {
  slug: string;
  /** Whether the listing has any scannable content (file or URL). */
  hasScannable: boolean;
}

export function GenerateScanButton({ slug, hasScannable }: GenerateScanButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);

  if (!hasScannable) return null;

  async function handleScan() {
    setLoading(true);
    setError(null);
    setScanResult(null);

    try {
      const res = await fetch(`/api/skills/${slug}/scan`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Scan failed");
        return;
      }

      setScanResult(data.scan);
    } catch {
      setError("Scan failed — try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        onClick={handleScan}
        disabled={loading}
        className="w-full"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : scanResult ? (
          <RefreshCw className="h-4 w-4 mr-2" />
        ) : (
          <Shield className="h-4 w-4 mr-2" />
        )}
        {loading ? "Scanning…" : scanResult ? "Re-scan" : "Generate Security Report"}
      </Button>

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      {scanResult && (
        <div className="p-3 border border-border rounded-lg bg-muted/30">
          <SecurityScanBadge
            status={scanResult.status}
            riskLevel={scanResult.risk_level}
            issuesCount={scanResult.issues_count}
            issues={scanResult.issues}
            scannedAt={scanResult.scanned_at}
            scannerVersion={scanResult.scanner_version}
            contentHash={scanResult.content_hash}
            scanSource={scanResult.scan_source}
            sourceUrl={scanResult.source_url}
            findingsCountBySeverity={scanResult.findings_count_by_severity}
          />
        </div>
      )}
    </div>
  );
}
