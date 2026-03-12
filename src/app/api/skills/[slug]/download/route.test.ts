import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

const mockCreateSignedUrl = vi.fn();
const serviceClient = {
  from: vi.fn(),
  storage: {
    from: vi.fn(() => ({
      createSignedUrl: mockCreateSignedUrl,
    })),
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({})),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => serviceClient),
}));

import { GET } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";

const mockGetAuthContext = vi.mocked(getAuthContext);

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest() {
  return new NextRequest("http://localhost/api/skills/test-skill/download", {
    method: "GET",
  });
}

const makeParams = (slug = "test-skill") => Promise.resolve({ slug });

function mockListing(listing: any) {
  serviceClient.from.mockImplementation((table: string) => {
    if (table === "skill_listings") {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({
              data: listing,
              error: listing ? null : { message: "not found" },
            }),
          }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      };
    }
    if (table === "skill_purchases") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
      };
    }
    return {};
  });
}

function mockListingWithPurchase(listing: any, hasPurchase: boolean) {
  serviceClient.from.mockImplementation((table: string) => {
    if (table === "skill_listings") {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({
              data: listing,
              error: listing ? null : { message: "not found" },
            }),
          }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      };
    }
    if (table === "skill_purchases") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: () => Promise.resolve({
                data: hasPurchase ? { id: "purchase-1" } : null,
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    return {};
  });
}

// ── Tests ──────────────────────────────────────────────────────────

describe("GET /api/skills/[slug]/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const response = await GET(makeRequest(), { params: makeParams() });
    expect(response.status).toBe(401);
  });

  it("returns 404 when listing not found", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: {} as any,
    });
    mockListing(null);

    const response = await GET(makeRequest(), { params: makeParams() });
    expect(response.status).toBe(404);
  });

  it("returns 404 when listing has no file", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: {} as any,
    });
    mockListing({
      id: "listing-1",
      seller_id: "user-1",
      skill_file_path: null,
      status: "active",
      price_sats: 100,
    });

    const response = await GET(makeRequest(), { params: makeParams() });
    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toContain("No file");
  });

  it("returns 403 when user has not purchased", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "buyer-1", authMethod: "session" },
      supabase: {} as any,
    });
    mockListingWithPurchase(
      {
        id: "listing-1",
        seller_id: "seller-1",
        skill_file_path: "seller-1/test-skill/skill.zip",
        status: "active",
        price_sats: 500,
      },
      false
    );

    const response = await GET(makeRequest(), { params: makeParams() });
    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error).toContain("Purchase required");
  });

  it("returns signed URL for owner (seller)", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "seller-1", authMethod: "session" },
      supabase: {} as any,
    });
    mockListing({
      id: "listing-1",
      seller_id: "seller-1",
      skill_file_path: "seller-1/test-skill/skill.zip",
      status: "active",
      price_sats: 500,
    });

    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example.com/signed?token=abc" },
      error: null,
    });

    const response = await GET(makeRequest(), { params: makeParams() });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.url).toContain("signed");
    expect(json.expires_in).toBe(300);
  });

  it("returns signed URL for buyer with purchase", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "buyer-1", authMethod: "session" },
      supabase: {} as any,
    });
    mockListingWithPurchase(
      {
        id: "listing-1",
        seller_id: "seller-1",
        skill_file_path: "seller-1/test-skill/skill.zip",
        status: "active",
        price_sats: 500,
      },
      true
    );

    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example.com/signed?token=xyz" },
      error: null,
    });

    const response = await GET(makeRequest(), { params: makeParams() });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.url).toContain("signed");
  });

  it("returns 404 for archived listing (non-owner)", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "buyer-1", authMethod: "session" },
      supabase: {} as any,
    });
    mockListing({
      id: "listing-1",
      seller_id: "seller-1",
      skill_file_path: "seller-1/test-skill/skill.zip",
      status: "archived",
      price_sats: 500,
    });

    const response = await GET(makeRequest(), { params: makeParams() });
    expect(response.status).toBe(404);
  });
});
