import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const REDIRECTS: Record<string, string> = {
  // Pages now exist at /api-docs, /cli-docs, /openapi, /employers
};

// ── Polling throttle ─────────────────────────────────────────────
// Endpoints that get polled heavily by clients with the page open.
// Throttle: only let one request through per IP+path every 30s.
// Others get a lightweight cached response (no DB hit).
const THROTTLED_PATHS = [
  "/api/wallet/balance",
  "/api/wallet/transactions",
  "/api/notifications",
  "/api/funding/total",
];
const THROTTLE_WINDOW_MS = 30_000;
const throttleMap = new Map<string, { ts: number; body: string }>();

// Cleanup stale entries every 60s
let lastThrottleCleanup = Date.now();
function cleanupThrottle() {
  const now = Date.now();
  if (now - lastThrottleCleanup < 60_000) return;
  lastThrottleCleanup = now;
  for (const [key, entry] of throttleMap) {
    if (now - entry.ts > THROTTLE_WINDOW_MS * 2) throttleMap.delete(key);
  }
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    (request as unknown as { ip?: string }).ip ||
    "unknown"
  );
}

export async function proxy(request: NextRequest) {
  const ip = getClientIp(request);
  const method = request.method;
  const path = request.nextUrl.pathname;

  // Block TRACE method — return 405 Method Not Allowed (#66)
  if (method === "TRACE") {
    return new NextResponse(null, {
      status: 405,
      headers: { Allow: "GET, HEAD, POST, PUT, DELETE, PATCH, OPTIONS" },
    });
  }

  // Redirect legacy/broken paths
  const redirect = REDIRECTS[path];
  if (redirect) {
    return NextResponse.redirect(new URL(redirect, request.url), 301);
  }

  // Throttle heavy polling endpoints — 1 request per IP+path per 30s
  if (method === "GET" && THROTTLED_PATHS.includes(path)) {
    cleanupThrottle();
    const key = `${ip}:${path}`;
    const cached = throttleMap.get(key);
    const now = Date.now();
    if (cached && now - cached.ts < THROTTLE_WINDOW_MS) {
      // Return cached response without hitting the app
      return new NextResponse(cached.body, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Throttled": "true",
          "Cache-Control": "private, max-age=30",
        },
      });
    }
  }

  // Log with real client IP (not proxy IP)
  if (path.startsWith("/api/")) {
    console.log(`[${method}] ${path} — ${ip}`);
  }

  // After the response, cache it for throttled endpoints
  const response = await updateSession(request);

  if (method === "GET" && THROTTLED_PATHS.includes(path) && response.status === 200) {
    try {
      const cloned = response.clone();
      const body = await cloned.text();
      throttleMap.set(`${ip}:${path}`, { ts: Date.now(), body });
    } catch {
      // Don't break if we can't cache
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
