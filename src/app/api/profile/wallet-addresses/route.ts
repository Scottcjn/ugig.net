import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";

/**
 * GET /api/profile/wallet-addresses
 * Returns wallet addresses for the current user and optionally for a worker
 * Query params: ?worker_id=uuid (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;
    const { searchParams } = new URL(request.url);
    const workerId = searchParams.get("worker_id");

    // Get poster (current user) addresses
    const { data: posterProfile } = await supabase
      .from("profiles")
      .select("wallet_addresses")
      .eq("id", user.id)
      .single();

    const posterAddresses = Array.isArray(posterProfile?.wallet_addresses) ? posterProfile.wallet_addresses : [];

    // Get worker addresses if requested
    let workerAddresses: any[] = [];
    if (workerId) {
      const { data: workerProfile } = await supabase
        .from("profiles")
        .select("wallet_addresses")
        .eq("id", workerId)
        .single();
      workerAddresses = Array.isArray(workerProfile?.wallet_addresses) ? workerProfile.wallet_addresses : [];
    }

    return NextResponse.json({
      poster_addresses: posterAddresses,
      worker_addresses: workerAddresses,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch wallet addresses" },
      { status: 500 }
    );
  }
}
