import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

const mockSingleScan = vi.fn();
const mockSingleListing = vi.fn();

const supabaseClient = {
  from: vi.fn(),
  auth: { getUser: vi.fn() },
};

const serviceClient = {
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseClient)),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => serviceClient),
}));

vi.mock("@/lib/skills/url-import", () => ({
  importSkillFromUrl: vi.fn(),
}));

vi.mock("@/lib/skills/security-scan", () => ({
  isScanAcceptable: vi.fn((r: any) => r.status === "clean"),
  isScanStatusAcceptable: vi.fn((s: string | null) => s === "clean"),
}));

import { GET, PATCH } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";
import { importSkillFromUrl } from "@/lib/skills/url-import";

const mockGetAuthContext = vi.mocked(getAuthContext);
const mockImportSkillFromUrl = vi.mocked(importSkillFromUrl);

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest(slug = "test-skill") {
  return new NextRequest(`http://localhost/api/skills/${slug}`, {
    method: "GET",
  });
}

const makeParams = (slug = "test-skill") => Promise.resolve({ slug });

const baseListing = {
  id: "listing-1",
  slug: "test-skill",
  title: "Test Skill",
  tagline: "A test",
  description: "Desc",
  seller_id: "seller-1",
  skill_file_path: "seller-1/test-skill/skill.zip",
  skill_file_url: "https://example.com/skill.md",
  website_url: "https://example.com",
  status: "active",
  price_sats: 100,
  downloads_count: 5,
  upvotes: 2,
  downvotes: 0,
  score: 2,
  rating_avg: 4.5,
  rating_count: 2,
  tags: ["ai", "agent"],
  category: "automation",
  created_at: "2026-01-01T00:00:00Z",
  seller: {
    id: "seller-1",
    username: "alice",
    full_name: "Alice",
    avatar_url: null,
    bio: "Sells skills",
    account_type: "individual",
    verified: true,
  },
};

function setupMocks(opts: {
  listing?: any;
  user?: any;
  purchased?: boolean;
  userVote?: number | null;
  scanRow?: any;
  zaps?: any[];
}) {
  const {
    listing = baseListing,
    user = null,
    purchased = false,
    userVote = null,
    scanRow = null,
    zaps = [],
  } = opts;

  // supabaseClient.from routing
  supabaseClient.from.mockImplementation((table: string) => {
    if (table === "skill_listings") {
      return {
        select: () => ({
          eq: () => ({ single: () => Promise.resolve({ data: listing, error: listing ? null : { message: "not found" } }) }),
        }),
      };
    }
    if (table === "skill_purchases") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: purchased ? { id: "p-1" } : null, error: null }),
            }),
          }),
        }),
      };
    }
    if (table === "skill_votes") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: userVote !== null ? { vote_type: userVote } : null, error: null }),
            }),
          }),
        }),
      };
    }
    if (table === "skill_reviews") {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        }),
      };
    }
    return {};
  });

  supabaseClient.auth.getUser.mockResolvedValue({
    data: { user },
  });

  // serviceClient.from routing
  serviceClient.from.mockImplementation((table: string) => {
    if (table === "zaps") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: zaps, error: null }),
          }),
        }),
      };
    }
    if (table === "skill_security_scans") {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                single: () =>
                  Promise.resolve({
                    data: scanRow,
                    error: scanRow ? null : { message: "none" },
                  }),
              }),
            }),
          }),
        }),
      };
    }
    return {};
  });
}

// ── Tests ──────────────────────────────────────────────────────────

describe("GET /api/skills/[slug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when listing not found", async () => {
    setupMocks({ listing: null });
    const res = await GET(makeRequest(), { params: makeParams() });
    expect(res.status).toBe(404);
  });

  it("returns listing with security_scan null when no scan exists", async () => {
    setupMocks({});
    const res = await GET(makeRequest(), { params: makeParams() });
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.listing.title).toBe("Test Skill");
    expect(json.listing.skill_file_url).toBe("https://example.com/skill.md");
    expect(json.listing.website_url).toBe("https://example.com");
    expect(json.security_scan).toBeNull();
    expect(json.purchased).toBe(false);
    expect(json.user_vote).toBeNull();
  });

  it("returns security_scan with sanitized findings and enriched metadata when scan exists", async () => {
    setupMocks({
      scanRow: {
        scan_status: "clean",
        scanned_at: "2026-03-10T00:00:00Z",
        scan_source: "url_import",
        source_url: "https://example.com/SKILL.md",
        content_hash: "abc123def456",
        scanner_version: "secureclaw-0.1.0",
        findings_count_by_severity: { low: 1 },
        findings_summary: {
          risk_level: "low",
          scanner_version: "secureclaw-0.1.0",
          issues: [
            { severity: "low", detail: "Minor thing", rule: "internal-rule-1" },
          ],
        },
      },
    });

    const res = await GET(makeRequest(), { params: makeParams() });
    const json = await res.json();

    expect(json.security_scan).toBeTruthy();
    expect(json.security_scan.status).toBe("clean");
    expect(json.security_scan.risk_level).toBe("low");
    expect(json.security_scan.issues_count).toBe(1);
    // Should NOT expose internal 'rule' field
    expect(json.security_scan.issues[0]).toEqual({
      severity: "low",
      detail: "Minor thing",
    });
    expect(json.security_scan.issues[0].rule).toBeUndefined();
    expect(json.security_scan.scanned_at).toBe("2026-03-10T00:00:00Z");
    // Enriched metadata
    expect(json.security_scan.scan_source).toBe("url_import");
    expect(json.security_scan.source_url).toBe("https://example.com/SKILL.md");
    expect(json.security_scan.content_hash).toBe("abc123def456");
    expect(json.security_scan.scanner_version).toBe("secureclaw-0.1.0");
    expect(json.security_scan.findings_count_by_severity).toEqual({ low: 1 });
  });

  it("returns purchased=true and user_vote for authenticated buyer", async () => {
    setupMocks({
      user: { id: "buyer-1" },
      purchased: true,
      userVote: 1,
    });

    const res = await GET(makeRequest(), { params: makeParams() });
    const json = await res.json();

    expect(json.purchased).toBe(true);
    expect(json.user_vote).toBe(1);
  });

  it("includes zaps_total from aggregated zaps", async () => {
    setupMocks({
      zaps: [{ amount_sats: 100 }, { amount_sats: 250 }],
    });

    const res = await GET(makeRequest(), { params: makeParams() });
    const json = await res.json();
    expect(json.listing.zaps_total).toBe(350);
  });

  it("handles malicious scan status with critical findings", async () => {
    setupMocks({
      scanRow: {
        scan_status: "malicious",
        scanned_at: "2026-03-10T00:00:00Z",
        findings_summary: {
          risk_level: "critical",
          issues: [
            { severity: "critical", detail: "Destructive rm command detected" },
            { severity: "critical", detail: "SSH path reference detected" },
          ],
        },
      },
    });

    const res = await GET(makeRequest(), { params: makeParams() });
    const json = await res.json();

    expect(json.security_scan.status).toBe("malicious");
    expect(json.security_scan.risk_level).toBe("critical");
    expect(json.security_scan.issues_count).toBe(2);
  });
});

// ── PATCH tests ────────────────────────────────────────────────────

function makePatchRequest(slug: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/skills/${slug}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setupPatchMocks(opts: {
  existing?: any;
  updatedListing?: any;
}) {
  const {
    existing = {
      id: "listing-1",
      seller_id: "seller-1",
      skill_file_url: "https://example.com/SKILL.md",
      scan_status: null,
    },
    updatedListing = {
      id: "listing-1",
      slug: "test-skill",
      title: "Updated",
      status: "draft",
      skill_file_url: "https://example.com/SKILL.md",
    },
  } = opts;

  serviceClient.from.mockImplementation((table: string) => {
    if (table === "skill_listings") {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: existing,
                error: existing ? null : { message: "not found" },
              }),
          }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: updatedListing, error: null }),
            }),
          }),
        }),
      };
    }
    return {};
  });
}

describe("PATCH /api/skills/[slug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await PATCH(
      makePatchRequest("test-skill", { title: "New Title" }),
      { params: makeParams() }
    );
    expect(res.status).toBe(401);
  });

  it("blocks publish when skill_file_url is set but scan not passed", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "seller-1", authMethod: "session" },
      supabase: {} as any,
    });

    setupPatchMocks({
      existing: {
        id: "listing-1",
        seller_id: "seller-1",
        skill_file_url: "https://example.com/SKILL.md",
        scan_status: null, // No scan done yet
      },
      updatedListing: {
        id: "listing-1",
        slug: "test-skill",
        status: "draft",
        skill_file_url: "https://example.com/SKILL.md",
      },
    });

    const res = await PATCH(
      makePatchRequest("test-skill", { status: "active" }),
      { params: makeParams() }
    );

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toContain("Security scan must pass");
    expect(json.listing.status).toBe("draft");
  });

  it("blocks publish when scan status is suspicious", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "seller-1", authMethod: "session" },
      supabase: {} as any,
    });

    setupPatchMocks({
      existing: {
        id: "listing-1",
        seller_id: "seller-1",
        skill_file_url: "https://example.com/SKILL.md",
        scan_status: "suspicious",
      },
      updatedListing: {
        id: "listing-1",
        slug: "test-skill",
        status: "draft",
        skill_file_url: "https://example.com/SKILL.md",
      },
    });

    const res = await PATCH(
      makePatchRequest("test-skill", { status: "active" }),
      { params: makeParams() }
    );

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toContain("suspicious");
  });

  it("allows publish when scan status is clean", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "seller-1", authMethod: "session" },
      supabase: {} as any,
    });

    setupPatchMocks({
      existing: {
        id: "listing-1",
        seller_id: "seller-1",
        skill_file_url: "https://example.com/SKILL.md",
        scan_status: "clean",
      },
      updatedListing: {
        id: "listing-1",
        slug: "test-skill",
        status: "active",
        skill_file_url: "https://example.com/SKILL.md",
      },
    });

    const res = await PATCH(
      makePatchRequest("test-skill", { status: "active" }),
      { params: makeParams() }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.listing.status).toBe("active");
  });

  it("auto-triggers scan when skill_file_url changes and blocks publish if suspicious", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "seller-1", authMethod: "session" },
      supabase: {} as any,
    });

    setupPatchMocks({
      existing: {
        id: "listing-1",
        seller_id: "seller-1",
        skill_file_url: "https://example.com/OLD.md",
        scan_status: "clean",
      },
      updatedListing: {
        id: "listing-1",
        slug: "test-skill",
        status: "draft",
        skill_file_url: "https://example.com/NEW.md",
      },
    });

    mockImportSkillFromUrl.mockResolvedValue({
      success: true,
      storagePath: "seller-1/test-skill/NEW.md",
      contentHash: "newhash",
      fileSizeBytes: 200,
      fileName: "NEW.md",
      scanResult: { status: "suspicious", fileHash: "h", fileSizeBytes: 200, findings: [{ rule: "no-eval", severity: "high", detail: "eval detected" }], scannerVersion: "v1" },
      scanSource: "url_import",
      sourceUrl: "https://example.com/NEW.md",
      findingsCountBySeverity: { high: 1 },
    });

    const res = await PATCH(
      makePatchRequest("test-skill", {
        skill_file_url: "https://example.com/NEW.md",
        status: "active",
      }),
      { params: makeParams() }
    );

    expect(res.status).toBe(422);
    expect(mockImportSkillFromUrl).toHaveBeenCalledOnce();
    const json = await res.json();
    expect(json.error).toContain("Security scan must pass");
    expect(json.import.scan_status).toBe("suspicious");
  });

  it("allows publish when new skill_file_url scan is clean", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "seller-1", authMethod: "session" },
      supabase: {} as any,
    });

    setupPatchMocks({
      existing: {
        id: "listing-1",
        seller_id: "seller-1",
        skill_file_url: "https://example.com/OLD.md",
        scan_status: "clean",
      },
      updatedListing: {
        id: "listing-1",
        slug: "test-skill",
        status: "active",
        skill_file_url: "https://example.com/NEW.md",
      },
    });

    mockImportSkillFromUrl.mockResolvedValue({
      success: true,
      storagePath: "seller-1/test-skill/NEW.md",
      contentHash: "newhash",
      fileSizeBytes: 200,
      fileName: "NEW.md",
      scanResult: { status: "clean", fileHash: "h", fileSizeBytes: 200, findings: [], scannerVersion: "v1" },
      scanSource: "url_import",
      sourceUrl: "https://example.com/NEW.md",
      findingsCountBySeverity: {},
    });

    const res = await PATCH(
      makePatchRequest("test-skill", {
        skill_file_url: "https://example.com/NEW.md",
        status: "active",
      }),
      { params: makeParams() }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.listing.status).toBe("active");
  });

  it("allows publish without scan when no skill_file_url", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "seller-1", authMethod: "session" },
      supabase: {} as any,
    });

    setupPatchMocks({
      existing: {
        id: "listing-1",
        seller_id: "seller-1",
        skill_file_url: null,
        scan_status: null,
      },
      updatedListing: {
        id: "listing-1",
        slug: "test-skill",
        status: "active",
      },
    });

    const res = await PATCH(
      makePatchRequest("test-skill", { status: "active" }),
      { params: makeParams() }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.listing.status).toBe("active");
  });
});
