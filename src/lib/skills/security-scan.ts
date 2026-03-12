/**
 * SecureClaw — Security scanning gate for skill file uploads.
 *
 * Abstraction layer that scans uploaded skill files before they are
 * accepted into the marketplace.  Currently implements a built-in
 * heuristic scanner; designed for easy swap to an external service.
 */

import { createHash } from "crypto";

// ── Types ──────────────────────────────────────────────────────────

export type ScanStatus = "pending" | "scanning" | "clean" | "suspicious" | "malicious" | "error" | "timeout";

export interface ScanFinding {
  rule: string;
  severity: "low" | "medium" | "high" | "critical";
  detail: string;
}

export interface ScanResult {
  status: ScanStatus;
  fileHash: string;
  fileSizeBytes: number;
  findings: ScanFinding[];
  scannerVersion: string;
}

export interface SecurityScanner {
  scan(file: Buffer, fileName: string): Promise<ScanResult>;
}

// ── Constants ──────────────────────────────────────────────────────

export const SCANNER_VERSION = "secureclaw-0.1.0";
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
export const SCAN_TIMEOUT_MS = 30_000;

/** Patterns that indicate potentially dangerous content in skill files */
const DANGEROUS_PATTERNS: { pattern: RegExp; rule: string; severity: ScanFinding["severity"]; detail: string }[] = [
  { pattern: /eval\s*\(/i, rule: "no-eval", severity: "high", detail: "Use of eval() detected" },
  { pattern: /child_process/i, rule: "no-child-process", severity: "high", detail: "child_process module usage detected" },
  { pattern: /\bexec\s*\(/i, rule: "no-exec", severity: "medium", detail: "Potential exec() call detected" },
  { pattern: /Function\s*\(/i, rule: "no-function-constructor", severity: "high", detail: "Function constructor detected" },
  { pattern: /require\s*\(\s*['"`]fs['"`]\s*\)/i, rule: "no-fs-require", severity: "medium", detail: "Direct fs module import detected" },
  { pattern: /process\.env/i, rule: "no-env-access", severity: "medium", detail: "Environment variable access detected" },
  { pattern: /\.ssh\//i, rule: "no-ssh-path", severity: "critical", detail: "SSH path reference detected" },
  { pattern: /rm\s+-rf\s+\//i, rule: "no-destructive-rm", severity: "critical", detail: "Destructive rm command detected" },
  { pattern: /curl\s+.*\|\s*(ba)?sh/i, rule: "no-pipe-to-shell", severity: "critical", detail: "Pipe-to-shell pattern detected" },
];

/** File extensions we refuse outright */
const BLOCKED_EXTENSIONS = new Set([".exe", ".dll", ".so", ".dylib", ".bat", ".cmd", ".ps1", ".sh", ".com", ".scr"]);

// ── Built-in heuristic scanner ─────────────────────────────────────

export class BuiltInScanner implements SecurityScanner {
  async scan(file: Buffer, fileName: string): Promise<ScanResult> {
    const fileHash = createHash("sha256").update(file).digest("hex");
    const fileSizeBytes = file.length;
    const findings: ScanFinding[] = [];

    // Size check
    if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
      findings.push({
        rule: "max-file-size",
        severity: "high",
        detail: `File exceeds maximum size of ${MAX_FILE_SIZE_BYTES} bytes`,
      });
    }

    // Extension check
    const ext = fileName.lastIndexOf(".") >= 0 ? fileName.slice(fileName.lastIndexOf(".")).toLowerCase() : "";
    if (BLOCKED_EXTENSIONS.has(ext)) {
      findings.push({
        rule: "blocked-extension",
        severity: "critical",
        detail: `File extension ${ext} is not allowed`,
      });
    }

    // Content analysis (only for text-like files)
    const isLikelyText = !ext || [".ts", ".js", ".json", ".yaml", ".yml", ".md", ".txt", ".toml", ".cfg", ".ini", ".py", ".rb", ".go", ".rs", ".zip", ".tar", ".gz", ".tgz"].includes(ext)
      ? true
      : false;

    if (isLikelyText && fileSizeBytes < 10 * 1024 * 1024) {
      const content = file.toString("utf-8");
      for (const { pattern, rule, severity, detail } of DANGEROUS_PATTERNS) {
        if (pattern.test(content)) {
          findings.push({ rule, severity, detail });
        }
      }
    }

    // Determine overall status
    const hasCritical = findings.some((f) => f.severity === "critical");
    const hasHigh = findings.some((f) => f.severity === "high");

    let status: ScanStatus = "clean";
    if (hasCritical) status = "malicious";
    else if (hasHigh) status = "suspicious";

    return { status, fileHash, fileSizeBytes, findings, scannerVersion: SCANNER_VERSION };
  }
}

// ── Scan with timeout wrapper ──────────────────────────────────────

export async function scanWithTimeout(
  scanner: SecurityScanner,
  file: Buffer,
  fileName: string,
  timeoutMs: number = SCAN_TIMEOUT_MS
): Promise<ScanResult> {
  return Promise.race([
    scanner.scan(file, fileName),
    new Promise<ScanResult>((_, reject) =>
      setTimeout(() => reject(new ScanTimeoutError(`Scan timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

export class ScanTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScanTimeoutError";
  }
}

// ── Retry logic ────────────────────────────────────────────────────

export async function scanWithRetry(
  scanner: SecurityScanner,
  file: Buffer,
  fileName: string,
  options: { maxRetries?: number; timeoutMs?: number } = {}
): Promise<ScanResult> {
  const { maxRetries = 2, timeoutMs = SCAN_TIMEOUT_MS } = options;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await scanWithTimeout(scanner, file, fileName, timeoutMs);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        // Exponential backoff: 500ms, 1000ms, ...
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  // All retries exhausted — return error/timeout status
  const isTimeout = lastError instanceof ScanTimeoutError;
  return {
    status: isTimeout ? "timeout" : "error",
    fileHash: createHash("sha256").update(file).digest("hex"),
    fileSizeBytes: file.length,
    findings: [{ rule: "scan-failed", severity: "high", detail: lastError?.message ?? "Unknown scan error" }],
    scannerVersion: SCANNER_VERSION,
  };
}

// ── Default scanner instance ───────────────────────────────────────

let _defaultScanner: SecurityScanner | undefined;

export function getDefaultScanner(): SecurityScanner {
  if (!_defaultScanner) {
    _defaultScanner = new BuiltInScanner();
  }
  return _defaultScanner;
}

/** Override default scanner (useful for testing or external service integration) */
export function setDefaultScanner(scanner: SecurityScanner): void {
  _defaultScanner = scanner;
}

// ── Helper: is result acceptable for publishing? ───────────────────

/** Statuses that allow a listing to be published (active). */
export const PUBLISHABLE_SCAN_STATUSES: ScanStatus[] = ["clean"];

/**
 * Whether a scan result permits publishing.
 * Only "clean" is acceptable. "suspicious", "malicious", "error", "timeout"
 * all block publishing.
 */
export function isScanAcceptable(result: ScanResult): boolean {
  return PUBLISHABLE_SCAN_STATUSES.includes(result.status);
}

/**
 * Whether a persisted scan_status string permits publishing.
 */
export function isScanStatusAcceptable(status: string | null | undefined): boolean {
  if (!status) return false;
  return PUBLISHABLE_SCAN_STATUSES.includes(status as ScanStatus);
}
