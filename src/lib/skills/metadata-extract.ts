/**
 * URL-based metadata extraction for skill listing autofill.
 *
 * Fetches a URL and extracts title, description, og:image, keywords/tags.
 * Includes SSRF protections (private IP blocking, domain allowlisting option).
 */

import { URL } from "url";

// ── Types ──────────────────────────────────────────────────────────

export interface ExtractedMetadata {
  title?: string;
  description?: string;
  imageUrl?: string;
  tags?: string[];
  url: string;
}

// ── SSRF Protection ────────────────────────────────────────────────

const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^fd/i,
];

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal", "169.254.169.254"]);

export function isUrlSafe(urlString: string): { safe: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { safe: false, reason: "Invalid URL" };
  }

  // Only allow http(s)
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { safe: false, reason: "Only HTTP/HTTPS URLs are allowed" };
  }

  // Block known dangerous hostnames
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { safe: false, reason: "Hostname is blocked" };
  }

  // Block private IP addresses
  for (const re of PRIVATE_IP_RANGES) {
    if (re.test(hostname)) {
      return { safe: false, reason: "Private/internal IP addresses are not allowed" };
    }
  }

  return { safe: true };
}

// ── Metadata Extraction ────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Extract metadata from a URL.
 * Safe against SSRF — validates URL before fetching.
 */
export async function extractMetadata(urlString: string): Promise<ExtractedMetadata> {
  const safety = isUrlSafe(urlString);
  if (!safety.safe) {
    throw new MetadataExtractionError(safety.reason || "URL is not safe");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(urlString, {
      signal: controller.signal,
      headers: {
        "User-Agent": "ugig-metadata-bot/1.0",
        Accept: "text/html, application/json",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      throw new MetadataExtractionError(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "";
    const contentLength = parseInt(response.headers.get("content-length") || "0", 10);

    if (contentLength > MAX_BODY_BYTES) {
      throw new MetadataExtractionError("Response too large");
    }

    // Read body with size limit
    const buffer = await readLimitedBody(response, MAX_BODY_BYTES);
    const body = new TextDecoder().decode(buffer);

    if (contentType.includes("application/json")) {
      return extractFromJson(body, urlString);
    }

    return extractFromHtml(body, urlString);
  } catch (err) {
    if (err instanceof MetadataExtractionError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new MetadataExtractionError("Request timed out");
    }
    throw new MetadataExtractionError(err instanceof Error ? err.message : "Unknown error");
  } finally {
    clearTimeout(timeout);
  }
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new MetadataExtractionError("No response body");

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.length;
    if (totalBytes > maxBytes) {
      reader.cancel();
      throw new MetadataExtractionError("Response too large");
    }
    chunks.push(value);
  }

  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

// ── HTML parsing (regex-based, no heavy deps) ──────────────────────

function extractFromHtml(html: string, url: string): ExtractedMetadata {
  const result: ExtractedMetadata = { url };

  // og:title or <title>
  result.title =
    getMetaContent(html, "og:title") ||
    getMetaContent(html, "twitter:title") ||
    getTitleTag(html);

  // og:description or meta description
  result.description =
    getMetaContent(html, "og:description") ||
    getMetaContent(html, "twitter:description") ||
    getMetaContentByName(html, "description");

  // og:image
  result.imageUrl =
    getMetaContent(html, "og:image") ||
    getMetaContent(html, "twitter:image");

  // Resolve relative image URLs
  if (result.imageUrl && !result.imageUrl.startsWith("http")) {
    try {
      result.imageUrl = new URL(result.imageUrl, url).toString();
    } catch {
      result.imageUrl = undefined;
    }
  }

  // keywords → tags
  const keywords = getMetaContentByName(html, "keywords");
  if (keywords) {
    result.tags = keywords
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k.length > 0 && k.length <= 30)
      .slice(0, 10);
  }

  // Trim values
  if (result.title) result.title = result.title.slice(0, 120).trim();
  if (result.description) result.description = result.description.slice(0, 2000).trim();

  return result;
}

function getMetaContent(html: string, property: string): string | undefined {
  // Match both property="..." and name="..." attributes
  const re = new RegExp(
    `<meta[^>]*(?:property|name)=["']${escapeRegex(property)}["'][^>]*content=["']([^"']*)["']`,
    "i"
  );
  const match = html.match(re);
  if (match) return decodeHtmlEntities(match[1]);

  // Reversed attribute order: content before property
  const re2 = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${escapeRegex(property)}["']`,
    "i"
  );
  const match2 = html.match(re2);
  if (match2) return decodeHtmlEntities(match2[1]);

  return undefined;
}

function getMetaContentByName(html: string, name: string): string | undefined {
  return getMetaContent(html, name);
}

function getTitleTag(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? decodeHtmlEntities(match[1]).trim() : undefined;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

// ── JSON parsing (e.g., npm package.json, GitHub API) ──────────────

function extractFromJson(json: string, url: string): ExtractedMetadata {
  const result: ExtractedMetadata = { url };

  try {
    const data = JSON.parse(json);

    result.title = data.name || data.title;
    result.description = data.description;

    if (data.homepage) result.imageUrl = data.homepage;
    if (data.avatar_url) result.imageUrl = data.avatar_url;

    if (Array.isArray(data.keywords)) {
      result.tags = data.keywords.slice(0, 10).map((k: string) => String(k).toLowerCase().slice(0, 30));
    } else if (Array.isArray(data.topics)) {
      result.tags = data.topics.slice(0, 10).map((k: string) => String(k).toLowerCase().slice(0, 30));
    }

    if (result.title) result.title = String(result.title).slice(0, 120);
    if (result.description) result.description = String(result.description).slice(0, 2000);
  } catch {
    // Not valid JSON — return empty result
  }

  return result;
}

// ── Puppeteer-based fallback extraction ────────────────────────────

const PUPPETEER_TIMEOUT_MS = 15_000;

/**
 * Check whether extracted metadata has sufficient content.
 * Returns true if we got at least a title and description.
 */
export function isMetadataSufficient(meta: ExtractedMetadata): boolean {
  return !!(meta.title && meta.description);
}

/**
 * Extract metadata using Puppeteer (headless browser).
 * Used as a fallback when fetch-based extraction fails or returns
 * insufficient data (e.g. SPA pages that require JS rendering).
 */
export async function extractMetadataWithPuppeteer(urlString: string): Promise<ExtractedMetadata> {
  const safety = isUrlSafe(urlString);
  if (!safety.safe) {
    throw new MetadataExtractionError(safety.reason || "URL is not safe");
  }

  let browser;
  try {
    // Dynamic import — puppeteer is an optional dependency
    // Use variable to prevent Vite static analysis from failing on missing dep
    const puppeteerModule = "puppeteer";
    const puppeteer = await import(/* @vite-ignore */ puppeteerModule);
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();
    await page.setUserAgent("ugig-metadata-bot/1.0");
    await page.goto(urlString, { waitUntil: "networkidle2", timeout: PUPPETEER_TIMEOUT_MS });

    const html = await page.content();
    return extractFromHtml(html, urlString);
  } catch (err) {
    if (err instanceof MetadataExtractionError) throw err;
    throw new MetadataExtractionError(
      `Puppeteer extraction failed: ${err instanceof Error ? err.message : "Unknown error"}`
    );
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * Extract metadata with fetch first, then Puppeteer fallback.
 * This is the main entry point for the metadata API route.
 */
export async function extractMetadataWithFallback(urlString: string): Promise<ExtractedMetadata> {
  try {
    const meta = await extractMetadata(urlString);
    if (isMetadataSufficient(meta)) {
      return meta;
    }
    // Fetch succeeded but metadata is insufficient — try Puppeteer
    try {
      return await extractMetadataWithPuppeteer(urlString);
    } catch {
      // Puppeteer also failed — return whatever fetch got
      return meta;
    }
  } catch (fetchErr) {
    // Fetch failed entirely — try Puppeteer as fallback
    try {
      return await extractMetadataWithPuppeteer(urlString);
    } catch (puppeteerErr) {
      // Both failed — throw the original fetch error
      throw fetchErr;
    }
  }
}

// ── Errors ─────────────────────────────────────────────────────────

export class MetadataExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetadataExtractionError";
  }
}
