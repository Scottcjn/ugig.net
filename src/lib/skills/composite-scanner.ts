/**
 * CompositeScanner — Runs multiple SecurityScanner implementations in
 * sequence, merges findings (deduped by rule name), and takes the worst
 * status across all scanners.
 */

import { createHash } from "crypto";
import type { SecurityScanner, ScanResult, ScanFinding, ScanStatus } from "./security-scan";
import { SCANNER_VERSION } from "./security-scan";

// ── Status severity ordering (higher index = worse) ────────────────

const STATUS_SEVERITY: ScanStatus[] = [
  "clean",
  "pending",
  "scanning",
  "suspicious",
  "error",
  "timeout",
  "malicious",
];

function worstStatus(a: ScanStatus, b: ScanStatus): ScanStatus {
  const ai = STATUS_SEVERITY.indexOf(a);
  const bi = STATUS_SEVERITY.indexOf(b);
  return ai >= bi ? a : b;
}

// ── CompositeScanner ───────────────────────────────────────────────

export class CompositeScanner implements SecurityScanner {
  private scanners: SecurityScanner[];

  constructor(scanners: SecurityScanner[]) {
    if (scanners.length === 0) {
      throw new Error("CompositeScanner requires at least one scanner");
    }
    this.scanners = scanners;
  }

  async scan(file: Buffer, fileName: string): Promise<ScanResult> {
    const results: ScanResult[] = [];

    for (const scanner of this.scanners) {
      const result = await scanner.scan(file, fileName);
      results.push(result);
    }

    return this.mergeResults(file, results);
  }

  private mergeResults(file: Buffer, results: ScanResult[]): ScanResult {
    // Dedup findings by rule name — keep the first occurrence
    const seenRules = new Set<string>();
    const mergedFindings: ScanFinding[] = [];

    for (const result of results) {
      for (const finding of result.findings) {
        if (!seenRules.has(finding.rule)) {
          seenRules.add(finding.rule);
          mergedFindings.push(finding);
        }
      }
    }

    // Worst status across all results
    let status: ScanStatus = results[0].status;
    for (let i = 1; i < results.length; i++) {
      status = worstStatus(status, results[i].status);
    }

    return {
      status,
      fileHash: results[0]?.fileHash ?? createHash("sha256").update(file).digest("hex"),
      fileSizeBytes: file.length,
      findings: mergedFindings,
      scannerVersion: SCANNER_VERSION,
    };
  }
}
