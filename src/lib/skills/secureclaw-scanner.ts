/**
 * SecureClawScanner — Enriches built-in scan findings with community context
 * from the SecureClaw community platform (https://secureclaw.dev).
 *
 * Flow:
 *  1. Runs the built-in BuiltInScanner
 *  2. For each finding, queries SecureClaw search API for community context
 *  3. Enriches findings with links to related posts / known fixes
 *  4. Gracefully degrades if the API is unavailable
 */

import { BuiltInScanner, type SecurityScanner, type ScanResult, type ScanFinding, SCANNER_VERSION } from "./security-scan";

// ── Types ──────────────────────────────────────────────────────────

export interface CommunityContext {
  url: string;
  title: string;
  summary: string;
}

export interface EnrichedScanFinding extends ScanFinding {
  community_context?: CommunityContext[];
}

export interface EnrichedScanResult extends ScanResult {
  findings: EnrichedScanFinding[];
}

export interface SecureClawSearchResult {
  results: Array<{
    url: string;
    title: string;
    summary: string;
  }>;
}

// ── Constants ──────────────────────────────────────────────────────

const SECURECLAW_BASE_URL = "https://secureclaw.dev";
const API_TIMEOUT_MS = 5_000;

// ── Scanner ────────────────────────────────────────────────────────

export class SecureClawScanner implements SecurityScanner {
  private apiKey: string;
  private baseUrl: string;

  constructor(options?: { apiKey?: string; baseUrl?: string }) {
    this.apiKey = options?.apiKey ?? process.env.SECURECLAW_API_KEY ?? "";
    this.baseUrl = options?.baseUrl ?? SECURECLAW_BASE_URL;
  }

  /**
   * Runs BuiltInScanner and enriches findings with SecureClaw community context.
   * When used in CompositeScanner, should be the ONLY scanner (not alongside
   * a separate BuiltInScanner) to avoid duplicate scans.
   */
  async scan(file: Buffer, fileName: string): Promise<EnrichedScanResult> {
    // Run built-in scan
    const builtIn = new BuiltInScanner();
    const baseResult = await builtIn.scan(file, fileName);

    // If no findings or no API key, return as-is
    if (baseResult.findings.length === 0 || !this.apiKey) {
      return { ...baseResult, findings: baseResult.findings as EnrichedScanFinding[] };
    }

    // Enrich findings with community context
    const enrichedFindings = await Promise.all(
      baseResult.findings.map((finding) => this.enrichFinding(finding))
    );

    return {
      ...baseResult,
      findings: enrichedFindings,
    };
  }

  private async enrichFinding(finding: ScanFinding): Promise<EnrichedScanFinding> {
    try {
      const context = await this.searchCommunity(finding.detail);
      if (context && context.length > 0) {
        return { ...finding, community_context: context };
      }
    } catch {
      // Graceful degradation — return finding without enrichment
    }
    return finding;
  }

  private async searchCommunity(query: string): Promise<CommunityContext[] | null> {
    const url = `${this.baseUrl}/api/search?q=${encodeURIComponent(query)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as SecureClawSearchResult;
      return data.results?.map((r) => ({
        url: r.url,
        title: r.title,
        summary: r.summary,
      })) ?? null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
