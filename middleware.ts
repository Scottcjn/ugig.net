import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    (request as unknown as { ip?: string }).ip ||
    "unknown"
  );
}

export async function middleware(request: NextRequest) {
  const ip = getClientIp(request);
  const method = request.method;
  const path = request.nextUrl.pathname;

  // Log with real client IP (not proxy IP)
  if (path.startsWith("/api/")) {
    console.log(`[${method}] ${path} — ${ip}`);
  }

  return await updateSession(request);
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
