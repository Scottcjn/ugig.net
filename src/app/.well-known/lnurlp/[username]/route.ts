/**
 * GET /.well-known/lnurlp/[username]
 * Proxies LNURL pay requests to LNBits for Lightning Address support.
 * Enables username@ugig.net Lightning Addresses.
 */
import { NextRequest, NextResponse } from "next/server";

const LNBITS_URL = process.env.LNBITS_URL || "https://ln.coinpayportal.com";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  try {
    const res = await fetch(`${LNBITS_URL}/.well-known/lnurlp/${username}`, {
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) {
      return NextResponse.json(
        { status: "ERROR", reason: "User not found" },
        { status: res.status }
      );
    }

    const data = await res.json();

    return NextResponse.json(data, {
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return NextResponse.json(
      { status: "ERROR", reason: "Lightning service unavailable" },
      { status: 502 }
    );
  }
}
