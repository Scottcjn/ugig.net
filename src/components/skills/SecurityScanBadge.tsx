import { Shield, ShieldAlert, ShieldCheck, ShieldX, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ScanIssue {
  severity: string;
  detail: string;
}

interface SecurityScanProps {
  status: string;
  riskLevel?: string | null;
  issuesCount: number;
  issues?: ScanIssue[];
  scannedAt?: string | null;
  scannerVersion?: string | null;
  contentHash?: string | null;
  scanSource?: string | null;
  sourceUrl?: string | null;
  findingsCountBySeverity?: Record<string, number> | null;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Shield; colorClass: string }
> = {
  clean: {
    label: "Clean",
    variant: "default",
    icon: ShieldCheck,
    colorClass: "text-green-500",
  },
  suspicious: {
    label: "Suspicious",
    variant: "secondary",
    icon: ShieldAlert,
    colorClass: "text-amber-500",
  },
  malicious: {
    label: "Malicious",
    variant: "destructive",
    icon: ShieldX,
    colorClass: "text-red-500",
  },
  pending: {
    label: "Scan Pending",
    variant: "outline",
    icon: Loader2,
    colorClass: "text-muted-foreground",
  },
  scanning: {
    label: "Scanning…",
    variant: "outline",
    icon: Loader2,
    colorClass: "text-muted-foreground",
  },
  error: {
    label: "Scan Error",
    variant: "outline",
    icon: ShieldAlert,
    colorClass: "text-muted-foreground",
  },
  timeout: {
    label: "Scan Timeout",
    variant: "outline",
    icon: ShieldAlert,
    colorClass: "text-muted-foreground",
  },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-red-500",
  high: "text-orange-500",
  medium: "text-amber-500",
  low: "text-blue-400",
};

export function SecurityScanBadge({
  status,
  riskLevel,
  issuesCount,
  issues,
  scannedAt,
  scannerVersion,
  contentHash,
  scanSource,
  sourceUrl,
  findingsCountBySeverity,
}: SecurityScanProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.error;
  const Icon = config.icon;
  const isSpinning = status === "pending" || status === "scanning";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon
          className={`h-4 w-4 ${config.colorClass} ${isSpinning ? "animate-spin" : ""}`}
        />
        <Badge variant={config.variant}>{config.label}</Badge>
        {riskLevel && (
          <span className={`text-xs font-medium capitalize ${SEVERITY_COLORS[riskLevel] ?? ""}`}>
            {riskLevel} risk
          </span>
        )}
      </div>

      {/* Findings by severity summary */}
      {findingsCountBySeverity && Object.keys(findingsCountBySeverity).length > 0 && (
        <div className="flex gap-2 ml-6">
          {["critical", "high", "medium", "low"].map((sev) => {
            const count = findingsCountBySeverity[sev];
            if (!count) return null;
            return (
              <span key={sev} className={`text-xs font-medium ${SEVERITY_COLORS[sev] ?? ""}`}>
                {count} {sev}
              </span>
            );
          })}
        </div>
      )}

      {issues && issues.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-0.5 ml-6">
          {issues.slice(0, 5).map((issue, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className={`font-medium capitalize ${SEVERITY_COLORS[issue.severity] ?? ""}`}>
                {issue.severity}:
              </span>
              <span>{issue.detail}</span>
            </li>
          ))}
          {issues.length > 5 && (
            <li className="text-muted-foreground/70">
              +{issues.length - 5} more finding{issues.length - 5 > 1 ? "s" : ""}
            </li>
          )}
        </ul>
      )}

      {/* Scan metadata */}
      <div className="text-xs text-muted-foreground/70 ml-6 space-y-0.5">
        {scannedAt && (
          <p>Scanned {new Date(scannedAt).toLocaleDateString()}</p>
        )}
        {scanSource && (
          <p>Source: {scanSource === "url_import" ? "URL import" : scanSource === "rescan" ? "Re-scan" : scanSource}</p>
        )}
        {contentHash && (
          <p className="font-mono">SHA-256: {contentHash.slice(0, 16)}…</p>
        )}
        {scannerVersion && (
          <p>Scanner: {scannerVersion}</p>
        )}
      </div>
    </div>
  );
}
