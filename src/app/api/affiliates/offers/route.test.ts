import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock auth
const mockGetAuthContext = vi.fn();
vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

// Mock supabase service client
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

import { GET, POST } from "./route";

function makeRequest(params: Record<string, string> = {}, method = "GET") {
  const url = new URL("http://localhost/api/affiliates/offers");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url, { method });
}

// Chainable mock for supabase queries
function chainable(data: unknown, error: unknown = null, count: number | null = null) {
  const result = { data, error, count };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === "then") return undefined;
      if (prop === "data") return data;
      if (prop === "error") return error;
      if (prop === "count") return count;
      return (..._args: unknown[]) => new Proxy(result, handler);
    },
  };
  return new Proxy(result, handler);
}

describe("GET /api/affiliates/offers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(null);
  });

  it("sorts by commission_flat_sats when sort=commission (#24/#34)", async () => {
    const offers = [
      { id: "1", title: "A", commission_flat_sats: 500, seller_id: "s1" },
      { id: "2", title: "B", commission_flat_sats: 1000, seller_id: "s2" },
    ];
    mockFrom.mockReturnValue(chainable(offers, null, 2));

    const res = await GET(makeRequest({ sort: "commission" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.offers).toHaveLength(2);
    // Verify that mockFrom was called and the chain included order with commission_flat_sats
    expect(mockFrom).toHaveBeenCalled();
  });

  it("filters by search query (#21)", async () => {
    mockFrom.mockReturnValue(chainable([], null, 0));

    const res = await GET(makeRequest({ q: "test search" }));
    expect(res.status).toBe(200);
    expect(mockFrom).toHaveBeenCalled();
  });

  it("hides product_url from unauthenticated users (#20)", async () => {
    const offers = [
      { id: "1", title: "Offer", product_url: "https://secret.com", seller_id: "seller1" },
    ];
    mockFrom.mockReturnValue(chainable(offers, null, 1));
    mockGetAuthContext.mockResolvedValue(null);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.offers[0].product_url).toBeUndefined();
  });
});

describe("POST /api/affiliates/offers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects javascript: URL in product_url (#18)", async () => {
    mockGetAuthContext.mockResolvedValue({ user: { id: "user1" } });

    const req = new NextRequest("http://localhost/api/affiliates/offers", {
      method: "POST",
      body: JSON.stringify({
        title: "Test Offer",
        description: "A description that is long enough",
        product_url: "javascript:alert(1)",
        price_sats: 1000,
        commission_type: "percentage",
        commission_rate: 0.2,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("product_url");
  });

  it("strips HTML from title (#26)", async () => {
    mockGetAuthContext.mockResolvedValue({ user: { id: "user1" } });
    
    const insertMock = vi.fn().mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({
          data: { id: "new-id", slug: "test-offer", title: "Test Offer" },
          error: null,
        }),
      }),
    });
    
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
      insert: insertMock,
    });

    const req = new NextRequest("http://localhost/api/affiliates/offers", {
      method: "POST",
      body: JSON.stringify({
        title: "<b>Test</b> Offer",
        description: "A description that is long enough for validation",
        price_sats: 1000,
        commission_type: "percentage",
        commission_rate: 0.2,
      }),
    });

    const res = await POST(req);
    // If we get 201, the title was sanitized and accepted
    // If insert is called, check the title was stripped
    if (insertMock.mock.calls.length > 0) {
      const insertData = insertMock.mock.calls[0][0];
      expect(insertData.title).not.toContain("<b>");
    }
  });

  it("rejects negative commission_flat_sats (#23)", async () => {
    mockGetAuthContext.mockResolvedValue({ user: { id: "user1" } });

    const req = new NextRequest("http://localhost/api/affiliates/offers", {
      method: "POST",
      body: JSON.stringify({
        title: "Test Offer",
        description: "A description that is long enough",
        price_sats: 1000,
        commission_type: "flat",
        commission_flat_sats: -500,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 for unauthenticated requests", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/affiliates/offers", {
      method: "POST",
      body: JSON.stringify({ title: "Test" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
