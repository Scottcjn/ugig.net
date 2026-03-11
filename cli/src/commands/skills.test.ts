import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerSkillsCommands } from "./skills.js";

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
  uploadFile: vi.fn(),
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
  registerSkillsCommands(program);
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

describe("skills list", () => {
  it("lists active skills", async () => {
    mockClient.get.mockResolvedValue({
      listings: [
        {
          slug: "test-skill",
          title: "Test Skill",
          price_sats: 100,
          rating_avg: 4.5,
          downloads_count: 10,
          scan_status: "clean",
          created_at: new Date().toISOString(),
        },
      ],
      total: 1,
    });

    await run(["skills", "list"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/skills", expect.objectContaining({}));
  });

  it("passes search params", async () => {
    mockClient.get.mockResolvedValue({ listings: [], total: 0 });

    await run(["skills", "list", "--search", "automation", "--category", "coding"]);

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/skills",
      expect.objectContaining({
        search: "automation",
        category: "coding",
      }),
    );
  });
});

describe("skills get", () => {
  it("gets skill by slug", async () => {
    mockClient.get.mockResolvedValue({
      listing: { slug: "my-skill", title: "My Skill" },
      purchased: false,
    });

    await run(["skills", "get", "my-skill"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/skills/my-skill");
  });
});

describe("skills create", () => {
  it("creates a skill listing", async () => {
    mockClient.post.mockResolvedValue({
      listing: { slug: "my-skill", title: "My Skill" },
    });

    await run([
      "skills",
      "create",
      "--title",
      "My Skill",
      "--description",
      "A test skill for testing",
      "--price",
      "500",
      "--category",
      "coding",
    ]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/skills", expect.objectContaining({
      title: "My Skill",
      description: "A test skill for testing",
      price_sats: 500,
      category: "coding",
    }));
  });

  it("uses source-url for autofill", async () => {
    mockClient.post
      .mockResolvedValueOnce({
        metadata: {
          title: "Auto Title",
          description: "Auto Description",
          tags: ["auto"],
        },
      })
      .mockResolvedValueOnce({
        listing: { slug: "my-skill", title: "My Skill" },
      });

    await run([
      "skills",
      "create",
      "--title",
      "My Skill",
      "--description",
      "A test skill",
      "--source-url",
      "https://example.com",
    ]);

    // First call is metadata fetch
    expect(mockClient.post).toHaveBeenCalledWith("/api/skills/metadata", { url: "https://example.com" });
    // Second call creates the listing
    expect(mockClient.post).toHaveBeenCalledWith("/api/skills", expect.objectContaining({
      source_url: "https://example.com",
    }));
  });
});

describe("skills update", () => {
  it("updates a skill listing", async () => {
    mockClient.patch.mockResolvedValue({
      listing: { slug: "my-skill", title: "Updated" },
    });

    await run(["skills", "update", "my-skill", "--title", "Updated", "--status", "active"]);

    expect(mockClient.patch).toHaveBeenCalledWith("/api/skills/my-skill", expect.objectContaining({
      title: "Updated",
      status: "active",
    }));
  });

  it("passes source-url on update", async () => {
    mockClient.patch.mockResolvedValue({
      listing: { slug: "my-skill" },
    });

    await run(["skills", "update", "my-skill", "--source-url", "https://github.com/repo"]);

    expect(mockClient.patch).toHaveBeenCalledWith("/api/skills/my-skill", expect.objectContaining({
      source_url: "https://github.com/repo",
    }));
  });
});

describe("skills delete", () => {
  it("archives a skill listing", async () => {
    mockClient.delete.mockResolvedValue({ ok: true });

    await run(["skills", "delete", "my-skill"]);

    expect(mockClient.delete).toHaveBeenCalledWith("/api/skills/my-skill");
  });
});

describe("skills metadata", () => {
  it("fetches metadata from URL", async () => {
    mockClient.post.mockResolvedValue({
      metadata: {
        title: "Cool Skill",
        description: "Does stuff",
        tags: ["coding"],
      },
    });

    await run(["skills", "metadata", "https://example.com"]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/skills/metadata", { url: "https://example.com" });
  });
});

describe("skills my", () => {
  it("lists own listings", async () => {
    mockClient.get.mockResolvedValue({ listings: [] });

    await run(["skills", "my"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/skills/my");
  });
});
