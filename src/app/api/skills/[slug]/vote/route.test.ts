import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

const serviceClient = { from: vi.fn() };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({})),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => serviceClient),
}));

import { POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";

const mockGetAuthContext = vi.mocked(getAuthContext);

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest(body: any) {
  return new NextRequest("http://localhost/api/skills/test-skill/vote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const makeParams = (slug = "test-skill") => Promise.resolve({ slug });

// ── Tests ──────────────────────────────────────────────────────────

describe("POST /api/skills/[slug]/vote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const response = await POST(makeRequest({ vote_type: 1 }), { params: makeParams() });
    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid vote_type", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: {} as any,
    });

    const response = await POST(makeRequest({ vote_type: 0 }), { params: makeParams() });
    expect(response.status).toBe(400);
  });

  it("creates upvote on skill and returns counts", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: {} as any,
    });

    serviceClient.from.mockImplementation((table: string) => {
      if (table === "skill_listings") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({
                data: { id: "listing-1", status: "active", upvotes: 1, downvotes: 0, score: 1 },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "skill_votes") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
          insert: () => Promise.resolve({ error: null }),
        };
      }
      return {};
    });

    const response = await POST(makeRequest({ vote_type: 1 }), { params: makeParams() });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.user_vote).toBe(1);
    expect(json.upvotes).toBe(1);
  });

  it("returns 404 for non-existent skill", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: {} as any,
    });

    serviceClient.from.mockImplementation((table: string) => {
      if (table === "skill_listings") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: { message: "not found" } }),
            }),
          }),
        };
      }
      return {};
    });

    const response = await POST(makeRequest({ vote_type: 1 }), { params: makeParams() });
    expect(response.status).toBe(404);
  });
});
