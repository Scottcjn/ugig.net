/**
 * SkillScanner — Security scanning gate for skill file uploads.
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

export const SCANNER_VERSION = "skill-scanner-0.2.0";
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
export const SCAN_TIMEOUT_MS = 30_000;

/** Patterns that indicate potentially dangerous content in skill files */
const DANGEROUS_PATTERNS: { pattern: RegExp; rule: string; severity: ScanFinding["severity"]; detail: string }[] = [
  // ── Critical ──
  { pattern: /curl\s+.*\|\s*(ba)?sh/i, rule: "no-pipe-to-shell", severity: "critical", detail: "Pipe-to-shell pattern detected (curl)" },
  { pattern: /wget\s+.*\|\s*(ba)?sh/i, rule: "no-wget-pipe-to-shell", severity: "critical", detail: "Pipe-to-shell pattern detected (wget)" },
  { pattern: /\.ssh\//i, rule: "no-ssh-path", severity: "critical", detail: "SSH path reference detected" },
  { pattern: /rm\s+-rf\s+\//i, rule: "no-destructive-rm", severity: "critical", detail: "Destructive rm command detected" },

  // ── High ──
  { pattern: /eval\s*\(/i, rule: "no-eval", severity: "high", detail: "Use of eval() detected" },
  { pattern: /child_process/i, rule: "no-child-process", severity: "high", detail: "child_process module usage detected" },
  { pattern: /Function\s*\(/i, rule: "no-function-constructor", severity: "high", detail: "Function constructor detected" },
  { pattern: /import\s*\(\s*['"`]child_process/i, rule: "no-dynamic-import-child-process", severity: "high", detail: "Dynamic import of child_process detected" },
  { pattern: /require\s*\(\s*['"`]net['"`]/i, rule: "no-net-require", severity: "high", detail: "Net module access detected" },
  { pattern: /require\s*\(\s*['"`]http['"`]/i, rule: "no-http-require", severity: "high", detail: "HTTP module access detected (potential data exfiltration)" },
  { pattern: /require\s*\(\s*['"`]https['"`]/i, rule: "no-https-require", severity: "high", detail: "HTTPS module access detected (potential data exfiltration)" },
  { pattern: /require\s*\(\s*['"`]dgram['"`]/i, rule: "no-dgram-require", severity: "high", detail: "UDP socket (dgram) module access detected" },
  { pattern: /import\s+.*from\s+['"`]net['"`]/i, rule: "no-net-import", severity: "high", detail: "ES module net import detected" },
  { pattern: /import\s+.*from\s+['"`]http['"`]/i, rule: "no-http-import", severity: "high", detail: "ES module http import detected" },
  { pattern: /import\s+.*from\s+['"`]https['"`]/i, rule: "no-https-import", severity: "high", detail: "ES module https import detected" },
  { pattern: /net\.connect\s*\(|net\.createConnection\s*\(|net\.Socket\s*\(/i, rule: "no-raw-tcp-socket", severity: "high", detail: "Raw TCP socket usage detected" },
  { pattern: /__proto__\b|\bprototype\s*\[/i, rule: "no-prototype-pollution", severity: "high", detail: "Prototype pollution pattern detected" },

  // ── Medium ──
  { pattern: /\bexec\s*\(/i, rule: "no-exec", severity: "medium", detail: "Potential exec() call detected" },
  { pattern: /require\s*\(\s*['"`]fs['"`]\s*\)/i, rule: "no-fs-require", severity: "medium", detail: "Direct fs module import detected" },
  { pattern: /process\.env/i, rule: "no-env-access", severity: "medium", detail: "Environment variable access detected" },
  { pattern: /require\s*\(\s*['"`]os['"`]\s*\)/i, rule: "no-os-require", severity: "medium", detail: "OS module access detected" },
  { pattern: /import\s+.*from\s+['"`]os['"`]/i, rule: "no-os-import", severity: "medium", detail: "ES module os import detected" },
  { pattern: /require\s*\(\s*['"`]vm['"`]\s*\)/i, rule: "no-vm-require", severity: "medium", detail: "VM module access detected (sandbox escape risk)" },
  { pattern: /import\s+.*from\s+['"`]vm['"`]/i, rule: "no-vm-import", severity: "medium", detail: "ES module vm import detected (sandbox escape risk)" },
  { pattern: /\bfetch\s*\(/i, rule: "no-fetch", severity: "medium", detail: "Fetch API usage detected (data exfiltration vector)" },
  { pattern: /XMLHttpRequest/i, rule: "no-xhr", severity: "medium", detail: "XMLHttpRequest usage detected (data exfiltration vector)" },
  { pattern: /\bglobalThis\b/i, rule: "no-globalthis", severity: "medium", detail: "globalThis manipulation detected" },
  { pattern: /\bwindow\b\s*\[|\bglobal\b\s*\[/i, rule: "no-dynamic-global-access", severity: "medium", detail: "Dynamic global access detected" },
  { pattern: /\batob\s*\(|\bbtoa\s*\(/i, rule: "no-base64-codec", severity: "medium", detail: "Base64 encode/decode detected (potential obfuscation)" },
  { pattern: /Buffer\.from\s*\([^)]*,\s*['"`]base64['"`]/i, rule: "no-buffer-base64", severity: "medium", detail: "Base64 decode via Buffer detected (obfuscated payload)" },
  { pattern: /\\x[0-9a-fA-F]{2}/i, rule: "no-hex-escape", severity: "medium", detail: "Hex escape sequences detected (obfuscation indicator)" },
  { pattern: /String\.fromCharCode/i, rule: "no-fromcharcode", severity: "medium", detail: "String.fromCharCode usage detected (obfuscation)" },
  { pattern: /writeFileSync|writeFile\s*\(/i, rule: "no-file-write", severity: "medium", detail: "File write operation detected" },
  { pattern: /unlinkSync|unlink\s*\(|rmSync|rmdirSync/i, rule: "no-file-delete", severity: "medium", detail: "File/directory deletion detected" },
  { pattern: /chmodSync|chmod\s*\(|chownSync|chown\s*\(/i, rule: "no-permission-change", severity: "medium", detail: "File permission change detected" },
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
    const isLikelyText = !ext || [".ts", ".js", ".json", ".yaml", ".yml", ".md", ".txt", ".toml", ".cfg", ".ini", ".py", ".rb", ".go", ".rs"].includes(ext)
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
    if (process.env.SECURECLAW_API_KEY) {
      // SecureClawScanner runs BuiltInScanner internally + enriches with community context
      const { SecureClawScanner } = require("./secureclaw-scanner");
      _defaultScanner = new SecureClawScanner();
    } else {
      _defaultScanner = new BuiltInScanner();
    }
  }
  return _defaultScanner!;
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
