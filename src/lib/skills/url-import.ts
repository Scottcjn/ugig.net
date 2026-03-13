/**
 * URL Import Pipeline for skill files.
 *
 * Fetches a skill file from a remote URL, validates it, runs a security scan,
 * persists the imported artifact to Supabase Storage, and records scan metadata.
 */

import { createHash } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getDefaultScanner,
  scanWithRetry,
  type ScanResult,
} from "@/lib/skills/security-scan";

const BUCKET = "skill-files";
const MAX_FETCH_SIZE = 50 * 1024 * 1024; // 50 MB
const FETCH_TIMEOUT_MS = 15_000;

const ALLOWED_CONTENT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/octet-stream",
  "application/json",
  "application/zip",
  "application/gzip",
  "application/x-tar",
  "application/x-gzip",
  "application/x-compressed-tar",
]);

export interface ImportResult {
  success: boolean;
  storagePath: string | null;
  contentHash: string;
  fileSizeBytes: number;
  fileName: string;
  scanResult: ScanResult;
  scanSource: string;
  sourceUrl: string;
  findingsCountBySeverity: Record<string, number>;
  error?: string;
}

/**
 * Fetch a skill file from a URL, scan it, and persist to storage.
 */
export async function importSkillFromUrl(opts: {
  skillFileUrl: string;
  sellerId: string;
  listingSlug: string;
  listingId: string;
}): Promise<ImportResult> {
  const { skillFileUrl, sellerId, listingSlug, listingId } = opts;

  // ── Fetch remote file ──────────────────────────────────────────
  let buffer: Buffer;
  let fileName: string;
  let contentType: string;

  try {
    const res = await fetch(skillFileUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "SkillScanner/0.1 (ugig.net)" },
      redirect: "follow",
    });

    if (!res.ok) {
      return makeError(`Failed to fetch URL: HTTP ${res.status}`, skillFileUrl);
    }

    // Check content-length before downloading body
    const contentLength = parseInt(res.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_FETCH_SIZE) {
      return makeError(`File too large (${contentLength} bytes, max ${MAX_FETCH_SIZE})`, skillFileUrl);
    }

    contentType = (res.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();

    // Validate content type (relaxed: allow any text/*, common archives, and octet-stream)
    const isAllowed =
      contentType.startsWith("text/") ||
      ALLOWED_CONTENT_TYPES.has(contentType);

    if (!isAllowed) {
      return makeError(`Unsupported content type: ${contentType}`, skillFileUrl);
    }

    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_FETCH_SIZE) {
      return makeError(`File too large after download (${ab.byteLength} bytes)`, skillFileUrl);
    }

    buffer = Buffer.from(ab);

    // Derive filename from URL path
    try {
      const urlPath = new URL(skillFileUrl).pathname;
      fileName = urlPath.split("/").pop() || "skill-file";
    } catch {
      fileName = "skill-file";
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return makeError(`Failed to fetch URL: ${msg}`, skillFileUrl);
  }

  // ── Compute hash ───────────────────────────────────────────────
  const contentHash = createHash("sha256").update(buffer).digest("hex");

  // ── Run security scan ──────────────────────────────────────────
  const scanner = getDefaultScanner();
  const scanResult = await scanWithRetry(scanner, buffer, fileName, {
    maxRetries: 2,
    timeoutMs: 30_000,
  });

  // Count findings by severity
  const findingsCountBySeverity: Record<string, number> = {};
  for (const f of scanResult.findings) {
    findingsCountBySeverity[f.severity] = (findingsCountBySeverity[f.severity] || 0) + 1;
  }

  // ── Persist to Supabase Storage ────────────────────────────────
  const storagePath = `${sellerId}/${listingSlug}/${fileName}`;

  const admin = createServiceClient();
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: contentType || "application/octet-stream",
      upsert: true,
    });

  if (uploadError) {
    console.error("Storage upload error during URL import:", uploadError);
    return {
      success: false,
      storagePath: null,
      contentHash,
      fileSizeBytes: buffer.length,
      fileName,
      scanResult,
      scanSource: "url_import",
      sourceUrl: skillFileUrl,
      findingsCountBySeverity,
      error: "Failed to store imported file",
    };
  }

  // ── Persist scan record ────────────────────────────────────────
  // Determine risk_level
  let riskLevel = scanResult.status === "clean" ? "none" : scanResult.status;
  if (scanResult.findings.length > 0) {
    const severityOrder = ["critical", "high", "medium", "low"];
    for (const sev of severityOrder) {
      if (scanResult.findings.some((f) => f.severity === sev)) {
        riskLevel = sev;
        break;
      }
    }
  }

  await admin
    .from("skill_security_scans" as any)
    .insert({
      listing_id: listingId,
      file_path: storagePath,
      file_hash: scanResult.fileHash,
      file_size_bytes: scanResult.fileSizeBytes,
      scan_status: scanResult.status,
      scan_source: "url_import",
      source_url: skillFileUrl,
      content_hash: contentHash,
      scanner_version: scanResult.scannerVersion,
      findings_count_by_severity: findingsCountBySeverity,
      findings_summary: {
        risk_level: riskLevel,
        issues: scanResult.findings.map((f) => ({
          severity: f.severity,
          detail: f.detail,
        })),
        scanner_version: scanResult.scannerVersion,
      },
      scanned_at: new Date().toISOString(),
    });

  // ── Update listing with imported file path + scan metadata ─────
  await admin
    .from("skill_listings" as any)
    .update({
      skill_file_path: storagePath,
      scan_status: scanResult.status,
      content_hash: contentHash,
      scan_source: "url_import",
    })
    .eq("id", listingId);

  return {
    success: true,
    storagePath,
    contentHash,
    fileSizeBytes: buffer.length,
    fileName,
    scanResult,
    scanSource: "url_import",
    sourceUrl: skillFileUrl,
    findingsCountBySeverity,
  };
}

function makeError(error: string, sourceUrl: string): ImportResult {
  return {
    success: false,
    storagePath: null,
    contentHash: "",
    fileSizeBytes: 0,
    fileName: "",
    scanResult: {
      status: "error",
      fileHash: "",
      fileSizeBytes: 0,
      findings: [],
      scannerVersion: "",
    },
    scanSource: "url_import",
    sourceUrl,
    findingsCountBySeverity: {},
    error,
  };
}
