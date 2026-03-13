import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

const mockDownload = vi.fn();
const mockUpload = vi.fn().mockResolvedValue({ error: null });
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

const serviceClient = {
  from: vi.fn(),
  storage: {
    from: vi.fn(() => ({
      download: mockDownload,
      upload: mockUpload,
    })),
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({})),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => serviceClient),
}));

// Mock the scanner to avoid real scan logic
vi.mock("@/lib/skills/security-scan", () => ({
  getDefaultScanner: vi.fn(() => ({
    scan: vi.fn(),
  })),
  scanWithRetry: vi.fn(),
  isScanAcceptable: vi.fn((r: any) => r.status === "clean"),
}));

import { POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";
import { scanWithRetry } from "@/lib/skills/security-scan";

const mockGetAuthContext = vi.mocked(getAuthContext);
const mockScanWithRetry = vi.mocked(scanWithRetry);

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest() {
  return new NextRequest("http://localhost/api/skills/test-skill/scan", {
    method: "POST",
  });
}

const makeParams = (slug = "test-skill") => Promise.resolve({ slug });

function mockListing(listing: any) {
  serviceClient.from.mockImplementation((table: string) => {
    if (table === "skill_listings") {
      // Check if this is an update or select call based on chain
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: listing,
                error: listing ? null : { message: "not found" },
              }),
          }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      };
    }
    if (table === "skill_security_scans") {
      return {
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: { id: "scan-1" },
                error: null,
              }),
          }),
        }),
      };
    }
    return {};
  });
}

// ── Tests ──────────────────────────────────────────────────────────

describe("POST /api/skills/[slug]/scan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await POST(makeRequest(), { params: makeParams() });
    expect(res.status).toBe(401);
  });

  it("returns 404 when listing not found", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: {} as any,
    });
    mockListing(null);

    const res = await POST(makeRequest(), { params: makeParams() });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not the owner", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "other-user", authMethod: "session" },
      supabase: {} as any,
    });
    mockListing({
      id: "listing-1",
      seller_id: "seller-1",
      slug: "test-skill",
      skill_file_path: "seller-1/test-skill/skill.md",
      skill_file_url: null,
    });

    const res = await POST(makeRequest(), { params: makeParams() });
    expect(res.status).toBe(403);
  });

  it("returns 422 when no scannable content exists", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "seller-1", authMethod: "session" },
      supabase: {} as any,
    });
    mockListing({
      id: "listing-1",
      seller_id: "seller-1",
      slug: "test-skill",
      skill_file_path: null,
      skill_file_url: null,
    });

    const res = await POST(makeRequest(), { params: makeParams() });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toContain("No scannable content");
  });

  it("scans stored file and returns clean result", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "seller-1", authMethod: "session" },
      supabase: {} as any,
    });
    mockListing({
      id: "listing-1",
      seller_id: "seller-1",
      slug: "test-skill",
      skill_file_path: "seller-1/test-skill/skill.md",
      skill_file_url: null,
    });

    // Mock storage download — return object with arrayBuffer()
    const fileContent = Buffer.from("# My Skill\nDoes cool stuff");
    mockDownload.mockResolvedValue({
      data: { arrayBuffer: () => Promise.resolve(fileContent.buffer.slice(fileContent.byteOffset, fileContent.byteOffset + fileContent.byteLength)) },
      error: null,
    });

    mockScanWithRetry.mockResolvedValue({
      status: "clean",
      fileHash: "abc123",
      fileSizeBytes: fileContent.length,
      findings: [],
      scannerVersion: "skill-scanner-0.1.0",
    });

    const res = await POST(makeRequest(), { params: makeParams() });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.scan.status).toBe("clean");
    expect(json.scan.risk_level).toBe("none");
    expect(json.scan.issues_count).toBe(0);
    expect(json.scan.issues).toEqual([]);
    expect(json.scan.file_hash).toBe("abc123");
    expect(json.scan.scanner_version).toBe("skill-scanner-0.1.0");
    expect(json.scan.scan_id).toBe("scan-1");

    // Verify scanner was called
    expect(mockScanWithRetry).toHaveBeenCalledOnce();
  });

  it("scans stored file and returns suspicious result with findings", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "seller-1", authMethod: "session" },
      supabase: {} as any,
    });
    mockListing({
      id: "listing-1",
      seller_id: "seller-1",
      slug: "test-skill",
      skill_file_path: "seller-1/test-skill/skill.md",
      skill_file_url: null,
    });

    const fileContent = Buffer.from("eval(dangerous())");
    mockDownload.mockResolvedValue({
      data: { arrayBuffer: () => Promise.resolve(fileContent.buffer.slice(fileContent.byteOffset, fileContent.byteOffset + fileContent.byteLength)) },
      error: null,
    });

    mockScanWithRetry.mockResolvedValue({
      status: "suspicious",
      fileHash: "def456",
      fileSizeBytes: fileContent.length,
      findings: [
        { rule: "no-eval", severity: "high", detail: "Use of eval() detected" },
        { rule: "no-exec", severity: "medium", detail: "Potential exec() call detected" },
      ],
      scannerVersion: "skill-scanner-0.1.0",
    });

    const res = await POST(makeRequest(), { params: makeParams() });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.scan.status).toBe("suspicious");
    expect(json.scan.risk_level).toBe("high");
    expect(json.scan.issues_count).toBe(2);
    // Should NOT expose internal rule names
    expect(json.scan.issues[0]).toEqual({
      severity: "high",
      detail: "Use of eval() detected",
    });
    expect(json.scan.issues[0].rule).toBeUndefined();
  });

  it("falls back to skill_file_url when no stored file", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "seller-1", authMethod: "session" },
      supabase: {} as any,
    });
    mockListing({
      id: "listing-1",
      seller_id: "seller-1",
      slug: "test-skill",
      skill_file_path: null,
      skill_file_url: "https://example.com/SKILL.md",
    });

    // Mock global fetch for the URL fetch (not storage)
    const fileContent = "# Remote Skill";
    const mockFetchResponse = new Response(fileContent, {
      status: 200,
      headers: { "content-length": String(fileContent.length) },
    });
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(mockFetchResponse);

    mockScanWithRetry.mockResolvedValue({
      status: "clean",
      fileHash: "remote123",
      fileSizeBytes: fileContent.length,
      findings: [],
      scannerVersion: "skill-scanner-0.1.0",
    });

    const res = await POST(makeRequest(), { params: makeParams() });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.scan.status).toBe("clean");
    expect(json.scan.risk_level).toBe("none");
    expect(json.scan.content_hash).toBeTruthy();
    expect(json.scan.scan_source).toBe("url_import");
    expect(json.scan.source_url).toBe("https://example.com/SKILL.md");

    global.fetch = originalFetch;
  });
});
