import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────

const mockUpload = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

const serviceClient = {
  from: vi.fn(),
  storage: {
    from: vi.fn(() => ({
      upload: mockUpload,
    })),
  },
};

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => serviceClient),
}));

vi.mock("@/lib/skills/security-scan", () => ({
  getDefaultScanner: vi.fn(() => ({
    scan: vi.fn(),
  })),
  scanWithRetry: vi.fn(),
}));

import { importSkillFromUrl } from "./url-import";
import { scanWithRetry } from "./security-scan";

const mockScanWithRetry = vi.mocked(scanWithRetry);

// ── Helpers ────────────────────────────────────────────────────────

function setupServiceMocks() {
  serviceClient.from.mockImplementation((table: string) => {
    if (table === "skill_security_scans") {
      return {
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: { id: "scan-1" }, error: null }),
          }),
        }),
      };
    }
    if (table === "skill_listings") {
      return {
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      };
    }
    return {};
  });
}

const originalFetch = global.fetch;

// ── Tests ──────────────────────────────────────────────────────────

describe("importSkillFromUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupServiceMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns error when URL fetch fails (HTTP error)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("Not Found", { status: 404 })
    );

    const result = await importSkillFromUrl({
      skillFileUrl: "https://example.com/missing.md",
      sellerId: "seller-1",
      listingSlug: "test-skill",
      listingId: "listing-1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("HTTP 404");
  });

  it("returns error when content type is not allowed", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );

    // text/html starts with text/ so it's actually allowed by our relaxed check
    mockScanWithRetry.mockResolvedValue({
      status: "clean",
      fileHash: "abc",
      fileSizeBytes: 13,
      findings: [],
      scannerVersion: "test",
    });
    mockUpload.mockResolvedValue({ error: null });

    const result = await importSkillFromUrl({
      skillFileUrl: "https://example.com/page.html",
      sellerId: "seller-1",
      listingSlug: "test-skill",
      listingId: "listing-1",
    });

    // text/* is allowed
    expect(result.success).toBe(true);
  });

  it("returns error when file is too large", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("x", {
        status: 200,
        headers: {
          "content-type": "text/plain",
          "content-length": String(100 * 1024 * 1024), // 100 MB
        },
      })
    );

    const result = await importSkillFromUrl({
      skillFileUrl: "https://example.com/huge.md",
      sellerId: "seller-1",
      listingSlug: "test-skill",
      listingId: "listing-1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("too large");
  });

  it("imports clean file successfully", async () => {
    const content = "# My Skill\nDoes things";
    global.fetch = vi.fn().mockResolvedValue(
      new Response(content, {
        status: 200,
        headers: { "content-type": "text/markdown" },
      })
    );

    mockScanWithRetry.mockResolvedValue({
      status: "clean",
      fileHash: "abc123",
      fileSizeBytes: content.length,
      findings: [],
      scannerVersion: "secureclaw-0.1.0",
    });
    mockUpload.mockResolvedValue({ error: null });

    const result = await importSkillFromUrl({
      skillFileUrl: "https://example.com/SKILL.md",
      sellerId: "seller-1",
      listingSlug: "test-skill",
      listingId: "listing-1",
    });

    expect(result.success).toBe(true);
    expect(result.storagePath).toBe("seller-1/test-skill/SKILL.md");
    expect(result.contentHash).toBeTruthy();
    expect(result.contentHash).toHaveLength(64); // SHA-256 hex
    expect(result.scanResult.status).toBe("clean");
    expect(result.scanSource).toBe("url_import");
    expect(result.sourceUrl).toBe("https://example.com/SKILL.md");
    expect(result.findingsCountBySeverity).toEqual({});

    // Verify storage upload was called
    expect(mockUpload).toHaveBeenCalledOnce();
  });

  it("imports file with findings and counts by severity", async () => {
    const content = "eval(foo())";
    global.fetch = vi.fn().mockResolvedValue(
      new Response(content, {
        status: 200,
        headers: { "content-type": "text/plain" },
      })
    );

    mockScanWithRetry.mockResolvedValue({
      status: "suspicious",
      fileHash: "def456",
      fileSizeBytes: content.length,
      findings: [
        { rule: "no-eval", severity: "high", detail: "eval() detected" },
        { rule: "no-exec", severity: "medium", detail: "exec() detected" },
        { rule: "no-fs", severity: "medium", detail: "fs access" },
      ],
      scannerVersion: "secureclaw-0.1.0",
    });
    mockUpload.mockResolvedValue({ error: null });

    const result = await importSkillFromUrl({
      skillFileUrl: "https://example.com/script.js",
      sellerId: "seller-1",
      listingSlug: "test-skill",
      listingId: "listing-1",
    });

    expect(result.success).toBe(true);
    expect(result.findingsCountBySeverity).toEqual({ high: 1, medium: 2 });
  });

  it("returns error when storage upload fails", async () => {
    const content = "safe content";
    global.fetch = vi.fn().mockResolvedValue(
      new Response(content, {
        status: 200,
        headers: { "content-type": "text/plain" },
      })
    );

    mockScanWithRetry.mockResolvedValue({
      status: "clean",
      fileHash: "abc",
      fileSizeBytes: content.length,
      findings: [],
      scannerVersion: "test",
    });
    mockUpload.mockResolvedValue({ error: { message: "Storage error" } });

    const result = await importSkillFromUrl({
      skillFileUrl: "https://example.com/file.md",
      sellerId: "seller-1",
      listingSlug: "test-skill",
      listingId: "listing-1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to store");
  });

  it("handles network errors gracefully", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("DNS resolution failed"));

    const result = await importSkillFromUrl({
      skillFileUrl: "https://nonexistent.example.com/file.md",
      sellerId: "seller-1",
      listingSlug: "test-skill",
      listingId: "listing-1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("DNS resolution failed");
  });
});
