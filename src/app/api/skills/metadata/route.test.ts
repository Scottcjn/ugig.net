import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({})),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/skills/metadata-extract", () => ({
  extractMetadata: vi.fn(),
  MetadataExtractionError: class extends Error {
    constructor(message: string) {
      super(message);
      this.name = "MetadataExtractionError";
    }
  },
}));

import { POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";
import { extractMetadata, MetadataExtractionError } from "@/lib/skills/metadata-extract";

const mockGetAuthContext = vi.mocked(getAuthContext);
const mockExtractMetadata = vi.mocked(extractMetadata);

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/skills/metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/skills/metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const response = await POST(makeRequest({ url: "https://example.com" }));
    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid URL", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: {} as any,
    });

    const response = await POST(makeRequest({ url: "not-a-url" }));
    expect(response.status).toBe(400);
  });

  it("returns 400 when url is missing", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: {} as any,
    });

    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);
  });

  it("returns extracted metadata", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: {} as any,
    });

    mockExtractMetadata.mockResolvedValue({
      title: "Cool Skill",
      description: "Does cool stuff",
      imageUrl: "https://example.com/logo.png",
      tags: ["automation"],
      url: "https://example.com",
    });

    const response = await POST(makeRequest({ url: "https://example.com" }));
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.metadata.title).toBe("Cool Skill");
    expect(json.metadata.tags).toEqual(["automation"]);
  });

  it("returns 422 when extraction fails", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: {} as any,
    });

    // Throw an instance of the mocked MetadataExtractionError class
    const extractError = new MetadataExtractionError("Hostname is blocked");
    mockExtractMetadata.mockRejectedValue(extractError);

    const response = await POST(makeRequest({ url: "https://example.com" }));
    expect(response.status).toBe(422);
  });
});
