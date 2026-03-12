import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isUrlSafe, extractMetadata, isMetadataSufficient, extractMetadataWithFallback, MetadataExtractionError } from "./metadata-extract";

// ── isUrlSafe tests ────────────────────────────────────────────────

describe("isUrlSafe", () => {
  it("accepts valid HTTPS URL", () => {
    expect(isUrlSafe("https://example.com")).toEqual({ safe: true });
  });

  it("accepts valid HTTP URL", () => {
    expect(isUrlSafe("http://example.com")).toEqual({ safe: true });
  });

  it("rejects invalid URL", () => {
    const result = isUrlSafe("not-a-url");
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("Invalid URL");
  });

  it("rejects ftp protocol", () => {
    const result = isUrlSafe("ftp://example.com/file");
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("HTTP/HTTPS");
  });

  it("rejects file protocol", () => {
    const result = isUrlSafe("file:///etc/passwd");
    expect(result.safe).toBe(false);
  });

  it("rejects javascript protocol", () => {
    const result = isUrlSafe("javascript:alert(1)");
    expect(result.safe).toBe(false);
  });

  it("blocks localhost", () => {
    const result = isUrlSafe("http://localhost/admin");
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("blocked");
  });

  it("blocks 127.0.0.1", () => {
    const result = isUrlSafe("http://127.0.0.1:8080");
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("Private");
  });

  it("blocks 10.x.x.x range", () => {
    const result = isUrlSafe("http://10.0.0.1/internal");
    expect(result.safe).toBe(false);
  });

  it("blocks 192.168.x.x range", () => {
    const result = isUrlSafe("http://192.168.1.1");
    expect(result.safe).toBe(false);
  });

  it("blocks 172.16-31.x.x range", () => {
    expect(isUrlSafe("http://172.16.0.1").safe).toBe(false);
    expect(isUrlSafe("http://172.31.255.255").safe).toBe(false);
  });

  it("blocks cloud metadata endpoint", () => {
    const result = isUrlSafe("http://169.254.169.254/latest/meta-data/");
    expect(result.safe).toBe(false);
  });

  it("blocks metadata.google.internal", () => {
    const result = isUrlSafe("http://metadata.google.internal/computeMetadata/v1/");
    expect(result.safe).toBe(false);
  });
});

// ── extractMetadata tests ──────────────────────────────────────────

describe("extractMetadata", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(body: string, contentType = "text/html", status = 200) {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(body);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? "OK" : "Not Found",
      headers: new Headers({
        "content-type": contentType,
        "content-length": String(encoded.length),
      }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoded);
          controller.close();
        },
      }),
    });
  }

  it("rejects unsafe URLs before fetching", async () => {
    await expect(extractMetadata("http://localhost/secret")).rejects.toThrow(
      MetadataExtractionError
    );
  });

  it("extracts og:title and og:description from HTML", async () => {
    mockFetch(`
      <html>
      <head>
        <meta property="og:title" content="My Awesome Skill">
        <meta property="og:description" content="Does amazing things">
        <meta property="og:image" content="https://example.com/image.png">
      </head>
      <body></body>
      </html>
    `);

    const result = await extractMetadata("https://example.com/skill");
    expect(result.title).toBe("My Awesome Skill");
    expect(result.description).toBe("Does amazing things");
    expect(result.imageUrl).toBe("https://example.com/image.png");
  });

  it("falls back to <title> tag", async () => {
    mockFetch(`
      <html><head><title>Fallback Title</title></head><body></body></html>
    `);

    const result = await extractMetadata("https://example.com");
    expect(result.title).toBe("Fallback Title");
  });

  it("falls back to meta description", async () => {
    mockFetch(`
      <html><head>
        <meta name="description" content="A simple description">
      </head><body></body></html>
    `);

    const result = await extractMetadata("https://example.com");
    expect(result.description).toBe("A simple description");
  });

  it("extracts keywords as tags", async () => {
    mockFetch(`
      <html><head>
        <meta name="keywords" content="automation, coding, AI, testing">
      </head><body></body></html>
    `);

    const result = await extractMetadata("https://example.com");
    expect(result.tags).toEqual(["automation", "coding", "ai", "testing"]);
  });

  it("limits tags to 10", async () => {
    const keywords = Array.from({ length: 15 }, (_, i) => `tag${i}`).join(", ");
    mockFetch(`
      <html><head>
        <meta name="keywords" content="${keywords}">
      </head><body></body></html>
    `);

    const result = await extractMetadata("https://example.com");
    expect(result.tags).toHaveLength(10);
  });

  it("resolves relative image URLs", async () => {
    mockFetch(`
      <html><head>
        <meta property="og:image" content="/images/logo.png">
      </head><body></body></html>
    `);

    const result = await extractMetadata("https://example.com/page");
    expect(result.imageUrl).toBe("https://example.com/images/logo.png");
  });

  it("extracts from JSON response", async () => {
    mockFetch(
      JSON.stringify({
        name: "my-skill",
        description: "A skill package",
        keywords: ["automation", "ai"],
      }),
      "application/json"
    );

    const result = await extractMetadata("https://registry.npmjs.org/my-skill");
    expect(result.title).toBe("my-skill");
    expect(result.description).toBe("A skill package");
    expect(result.tags).toEqual(["automation", "ai"]);
  });

  it("throws on HTTP error", async () => {
    mockFetch("Not Found", "text/plain", 404);

    await expect(extractMetadata("https://example.com/missing")).rejects.toThrow(
      MetadataExtractionError
    );
  });

  it("handles HTML entities in metadata", async () => {
    mockFetch(`
      <html><head>
        <meta property="og:title" content="Tom &amp; Jerry&#39;s Skills">
      </head><body></body></html>
    `);

    const result = await extractMetadata("https://example.com");
    expect(result.title).toBe("Tom & Jerry's Skills");
  });

  it("truncates title to 120 characters", async () => {
    const longTitle = "A".repeat(200);
    mockFetch(`<html><head><title>${longTitle}</title></head><body></body></html>`);

    const result = await extractMetadata("https://example.com");
    expect(result.title).toHaveLength(120);
  });

  it("returns url in result", async () => {
    mockFetch("<html><head></head><body></body></html>");

    const result = await extractMetadata("https://example.com/page");
    expect(result.url).toBe("https://example.com/page");
  });
});

// ── isMetadataSufficient tests ─────────────────────────────────────

describe("isMetadataSufficient", () => {
  it("returns true when title and description are present", () => {
    expect(isMetadataSufficient({ title: "Test", description: "Desc", url: "https://example.com" })).toBe(true);
  });

  it("returns false when title is missing", () => {
    expect(isMetadataSufficient({ description: "Desc", url: "https://example.com" })).toBe(false);
  });

  it("returns false when description is missing", () => {
    expect(isMetadataSufficient({ title: "Test", url: "https://example.com" })).toBe(false);
  });

  it("returns false when both are missing", () => {
    expect(isMetadataSufficient({ url: "https://example.com" })).toBe(false);
  });
});

// ── extractMetadataWithFallback tests ──────────────────────────────

describe("extractMetadataWithFallback", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockFetchForFallback(body: string, contentType = "text/html", status = 200) {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(body);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? "OK" : "Not Found",
      headers: new Headers({
        "content-type": contentType,
        "content-length": String(encoded.length),
      }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoded);
          controller.close();
        },
      }),
    });
  }

  it("returns fetch result when metadata is sufficient", async () => {
    mockFetchForFallback(`
      <html><head>
        <meta property="og:title" content="Good Title">
        <meta property="og:description" content="Good description here">
      </head><body></body></html>
    `);

    const result = await extractMetadataWithFallback("https://example.com");
    expect(result.title).toBe("Good Title");
    expect(result.description).toBe("Good description here");
  });

  it("returns fetch result even with insufficient metadata when puppeteer unavailable", async () => {
    mockFetchForFallback(`
      <html><head>
        <title>Only Title</title>
      </head><body></body></html>
    `);

    // Puppeteer won't be available in test env, so fallback returns fetch result
    const result = await extractMetadataWithFallback("https://example.com");
    expect(result.title).toBe("Only Title");
  });

  it("rejects unsafe URLs without attempting fetch", async () => {
    await expect(extractMetadataWithFallback("http://localhost/secret")).rejects.toThrow(
      MetadataExtractionError
    );
  });
});
