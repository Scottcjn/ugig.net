import { NextRequest, NextResponse } from "next/server";

/**
 * GET /ref/[code] - Short affiliate tracking link
 * Redirects to /api/affiliates/click?ref=CODE
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";
  return NextResponse.redirect(`${baseUrl}/api/affiliates/click?ref=${encodeURIComponent(code)}`);
}
