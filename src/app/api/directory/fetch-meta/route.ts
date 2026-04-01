import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/directory/fetch-meta
 *
 * Fetches title, description, logo (og:image/favicon), and keywords/tags
 * from a given URL by parsing its HTML meta tags.
 */
export async function POST(request: NextRequest) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { url } = body;
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ugig-bot/1.0; +https://ugig.net)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Site returned ${res.status}` },
        { status: 422 }
      );
    }

    const html = (await res.text()).substring(0, 200000); // limit to 200KB

    // Extract meta tags
    const title =
      extractMeta(html, 'property="og:title"') ||
      extractMeta(html, 'name="title"') ||
      extractTitle(html) ||
      "";

    const description =
      extractMeta(html, 'property="og:description"') ||
      extractMeta(html, 'name="description"') ||
      "";

    const ogImage = extractMeta(html, 'property="og:image"') || "";

    const keywords = extractMeta(html, 'name="keywords"') || "";

    // Try to find a logo: og:image > /favicon.ico
    // Try logo files first, then favicon, then og:image as last resort
    const logoCandidates = [
      `${parsedUrl.origin}/logo.svg`,
      `${parsedUrl.origin}/logo.png`,
      `${parsedUrl.origin}/favicon.svg`,
      `${parsedUrl.origin}/favicon.png`,
    ];

    let logo_url = "";
    for (const candidate of logoCandidates) {
      try {
        const logoRes = await fetch(candidate, {
          method: "HEAD",
          signal: AbortSignal.timeout(3000),
          redirect: "follow",
        });
        if (logoRes.ok) {
          logo_url = candidate;
          break;
        }
      } catch {
        // try next
      }
    }

    // Fallback: favicon from HTML meta tags
    if (!logo_url) {
      const faviconHref = extractFavicon(html);
      if (faviconHref) {
        try {
          logo_url = new URL(faviconHref, url).href;
        } catch {
          logo_url = faviconHref;
        }
      }
    }

    // Fallback: og:image
    if (!logo_url && ogImage) {
      try {
        logo_url = new URL(ogImage, url).href;
      } catch {
        logo_url = ogImage;
      }
    }

    // Last resort: favicon.ico
    if (!logo_url) {
      logo_url = `${parsedUrl.origin}/favicon.ico`;
    }

    // Parse tags from keywords or og:type
    const tags: string[] = keywords
      ? keywords
          .split(",")
          .map((t: string) => t.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 10)
      : [];

    return NextResponse.json({
      title: title.substring(0, 100),
      description: description.substring(0, 500),
      logo_url,
      tags,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

function extractMeta(html: string, attr: string): string {
  // Match both content="..." and content='...'
  const regex = new RegExp(
    `<meta[^>]*${attr.replace(/"/g, '["\']')}[^>]*content=["']([^"']*)["'][^>]*/?>`,
    "i"
  );
  const match = html.match(regex);
  if (match) return decodeEntities(match[1]);

  // Try reversed order (content before property)
  const regex2 = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*${attr.replace(/"/g, '["\']')}[^>]*/?>`,
    "i"
  );
  const match2 = html.match(regex2);
  if (match2) return decodeEntities(match2[1]);

  return "";
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? decodeEntities(match[1].trim()) : "";
}

function extractFavicon(html: string): string {
  const match = html.match(
    /<link[^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*href=["']([^"']*)["'][^>]*\/?>/i
  );
  if (match) return match[1];

  // Reversed order
  const match2 = html.match(
    /<link[^>]*href=["']([^"']*)["'][^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*\/?>/i
  );
  return match2 ? match2[1] : "";
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}
