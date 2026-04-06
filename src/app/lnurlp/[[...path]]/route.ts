/**
 * Catch-all proxy for /lnurlp/* → LNBits
 * Handles LNURL-pay callbacks (step 2 of Lightning Address flow).
 *
 * The callback URL contains the LNbits link ID (e.g. /lnurlp/api/v1/lnurl/cb/<linkId>).
 * We proxy this directly to LNbits — the link ID already identifies the correct wallet,
 * so this is safe as long as step 1 (/.well-known/lnurlp) returned the right link ID.
 */
import { NextRequest, NextResponse } from "next/server";

const LNBITS_URL = process.env.LNBITS_URL || "https://ln.coinpayportal.com";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await params;
  const pathStr = path ? path.join("/") : "";
  const searchParams = request.nextUrl.searchParams.toString();
  const queryString = searchParams ? `?${searchParams}` : "";

  try {
    const res = await fetch(`${LNBITS_URL}/lnurlp/${pathStr}${queryString}`, {
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) {
      const text = await res.text();
      return new NextResponse(text, {
        status: res.status,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch {
    return NextResponse.json(
      { status: "ERROR", reason: "Lightning service unavailable" },
      { status: 502 },
    );
  }
}
