import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getDefaultScanner,
  scanWithRetry,
  type ScanResult,
} from "@/lib/skills/security-scan";

const BUCKET = "skill-files";
const MAX_FETCH_SIZE = 50 * 1024 * 1024; // 50 MB

/**
 * POST /api/skills/[slug]/scan — Generate a security report
 *
 * Triggers a SecureClaw scan on the skill's content. Resolves content from
 * (in priority order):
 *   1. Uploaded file in storage (skill_file_path)
 *   2. Remote skill_file_url (fetched server-side)
 *
 * Only the listing owner (seller) can trigger a scan.
 *
 * Persists a skill_security_scans row and updates the listing's
 * cached scan_status. Returns sanitised findings (no internal rule names).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createServiceClient();

    // Fetch listing
    const { data: listing, error: listingError } = await admin
      .from("skill_listings" as any)
      .select("id, seller_id, slug, skill_file_path, skill_file_url")
      .eq("slug", slug)
      .single();

    if (listingError || !listing) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const l = listing as any;

    // Only owner can trigger scans
    if (l.seller_id !== auth.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── Resolve content ───────────────────────────────────────────
    let buffer: Buffer | null = null;
    let fileName = "skill-file";

    // Priority 1: stored file in Supabase Storage
    if (l.skill_file_path) {
      const { data: fileData, error: dlError } = await admin.storage
        .from(BUCKET)
        .download(l.skill_file_path);

      if (!dlError && fileData) {
        const ab = await fileData.arrayBuffer();
        buffer = Buffer.from(ab);
        fileName = l.skill_file_path.split("/").pop() || fileName;
      }
    }

    // Priority 2: remote skill_file_url
    if (!buffer && l.skill_file_url) {
      try {
        const res = await fetch(l.skill_file_url, {
          signal: AbortSignal.timeout(15_000),
          headers: { "User-Agent": "SecureClaw/0.1 (ugig.net)" },
        });

        if (res.ok) {
          const contentLength = parseInt(res.headers.get("content-length") || "0", 10);
          if (contentLength > MAX_FETCH_SIZE) {
            return NextResponse.json(
              { error: "Remote file too large for scanning" },
              { status: 422 }
            );
          }

          const ab = await res.arrayBuffer();
          if (ab.byteLength > MAX_FETCH_SIZE) {
            return NextResponse.json(
              { error: "Remote file too large for scanning" },
              { status: 422 }
            );
          }

          buffer = Buffer.from(ab);
          // Derive filename from URL path
          try {
            const urlPath = new URL(l.skill_file_url).pathname;
            fileName = urlPath.split("/").pop() || fileName;
          } catch {
            /* keep default */
          }
        }
      } catch {
        // fetch failed — fall through
      }
    }

    if (!buffer) {
      return NextResponse.json(
        { error: "No scannable content — upload a file or set a skill file URL" },
        { status: 422 }
      );
    }

    // ── Run scan ──────────────────────────────────────────────────
    const scanner = getDefaultScanner();
    const scanResult: ScanResult = await scanWithRetry(scanner, buffer, fileName, {
      maxRetries: 2,
      timeoutMs: 30_000,
    });

    // Determine risk_level from highest severity finding
    let riskLevel: string = scanResult.status === "clean" ? "none" : scanResult.status;
    if (scanResult.findings.length > 0) {
      const severityOrder = ["critical", "high", "medium", "low"];
      for (const sev of severityOrder) {
        if (scanResult.findings.some((f) => f.severity === sev)) {
          riskLevel = sev;
          break;
        }
      }
    }

    // ── Compute content hash + findings by severity ─────────────
    const { createHash } = await import("crypto");
    const contentHash = createHash("sha256").update(buffer).digest("hex");

    const findingsCountBySeverity: Record<string, number> = {};
    for (const f of scanResult.findings) {
      findingsCountBySeverity[f.severity] = (findingsCountBySeverity[f.severity] || 0) + 1;
    }

    // Determine scan source
    const scanSource = l.skill_file_path ? "rescan" : "url_import";
    const sourceUrl = l.skill_file_url || null;

    // ── If content came from URL and no stored file, persist to storage ──
    if (!l.skill_file_path && l.skill_file_url && scanResult.status !== "malicious") {
      const storagePath = `${l.seller_id}/${l.slug}/${fileName}`;
      const { error: uploadErr } = await admin.storage
        .from(BUCKET)
        .upload(storagePath, buffer, {
          contentType: "application/octet-stream",
          upsert: true,
        });

      if (!uploadErr) {
        // Update listing with imported file path
        await admin
          .from("skill_listings" as any)
          .update({ skill_file_path: storagePath })
          .eq("id", l.id);
      }
    }

    // ── Persist scan record ───────────────────────────────────────
    const filePath = l.skill_file_path || l.skill_file_url || "url-scan";
    const scannedAt = new Date().toISOString();

    const { data: scanRecord, error: scanInsertError } = await admin
      .from("skill_security_scans" as any)
      .insert({
        listing_id: l.id,
        file_path: filePath,
        file_hash: scanResult.fileHash,
        file_size_bytes: scanResult.fileSizeBytes,
        scan_status: scanResult.status,
        scan_source: scanSource,
        source_url: sourceUrl,
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
        scanned_at: scannedAt,
      })
      .select("id")
      .single();

    if (scanInsertError) {
      console.error("Failed to persist scan record:", scanInsertError);
    }

    // Update listing cached scan_status + metadata
    await admin
      .from("skill_listings" as any)
      .update({
        scan_status: scanResult.status,
        content_hash: contentHash,
        scan_source: scanSource,
      })
      .eq("id", l.id);

    // ── Return sanitised response ─────────────────────────────────
    return NextResponse.json({
      scan: {
        status: scanResult.status,
        risk_level: riskLevel,
        issues_count: scanResult.findings.length,
        issues: scanResult.findings.map((f) => ({
          severity: f.severity,
          detail: f.detail,
        })),
        file_hash: scanResult.fileHash,
        file_size_bytes: scanResult.fileSizeBytes,
        scanner_version: scanResult.scannerVersion,
        scan_id: (scanRecord as any)?.id ?? null,
        scanned_at: scannedAt,
        content_hash: contentHash,
        scan_source: scanSource,
        source_url: sourceUrl,
        findings_count_by_severity: findingsCountBySeverity,
      },
    });
  } catch (err) {
    console.error("Scan error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
