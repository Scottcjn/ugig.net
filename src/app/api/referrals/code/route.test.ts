import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

function makeRequest() {
  return new NextRequest("http://localhost/api/referrals/code", { method: "GET" });
}

describe("GET /api/referrals/code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("should return referral code and link", async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: { referral_code: "johndoe", username: "johndoe" },
                error: null,
              }),
          }),
        }),
      }),
    };

    mockGetAuthContext.mockResolvedValue({
      user: { id: "user1" },
      supabase: mockSupabase,
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toBe("johndoe");
    expect(body.link).toBe("https://ugig.net/?ref=johndoe");
  });

  it("should return 404 when profile not found", async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({ data: null, error: { message: "Not found" } }),
          }),
        }),
      }),
    };

    mockGetAuthContext.mockResolvedValue({
      user: { id: "user1" },
      supabase: mockSupabase,
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
  });
});
