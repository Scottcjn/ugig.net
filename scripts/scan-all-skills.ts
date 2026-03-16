#!/usr/bin/env npx tsx
/**
 * Batch security scan for all skill listings.
 *
 * Scans every active skill listing that either:
 *   - Has never been scanned (scan_status IS NULL)
 *   - Or is forced via --all flag
 *
 * Usage:
 *   npx tsx scripts/scan-all-skills.ts          # scan unscanned only
 *   npx tsx scripts/scan-all-skills.ts --all    # rescan everything
 *   npx tsx scripts/scan-all-skills.ts --dry-run # show what would be scanned
 */

import { createClient } from "@supabase/supabase-js";
import { BuiltInScanner, scanWithRetry, SCANNER_VERSION } from "../src/lib/skills/security-scan";
import { createHash } from "crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "skill-files";
const MAX_FETCH_SIZE = 50 * 1024 * 1024;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  console.error("Run with: npx tsx --env-file=.env.local scripts/scan-all-skills.ts");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const scanner = new BuiltInScanner();

const args = process.argv.slice(2);
const scanAll = args.includes("--all");
const dryRun = args.includes("--dry-run");

async function main() {
  console.log(`\n🔍 Skill Security Scanner (${SCANNER_VERSION})`);
  console.log(`   Mode: ${scanAll ? "rescan all" : "unscanned only"}${dryRun ? " [DRY RUN]" : ""}\n`);

  // Fetch listings to scan
  let query = supabase
    .from("skill_listings")
    .select("id, slug, title, seller_id, skill_file_path, skill_file_url, scan_status")
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (!scanAll) {
    query = query.is("scan_status", null);
  }

  const { data: listings, error } = await query;

  if (error) {
    console.error("Failed to fetch listings:", error.message);
    process.exit(1);
  }

  if (!listings || listings.length === 0) {
    console.log("✅ No skills need scanning.");
    return;
  }

  console.log(`Found ${listings.length} skill(s) to scan:\n`);

  const results = { scanned: 0, clean: 0, suspicious: 0, malicious: 0, error: 0, noContent: 0 };

  for (const listing of listings) {
    const l = listing as any;
    process.stdout.write(`  [${results.scanned + 1}/${listings.length}] ${l.title} (${l.slug}) ... `);

    if (dryRun) {
      const source = l.skill_file_url ? "url" : l.skill_file_path ? "storage" : "none";
      console.log(`would scan (source: ${source})`);
      results.scanned++;
      continue;
    }

    // Resolve content
    let buffer: Buffer | null = null;
    let fileName = "skill-file";
    let resolvedSource: "url" | "stored" | null = null;

    // Try URL first
    if (l.skill_file_url) {
      try {
        const res = await fetch(l.skill_file_url, {
          signal: AbortSignal.timeout(15_000),
          headers: { "User-Agent": "SkillScanner/0.1 (ugig.net)" },
        });
        if (res.ok) {
          const ab = await res.arrayBuffer();
          if (ab.byteLength <= MAX_FETCH_SIZE) {
            buffer = Buffer.from(ab);
            resolvedSource = "url";
            try {
              fileName = new URL(l.skill_file_url).pathname.split("/").pop() || fileName;
            } catch { /* keep default */ }
          }
        }
      } catch { /* fallback to stored */ }
    }

    // Fallback to stored file
    if (!buffer && l.skill_file_path) {
      const { data: fileData, error: dlError } = await supabase.storage
        .from(BUCKET)
        .download(l.skill_file_path);
      if (!dlError && fileData) {
        const ab = await fileData.arrayBuffer();
        buffer = Buffer.from(ab);
        fileName = l.skill_file_path.split("/").pop() || fileName;
        resolvedSource = "stored";
      }
    }

    if (!buffer) {
      console.log("⏭️  no content to scan");
      results.noContent++;
      results.scanned++;
      continue;
    }

    // Run scan
    try {
      const scanResult = await scanWithRetry(scanner, buffer, fileName, {
        maxRetries: 1,
        timeoutMs: 30_000,
      });

      // Compute metadata
      const contentHash = createHash("sha256").update(buffer).digest("hex");
      const findingsCountBySeverity: Record<string, number> = {};
      for (const f of scanResult.findings) {
        findingsCountBySeverity[f.severity] = (findingsCountBySeverity[f.severity] || 0) + 1;
      }

      let riskLevel = scanResult.status === "clean" ? "none" : scanResult.status;
      if (scanResult.findings.length > 0) {
        for (const sev of ["critical", "high", "medium", "low"]) {
          if (scanResult.findings.some((f) => f.severity === sev)) {
            riskLevel = sev;
            break;
          }
        }
      }

      const scanSource = resolvedSource === "url" ? "url_import" : "batch_scan";
      const scannedAt = new Date().toISOString();

      // Persist scan record
      await supabase
        .from("skill_security_scans")
        .insert({
          listing_id: l.id,
          file_path: l.skill_file_path || l.skill_file_url || "batch-scan",
          file_hash: scanResult.fileHash,
          file_size_bytes: scanResult.fileSizeBytes,
          scan_status: scanResult.status,
          scan_source: scanSource,
          source_url: l.skill_file_url || null,
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
        });

      // Update listing cached scan_status
      await supabase
        .from("skill_listings")
        .update({
          scan_status: scanResult.status,
          content_hash: contentHash,
          scan_source: scanSource,
        })
        .eq("id", l.id);

      const statusEmoji = scanResult.status === "clean" ? "✅" : scanResult.status === "suspicious" ? "⚠️" : scanResult.status === "malicious" ? "🚨" : "❌";
      console.log(`${statusEmoji} ${scanResult.status} (${scanResult.findings.length} findings)`);

      results[scanResult.status as keyof typeof results] = ((results[scanResult.status as keyof typeof results] as number) || 0) + 1;
      results.scanned++;

      // Small delay to avoid hammering external URLs
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.log(`❌ error: ${err instanceof Error ? err.message : String(err)}`);
      results.error++;
      results.scanned++;
    }
  }

  console.log(`\n📊 Results:`);
  console.log(`   Scanned: ${results.scanned}`);
  console.log(`   Clean: ${results.clean}`);
  console.log(`   Suspicious: ${results.suspicious}`);
  console.log(`   Malicious: ${results.malicious}`);
  console.log(`   Errors: ${results.error}`);
  console.log(`   No content: ${results.noContent}`);
  console.log();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
