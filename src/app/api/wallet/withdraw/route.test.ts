import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth
const mockGetAuthContext = vi.fn();
vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: (...args: any[]) => mockGetAuthContext(...args),
}));

// Mock supabase
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockEq = vi.fn();
const mockGte = vi.fn();
const mockSingle = vi.fn();
const mockRpc = vi.fn();

const mockFrom = vi.fn(() => ({
  select: mockSelect,
  update: mockUpdate,
  insert: mockInsert,
  eq: mockEq,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

// Mock fetch for LNbits
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { POST } from "./route";

function makeRequest(body: any) {
  return new Request("http://localhost/api/wallet/withdraw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

describe("POST /api/wallet/withdraw", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: authenticated user
    mockGetAuthContext.mockResolvedValue({ user: { id: "user-123" } });

    // Default chain: rate limit check returns 0
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({ count: 0 }),
          }),
        }),
      }),
    });
  });

  it("rejects unauthenticated requests", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await POST(makeRequest({ amount_sats: 100, destination: "user@wallet.com" }));
    expect(res.status).toBe(401);
  });

  it("rejects missing fields", async () => {
    const res = await POST(makeRequest({ amount_sats: 100 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/required/i);
  });

  it("rejects amounts below minimum", async () => {
    const res = await POST(makeRequest({ amount_sats: 5, destination: "user@wallet.com" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/between/i);
  });

  it("rejects amounts above maximum", async () => {
    const res = await POST(makeRequest({ amount_sats: 200000, destination: "user@wallet.com" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/between/i);
  });

  it("rejects non-integer amounts", async () => {
    // Set up the chain to get past rate limiting
    const chainMock = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({ count: 0 }),
          }),
        }),
      }),
    };
    mockFrom.mockReturnValue(chainMock);

    const res = await POST(makeRequest({ amount_sats: 10.5, destination: "user@wallet.com" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/whole number/i);
  });

  it("rejects invalid destination", async () => {
    // Set up full chain mock for rate limit + daily limit + balance
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        // Rate limit and daily limit checks
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockResolvedValue({ count: 0, data: [] }),
              }),
            }),
          }),
        };
      }
      // Balance check
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { balance_sats: 1000 } }),
          }),
        }),
      };
    });

    mockRpc.mockResolvedValue({ data: [{ user_id: "user-123", balance_sats: 900 }], error: null });

    const res = await POST(makeRequest({ amount_sats: 100, destination: "not-valid" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/invalid destination/i);
  });

  it("prevents withdrawing more than balance", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockResolvedValue({ count: 0, data: [] }),
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { balance_sats: 50 } }),
            eq: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      };
    });

    // Atomic rpc returns empty (insufficient balance)
    mockRpc.mockResolvedValue({ data: [], error: null });

    const res = await POST(makeRequest({ amount_sats: 100, destination: "user@wallet.com" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/insufficient/i);
  });
});
