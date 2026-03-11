import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

const serviceFrom = vi.fn();
const serviceClient = { from: serviceFrom };

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => serviceClient),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/skills/purchase", () => ({
  executeSkillPurchase: vi.fn(),
}));

import { POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";
import { executeSkillPurchase } from "@/lib/skills/purchase";

const mockAuth = vi.mocked(getAuthContext);
const mockExecute = vi.mocked(executeSkillPurchase);

function makeRequest() {
  return new NextRequest("http://localhost/api/skills/test-skill/purchase", {
    method: "POST",
  });
}

const activeListing = {
  id: "listing-1",
  seller_id: "seller-1",
  price_sats: 5000,
  status: "active",
  title: "Test Skill",
};

// ── Tests ──────────────────────────────────────────────────────────

describe("POST /api/skills/[slug]/purchase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest(), {
      params: Promise.resolve({ slug: "test-skill" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when listing not found", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "buyer-1", authMethod: "session" },
      supabase: {} as any,
    });

    serviceFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null }),
        }),
      }),
    }));

    const res = await POST(makeRequest(), {
      params: Promise.resolve({ slug: "nonexistent" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when buying own skill", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "seller-1", authMethod: "session" },
      supabase: {} as any,
    });

    serviceFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: activeListing }),
        }),
      }),
    }));

    const res = await POST(makeRequest(), {
      params: Promise.resolve({ slug: "test-skill" }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("own skill");
  });

  it("returns 409 when already purchased", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "buyer-1", authMethod: "session" },
      supabase: {} as any,
    });

    let callCount = 0;
    serviceFrom.mockImplementation((table: string) => {
      if (table === "skill_listings") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: activeListing }),
            }),
          }),
        };
      }
      if (table === "skill_purchases") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({ data: { id: "purchase-existing" } }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({ single: () => Promise.resolve({ data: null }) }),
        }),
      };
    });

    const res = await POST(makeRequest(), {
      params: Promise.resolve({ slug: "test-skill" }),
    });
    expect(res.status).toBe(409);
  });

  it("executes purchase and returns success", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "buyer-1", authMethod: "session" },
      supabase: {} as any,
    });

    serviceFrom.mockImplementation((table: string) => {
      if (table === "skill_listings") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: activeListing }),
            }),
          }),
        };
      }
      if (table === "skill_purchases") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: null }),
              }),
            }),
          }),
        };
      }
      if (table === "subscriptions") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({ data: { plan: "free", status: "active" } }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({ data: { username: "buyer" } }),
            }),
          }),
        };
      }
      if (table === "notifications") {
        return {
          insert: () => Promise.resolve({ error: null }),
        };
      }
      return {};
    });

    mockExecute.mockResolvedValue({
      ok: true,
      purchase_id: "purchase-1",
      fee_sats: 250,
      fee_rate: 0.05,
      new_balance: 95000,
    });

    const res = await POST(makeRequest(), {
      params: Promise.resolve({ slug: "test-skill" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.purchase_id).toBe("purchase-1");
    expect(json.fee_sats).toBe(250);
    expect(json.fee_rate).toBe(0.05);
  });

  it("returns 402 on insufficient balance", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "buyer-1", authMethod: "session" },
      supabase: {} as any,
    });

    serviceFrom.mockImplementation((table: string) => {
      if (table === "skill_listings") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: activeListing }),
            }),
          }),
        };
      }
      if (table === "skill_purchases") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: null }),
              }),
            }),
          }),
        };
      }
      if (table === "subscriptions") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({ data: { plan: "free", status: "active" } }),
            }),
          }),
        };
      }
      return {};
    });

    mockExecute.mockResolvedValue({
      ok: false,
      error: "Insufficient balance",
    });

    const res = await POST(makeRequest(), {
      params: Promise.resolve({ slug: "test-skill" }),
    });
    expect(res.status).toBe(402);
  });
});
