import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

const supabaseClient = {
  from: vi.fn(),
};

const serviceClient = { from: vi.fn() };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseClient)),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => serviceClient),
}));

import { GET, POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";

const mockGetAuthContext = vi.mocked(getAuthContext);

// ── Helpers ────────────────────────────────────────────────────────

function makeGetRequest() {
  return new NextRequest("http://localhost/api/skills/test-skill/comments", {
    method: "GET",
  });
}

function makePostRequest(body: any) {
  return new NextRequest("http://localhost/api/skills/test-skill/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const makeParams = (slug = "test-skill") => Promise.resolve({ slug });

// ── Tests ──────────────────────────────────────────────────────────

describe("GET /api/skills/[slug]/comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when listing not found", async () => {
    supabaseClient.from.mockImplementation((table: string) => {
      if (table === "skill_listings") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: null, error: { message: "not found" } }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    const response = await GET(makeGetRequest(), { params: makeParams() });
    expect(response.status).toBe(404);
  });

  it("returns threaded comments", async () => {
    const comments = [
      {
        id: "c1", listing_id: "l1", author_id: "u1", parent_id: null,
        content: "Great skill!", depth: 0, upvotes: 0, downvotes: 0, score: 0,
        created_at: "2026-01-01", updated_at: "2026-01-01",
        author: { id: "u1", username: "alice", full_name: "Alice", avatar_url: null },
      },
      {
        id: "c2", listing_id: "l1", author_id: "u2", parent_id: "c1",
        content: "Thanks!", depth: 1, upvotes: 0, downvotes: 0, score: 0,
        created_at: "2026-01-02", updated_at: "2026-01-02",
        author: { id: "u2", username: "bob", full_name: "Bob", avatar_url: null },
      },
    ];

    supabaseClient.from.mockImplementation((table: string) => {
      if (table === "skill_listings") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: { id: "l1" }, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "skill_comments") {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: comments, error: null }),
            }),
          }),
        };
      }
      return {};
    });

    const response = await GET(makeGetRequest(), { params: makeParams() });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.comments).toHaveLength(1); // 1 root
    expect(json.comments[0].replies).toHaveLength(1); // 1 reply
    expect(json.total).toBe(2);
  });
});

describe("POST /api/skills/[slug]/comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const response = await POST(
      makePostRequest({ content: "Hello" }),
      { params: makeParams() }
    );
    expect(response.status).toBe(401);
  });

  it("returns 400 for empty content", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: {} as any,
    });

    const response = await POST(
      makePostRequest({ content: "" }),
      { params: makeParams() }
    );
    expect(response.status).toBe(400);
  });

  it("creates a comment and returns 201", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: {} as any,
    });

    const createdComment = {
      id: "c1", listing_id: "l1", author_id: "user-1", parent_id: null,
      content: "This is awesome!", depth: 0,
      author: { id: "user-1", username: "alice", full_name: "Alice", avatar_url: null },
    };

    serviceClient.from.mockImplementation((table: string) => {
      if (table === "skill_listings") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({
                data: { id: "l1", seller_id: "seller-1", title: "Test", status: "active" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "skill_comments") {
        return {
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: createdComment, error: null }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({
                data: { username: "alice", full_name: "Alice" },
                error: null,
              }),
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

    const response = await POST(
      makePostRequest({ content: "This is awesome!" }),
      { params: makeParams() }
    );
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.comment.content).toBe("This is awesome!");
  });
});
