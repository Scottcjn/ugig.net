import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerPromptsCommands } from "./prompts.js";

vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  })),
}));

const mockClient = {
  post: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("../helpers.js", () => ({
  createClient: vi.fn(() => mockClient),
  createUnauthClient: vi.fn(() => mockClient),
  handleError: vi.fn(),
}));

function makeProgram(): Command {
  const program = new Command();
  program
    .option("--json", "JSON output", false)
    .option("--api-key <key>", "API key")
    .option("--base-url <url>", "Base URL");
  registerPromptsCommands(program);
  return program;
}

async function run(args: string[]): Promise<void> {
  const program = makeProgram();
  await program.parseAsync(["node", "ugig", ...args]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("prompts list", () => {
  it("lists active prompts", async () => {
    mockClient.get.mockResolvedValue({
      listings: [
        {
          slug: "test-prompt",
          title: "Test Prompt",
          price_sats: 100,
          rating_avg: 4.5,
          downloads_count: 10,
          created_at: new Date().toISOString(),
        },
      ],
      total: 1,
    });

    await run(["prompts", "list"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/prompts", expect.objectContaining({}));
  });

  it("passes search params", async () => {
    mockClient.get.mockResolvedValue({ listings: [], total: 0 });

    await run(["prompts", "list", "--search", "automation", "--category", "coding"]);

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/prompts",
      expect.objectContaining({
        search: "automation",
        category: "coding",
      }),
    );
  });
});

describe("prompts view", () => {
  it("gets prompt by slug", async () => {
    mockClient.get.mockResolvedValue({
      listing: { slug: "my-prompt", title: "My Prompt" },
      purchased: false,
    });

    await run(["prompts", "view", "my-prompt"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/prompts/my-prompt");
  });
});

describe("prompts create", () => {
  it("creates a prompt listing", async () => {
    mockClient.post.mockResolvedValue({
      listing: { slug: "my-prompt", title: "My Prompt" },
    });

    await run([
      "prompts",
      "create",
      "--title",
      "My Prompt",
      "--description",
      "A test prompt",
      "--price",
      "500",
      "--category",
      "coding",
    ]);

    expect(mockClient.post).toHaveBeenCalledWith(
      "/api/prompts",
      expect.objectContaining({
        title: "My Prompt",
        description: "A test prompt",
        price_sats: 500,
        category: "coding",
      }),
    );
  });
});

describe("prompts update", () => {
  it("updates a prompt listing", async () => {
    mockClient.patch.mockResolvedValue({
      listing: { slug: "my-prompt", title: "Updated" },
    });

    await run(["prompts", "update", "my-prompt", "--title", "Updated", "--status", "active"]);

    expect(mockClient.patch).toHaveBeenCalledWith(
      "/api/prompts/my-prompt",
      expect.objectContaining({
        title: "Updated",
        status: "active",
      }),
    );
  });
});

describe("prompts delete", () => {
  it("archives a prompt listing", async () => {
    mockClient.delete.mockResolvedValue({ ok: true });

    await run(["prompts", "delete", "my-prompt"]);

    expect(mockClient.delete).toHaveBeenCalledWith("/api/prompts/my-prompt");
  });
});

describe("prompts mine", () => {
  it("lists own listings", async () => {
    mockClient.get.mockResolvedValue({ listings: [] });

    await run(["prompts", "mine"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/prompts/my");
  });
});

describe("prompts vote", () => {
  it("upvotes a prompt", async () => {
    mockClient.post.mockResolvedValue({ upvotes: 1, downvotes: 0, score: 1, user_vote: 1 });

    await run(["prompts", "vote", "my-prompt"]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/prompts/my-prompt/vote", { vote_type: 1 });
  });
});

describe("prompts unvote", () => {
  it("removes vote from a prompt", async () => {
    mockClient.post.mockResolvedValue({ upvotes: 0, downvotes: 0, score: 0, user_vote: null });

    await run(["prompts", "unvote", "my-prompt"]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/prompts/my-prompt/vote", { vote_type: 1 });
  });
});

describe("prompts purchase", () => {
  it("purchases a prompt", async () => {
    mockClient.post.mockResolvedValue({
      ok: true,
      purchase_id: "abc123",
      fee_sats: 50,
      fee_rate: 0.1,
      new_balance: 950,
    });

    await run(["prompts", "purchase", "my-prompt"]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/prompts/my-prompt/purchase", {});
  });
});

describe("prompts library", () => {
  it("lists purchased prompts", async () => {
    mockClient.get.mockResolvedValue({ purchases: [] });

    await run(["prompts", "library"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/prompts/library");
  });
});

describe("prompts reviews", () => {
  it("lists reviews for a prompt", async () => {
    mockClient.get.mockResolvedValue({ reviews: [] });

    await run(["prompts", "reviews", "my-prompt"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/prompts/my-prompt/reviews");
  });
});

describe("prompts review", () => {
  it("submits a review", async () => {
    mockClient.post.mockResolvedValue({
      review: { rating: 5, comment: "Great!" },
    });

    await run(["prompts", "review", "my-prompt", "--rating", "5", "--comment", "Great!"]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/prompts/my-prompt/reviews", {
      rating: 5,
      comment: "Great!",
    });
  });
});

describe("prompts download", () => {
  it("downloads a purchased prompt", async () => {
    mockClient.post.mockResolvedValue({
      content: "You are a helpful assistant...",
      title: "My Prompt",
    });

    await run(["prompts", "download", "my-prompt"]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/prompts/my-prompt/download", {});
  });
});
