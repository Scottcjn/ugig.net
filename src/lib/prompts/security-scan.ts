/**
 * PromptSecurityScanner — Regex-based content scanning for prompt listings.
 *
 * Checks prompt text for:
 *   1. Prompt injection patterns (e.g. "ignore previous instructions")
 *   2. Malicious content (suspicious URLs, encoded payloads, base64 blobs)
 *   3. PII/credential patterns (API keys, passwords, SSNs, email harvesting)
 *
 * Simple heuristic scanner — no external CLI tools required.
 */

// ── Types ──────────────────────────────────────────────────────────

export type PromptScanStatus = "clean" | "warning" | "critical" | "error";

export type PromptRating = "F" | "D" | "C" | "B" | "A" | "A+";

export interface PromptScanFinding {
  rule: string;
  severity: "low" | "medium" | "high" | "critical";
  detail: string;
  match?: string;
}

export interface PromptScanResult {
  status: PromptScanStatus;
  rating: PromptRating | null;
  securityScore: number | null;
  findings: PromptScanFinding[];
  scannerVersion: string;
}

// ── Constants ──────────────────────────────────────────────────────

export const PROMPT_SCANNER_VERSION = "prompt-scanner-0.1.0";

// ── Prompt Injection Patterns ──────────────────────────────────────

const INJECTION_PATTERNS: { pattern: RegExp; rule: string; severity: PromptScanFinding["severity"]; detail: string }[] = [
  // ── Critical: Direct instruction override attempts ──
  {
    pattern: /ignore\s+(all\s+)?(previous|prior|above|earlier|preceding)\s+(instructions?|prompts?|rules?|context)/i,
    rule: "injection-ignore-instructions",
    severity: "critical",
    detail: "Prompt injection: attempts to override previous instructions",
  },
  {
    pattern: /disregard\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/i,
    rule: "injection-disregard",
    severity: "critical",
    detail: "Prompt injection: attempts to disregard previous instructions",
  },
  {
    pattern: /forget\s+(everything|all|your)\s+(you\s+)?(know|were\s+told|instructions?)/i,
    rule: "injection-forget",
    severity: "critical",
    detail: "Prompt injection: attempts to make model forget instructions",
  },
  {
    pattern: /you\s+are\s+now\s+(a|an|the|my)\b/i,
    rule: "injection-role-override",
    severity: "critical",
    detail: "Prompt injection: attempts to override model identity/role",
  },
  {
    pattern: /^system\s*:/im,
    rule: "injection-system-prefix",
    severity: "critical",
    detail: "Prompt injection: contains system: prefix to impersonate system messages",
  },
  {
    pattern: /\[system\]|\[INST\]|<<SYS>>|<\|im_start\|>system/i,
    rule: "injection-system-tokens",
    severity: "critical",
    detail: "Prompt injection: contains model-specific system tokens",
  },
  {
    pattern: /\bdo\s+not\s+follow\s+(any|the|your)\s+(previous|original|initial)\b/i,
    rule: "injection-do-not-follow",
    severity: "critical",
    detail: "Prompt injection: instructs model to not follow original instructions",
  },

  // ── High: Suspicious override patterns ──
  {
    pattern: /override\s+(your|the|all|any)\s+(instructions?|rules?|guidelines?|constraints?|restrictions?)/i,
    rule: "injection-override-rules",
    severity: "high",
    detail: "Prompt injection: attempts to override model rules or constraints",
  },
  {
    pattern: /bypass\s+(your|the|all|any)\s+(safety|security|content|moderation|filter)/i,
    rule: "injection-bypass-safety",
    severity: "high",
    detail: "Prompt injection: attempts to bypass safety filters",
  },
  {
    pattern: /jailbreak|DAN\s*mode|developer\s*mode|unrestricted\s*mode/i,
    rule: "injection-jailbreak",
    severity: "high",
    detail: "Prompt injection: contains jailbreak or unrestricted mode keywords",
  },
  {
    pattern: /pretend\s+(you\s+)?(are|to\s+be|you're)\s+(not|no\s+longer)\s+(an?\s+)?(AI|assistant|chatbot|language\s+model)/i,
    rule: "injection-pretend-not-ai",
    severity: "high",
    detail: "Prompt injection: instructs model to pretend it's not an AI",
  },
  {
    pattern: /act\s+as\s+if\s+(you\s+)?(have\s+)?(no|without)\s+(restrictions?|limits?|boundaries|constraints?)/i,
    rule: "injection-no-restrictions",
    severity: "high",
    detail: "Prompt injection: instructs model to act without restrictions",
  },
  {
    pattern: /output\s+(your|the)\s+(system|initial|original|hidden)\s+(prompt|instructions?|message)/i,
    rule: "injection-leak-system",
    severity: "high",
    detail: "Prompt injection: attempts to extract system prompt",
  },

  // ── Medium: Indirect manipulation ──
  {
    pattern: /new\s+instructions?\s*:/i,
    rule: "injection-new-instructions",
    severity: "medium",
    detail: "Suspicious pattern: declares new instructions inline",
  },
  {
    pattern: /from\s+now\s+on\s*,?\s*(you|always|never|do\s+not)/i,
    rule: "injection-from-now-on",
    severity: "medium",
    detail: "Suspicious pattern: attempts to change model behavior going forward",
  },
  {
    pattern: /respond\s+(only\s+)?(in|with)\s+(yes|no|true|false|json)\b.*\bno\s+(matter|regardless)/i,
    rule: "injection-forced-output",
    severity: "medium",
    detail: "Suspicious pattern: forces specific output format regardless of context",
  },
];

// ── Malicious Content Patterns ─────────────────────────────────────

const MALICIOUS_PATTERNS: { pattern: RegExp; rule: string; severity: PromptScanFinding["severity"]; detail: string }[] = [
  // ── High: Encoded/obfuscated payloads ──
  {
    pattern: /[A-Za-z0-9+/]{80,}={0,2}/,
    rule: "malicious-base64-blob",
    severity: "high",
    detail: "Large base64-encoded blob detected (potential obfuscated payload)",
  },
  {
    pattern: /\\x[0-9a-fA-F]{2}(\\x[0-9a-fA-F]{2}){4,}/,
    rule: "malicious-hex-sequence",
    severity: "high",
    detail: "Hex escape sequence detected (potential encoded payload)",
  },
  {
    pattern: /\\u[0-9a-fA-F]{4}(\\u[0-9a-fA-F]{4}){4,}/,
    rule: "malicious-unicode-escape",
    severity: "high",
    detail: "Unicode escape sequence chain detected (obfuscation)",
  },
  {
    pattern: /eval\s*\(|Function\s*\(|new\s+Function\s*\(/i,
    rule: "malicious-code-execution",
    severity: "high",
    detail: "Code execution pattern detected (eval/Function constructor)",
  },

  // ── Medium: Suspicious URLs and domains ──
  {
    pattern: /https?:\/\/(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?/,
    rule: "malicious-ip-url",
    severity: "medium",
    detail: "URL with raw IP address detected (potential C2 or phishing)",
  },
  {
    pattern: /https?:\/\/[^\s]*(?:\.tk|\.ml|\.ga|\.cf|\.gq|\.buzz|\.top|\.xyz|\.pw|\.cc)\b/i,
    rule: "malicious-suspicious-tld",
    severity: "medium",
    detail: "URL with suspicious TLD detected (commonly used for phishing)",
  },
  {
    pattern: /https?:\/\/bit\.ly|https?:\/\/tinyurl\.com|https?:\/\/t\.co|https?:\/\/is\.gd|https?:\/\/rb\.gy/i,
    rule: "malicious-url-shortener",
    severity: "medium",
    detail: "URL shortener detected (obscures true destination)",
  },
  {
    pattern: /data:(?:text|application)\/[^;]+;base64,/i,
    rule: "malicious-data-uri",
    severity: "medium",
    detail: "Data URI with base64 encoding detected (potential embedded payload)",
  },

  // ── Low: Other suspicious content ──
  {
    pattern: /javascript\s*:/i,
    rule: "malicious-javascript-uri",
    severity: "low",
    detail: "JavaScript URI scheme detected",
  },
  {
    pattern: /<script\b[^>]*>|<\/script>/i,
    rule: "malicious-script-tag",
    severity: "low",
    detail: "HTML script tag detected in prompt text",
  },
];

// ── PII / Credential Patterns ──────────────────────────────────────

const PII_PATTERNS: { pattern: RegExp; rule: string; severity: PromptScanFinding["severity"]; detail: string }[] = [
  // ── High: API keys and secrets ──
  {
    pattern: /(?:sk|pk)[-_](?:live|test)[-_][A-Za-z0-9]{20,}/,
    rule: "pii-stripe-key",
    severity: "high",
    detail: "Potential Stripe API key detected",
  },
  {
    pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}/,
    rule: "pii-aws-key",
    severity: "high",
    detail: "Potential AWS access key detected",
  },
  {
    pattern: /ghp_[A-Za-z0-9]{36}/,
    rule: "pii-github-token",
    severity: "high",
    detail: "Potential GitHub personal access token detected",
  },
  {
    pattern: /sk-[A-Za-z0-9]{32,}/,
    rule: "pii-openai-key",
    severity: "high",
    detail: "Potential OpenAI API key detected",
  },
  {
    pattern: /xox[bpras]-[A-Za-z0-9-]+/,
    rule: "pii-slack-token",
    severity: "high",
    detail: "Potential Slack token detected",
  },
  {
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*["']?[^\s"']{8,}/i,
    rule: "pii-password-literal",
    severity: "high",
    detail: "Hardcoded password detected",
  },
  {
    pattern: /(?:api[_-]?key|apikey|secret[_-]?key|access[_-]?token)\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/i,
    rule: "pii-api-key-generic",
    severity: "high",
    detail: "Potential API key or secret token detected",
  },

  // ── Medium: PII ──
  {
    pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/,
    rule: "pii-ssn",
    severity: "medium",
    detail: "Potential Social Security Number pattern detected",
  },
  {
    pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,
    rule: "pii-credit-card",
    severity: "medium",
    detail: "Potential credit card number pattern detected",
  },
  {
    pattern: /(?:collect|harvest|scrape|extract)\s+(?:all\s+)?(?:email|e-mail)\s*(?:address(?:es)?)?/i,
    rule: "pii-email-harvesting",
    severity: "medium",
    detail: "Email harvesting instruction detected",
  },
  {
    pattern: /(?:collect|harvest|scrape|extract|gather)\s+(?:all\s+)?(?:personal|user|private)\s+(?:data|info|information|details)/i,
    rule: "pii-data-collection",
    severity: "medium",
    detail: "Personal data collection instruction detected",
  },
];

// ── Scanner Logic ──────────────────────────────────────────────────

function runPatterns(
  text: string,
  patterns: typeof INJECTION_PATTERNS,
): PromptScanFinding[] {
  const findings: PromptScanFinding[] = [];
  const seenRules = new Set<string>();

  for (const { pattern, rule, severity, detail } of patterns) {
    if (seenRules.has(rule)) continue;
    const match = text.match(pattern);
    if (match) {
      seenRules.add(rule);
      findings.push({
        rule,
        severity,
        detail,
        match: match[0].slice(0, 100),
      });
    }
  }

  return findings;
}

function deriveRating(score: number): PromptRating {
  if (score >= 95) return "A+";
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

function deriveStatus(findings: PromptScanFinding[]): PromptScanStatus {
  if (findings.some((f) => f.severity === "critical")) return "critical";
  if (findings.some((f) => f.severity === "high")) return "warning";
  if (findings.length > 0) return "warning";
  return "clean";
}

/**
 * Scan prompt text for security issues.
 *
 * Checks prompt_text, example_output, use_case, and description
 * for injection patterns, malicious content, and PII/credential leaks.
 */
export function scanPrompt(params: {
  promptText: string;
  exampleOutput?: string | null;
  useCase?: string | null;
  description?: string | null;
}): PromptScanResult {
  const { promptText, exampleOutput, useCase, description } = params;

  // Combine all scannable text
  const textParts = [promptText];
  if (exampleOutput) textParts.push(exampleOutput);
  if (useCase) textParts.push(useCase);
  if (description) textParts.push(description);
  const fullText = textParts.join("\n\n");

  // Run all pattern groups
  const allFindings: PromptScanFinding[] = [
    ...runPatterns(fullText, INJECTION_PATTERNS),
    ...runPatterns(fullText, MALICIOUS_PATTERNS),
    ...runPatterns(fullText, PII_PATTERNS),
  ];

  // Derive score: start at 100, deduct per finding
  const score = Math.max(
    0,
    100 -
      allFindings.reduce((acc, f) => {
        if (f.severity === "critical") return acc + 30;
        if (f.severity === "high") return acc + 20;
        if (f.severity === "medium") return acc + 10;
        return acc + 5;
      }, 0),
  );

  const status = deriveStatus(allFindings);
  const rating = deriveRating(score);

  return {
    status,
    rating,
    securityScore: score,
    findings: allFindings,
    scannerVersion: PROMPT_SCANNER_VERSION,
  };
}
