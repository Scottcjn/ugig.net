import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerDirectoryCommands } from "./directory.js";

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
  registerDirectoryCommands(program);
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

describe("directory list", () => {
  it("lists directory entries", async () => {
    mockClient.get.mockResolvedValue({
      listings: [
        {
          id: "1",
          title: "Test Entry",
          url: "https://example.com",
          category: "tools",
          score: 5,
          created_at: new Date().toISOString(),
        },
      ],
      total: 1,
    });

    await run(["directory", "list"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/directory", expect.objectContaining({}));
  });

  it("passes search params", async () => {
    mockClient.get.mockResolvedValue({ listings: [], total: 0 });

    await run(["directory", "list", "--search", "automation", "--category", "tools"]);

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/directory",
      expect.objectContaining({
        search: "automation",
        category: "tools",
      }),
    );
  });
});

describe("directory view", () => {
  it("gets entry by id", async () => {
    mockClient.get.mockResolvedValue({
      listing: { id: "123", title: "My Entry" },
    });

    await run(["directory", "view", "123"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/directory/123");
  });
});

describe("directory submit", () => {
  it("submits a directory entry", async () => {
    mockClient.post.mockResolvedValue({
      listing: { id: "123", title: "My Entry", url: "https://example.com" },
    });

    await run([
      "directory",
      "submit",
      "--url",
      "https://example.com",
      "--title",
      "My Entry",
      "--description",
      "A great tool",
      "--category",
      "tools",
    ]);

    expect(mockClient.post).toHaveBeenCalledWith(
      "/api/directory",
      expect.objectContaining({
        url: "https://example.com",
        title: "My Entry",
        description: "A great tool",
        category: "tools",
      }),
    );
  });

  it("passes tags", async () => {
    mockClient.post.mockResolvedValue({
      listing: { id: "123", url: "https://example.com" },
    });

    await run([
      "directory",
      "submit",
      "--url",
      "https://example.com",
      "--tags",
      "ai,tools,coding",
    ]);

    expect(mockClient.post).toHaveBeenCalledWith(
      "/api/directory",
      expect.objectContaining({
        tags: ["ai", "tools", "coding"],
      }),
    );
  });
});

describe("directory update", () => {
  it("updates a directory entry", async () => {
    mockClient.patch.mockResolvedValue({
      listing: { id: "123", title: "Updated" },
    });

    await run(["directory", "update", "123", "--title", "Updated", "--category", "resources"]);

    expect(mockClient.patch).toHaveBeenCalledWith(
      "/api/directory/123",
      expect.objectContaining({
        title: "Updated",
        category: "resources",
      }),
    );
  });
});

describe("directory delete", () => {
  it("deletes a directory entry", async () => {
    mockClient.delete.mockResolvedValue({ ok: true });

    await run(["directory", "delete", "123"]);

    expect(mockClient.delete).toHaveBeenCalledWith("/api/directory/123");
  });
});

describe("directory vote", () => {
  it("upvotes a directory entry", async () => {
    mockClient.post.mockResolvedValue({ upvotes: 1, downvotes: 0, score: 1, user_vote: 1 });

    await run(["directory", "vote", "123"]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/directory/123/vote", { vote_type: 1 });
  });
});

describe("directory comments", () => {
  it("lists comments on an entry", async () => {
    mockClient.get.mockResolvedValue({ comments: [] });

    await run(["directory", "comments", "123"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/directory/123/comments");
  });
});

describe("directory comment", () => {
  it("adds a comment to an entry", async () => {
    mockClient.post.mockResolvedValue({
      comment: { text: "Great tool!", id: "c1" },
    });

    await run(["directory", "comment", "123", "--text", "Great tool!"]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/directory/123/comments", {
      text: "Great tool!",
    });
  });
});

describe("directory fetch-meta", () => {
  it("fetches metadata from URL", async () => {
    mockClient.post.mockResolvedValue({
      metadata: {
        title: "Example Site",
        description: "A great site",
      },
    });

    await run(["directory", "fetch-meta", "https://example.com"]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/directory/fetch-meta", {
      url: "https://example.com",
    });
  });
});

describe("directory mine", () => {
  it("lists own directory entries", async () => {
    mockClient.get.mockResolvedValue({ listings: [] });

    await run(["directory", "mine"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/directory/my");
  });
});
