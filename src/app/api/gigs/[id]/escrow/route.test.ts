import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/coinpayportal", () => ({
  createEscrow: vi.fn(),
  SUPPORTED_CURRENCIES: {
    usdc_sol: { name: "USDC (Solana)", symbol: "USDC" },
    sol: { name: "Solana", symbol: "SOL" },
  },
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

import { GET, POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";

const GIG_ID = "c2c2c2c2-d3d3-e4e4-f5f5-a6a6a6a6a6a6";
const APP_ID = "b1b1b1b1-c2c2-d3d3-e4e4-f5f5f5f5f5f5";

function req(body?: unknown) {
  return { json: () => Promise.resolve(body) } as any;
}
const params = { params: Promise.resolve({ id: GIG_ID }) };

describe("GET /api/gigs/[id]/escrow", () => {
  it("returns 401 if not authenticated", async () => {
    (getAuthContext as any).mockResolvedValue(null);
    const res = await GET(req(), params);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/gigs/[id]/escrow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 if not authenticated", async () => {
    (getAuthContext as any).mockResolvedValue(null);
    const res = await POST(req({ application_id: APP_ID, currency: "sol" }), params);
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing application_id", async () => {
    (getAuthContext as any).mockResolvedValue({ user: { id: "u1" }, supabase: {} });
    const res = await POST(req({ currency: "sol" }), params);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid currency", async () => {
    (getAuthContext as any).mockResolvedValue({ user: { id: "u1" }, supabase: {} });
    const res = await POST(req({ application_id: APP_ID, currency: "dogecoin" }), params);
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-uuid application_id", async () => {
    (getAuthContext as any).mockResolvedValue({ user: { id: "u1" }, supabase: {} });
    const res = await POST(req({ application_id: "not-a-uuid", currency: "sol" }), params);
    expect(res.status).toBe(400);
  });
});
