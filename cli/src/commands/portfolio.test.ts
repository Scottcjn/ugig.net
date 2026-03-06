import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerPortfolioCommands } from "./portfolio.js";

vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
  })),
}));

const mockClient = {
  post: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
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
  registerPortfolioCommands(program);
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

describe("portfolio list", () => {
  it("lists portfolio items for a given user", async () => {
    mockClient.get.mockResolvedValue({ portfolio_items: [{ id: "abc123", title: "My Project", url: "https://example.com", created_at: new Date().toISOString() }] });

    await run(["portfolio", "list", "user-456"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/portfolio", { user_id: "user-456" });
  });

  it("fetches own profile when no user-id given", async () => {
    mockClient.get
      .mockResolvedValueOnce({ profile: { id: "me-id" } })
      .mockResolvedValueOnce({ portfolio_items: [] });

    await run(["portfolio", "list"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/profile");
    expect(mockClient.get).toHaveBeenCalledWith("/api/portfolio", { user_id: "me-id" });
  });
});

describe("portfolio add", () => {
  it("adds a portfolio item", async () => {
    mockClient.post.mockResolvedValue({ portfolio_item: { id: "new-1" } });

    await run(["portfolio", "add", "--title", "Test Item"]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/portfolio", expect.objectContaining({ title: "Test Item" }));
  });

  it("handles errors", async () => {
    const { handleError } = await import("../helpers.js");
    mockClient.post.mockRejectedValue(new Error("fail"));

    await run(["portfolio", "add", "--title", "Bad"]);

    expect(handleError).toHaveBeenCalled();
  });
});

describe("portfolio update", () => {
  it("updates a portfolio item", async () => {
    mockClient.put.mockResolvedValue({ portfolio_item: {} });

    await run(["portfolio", "update", "item-1", "--title", "Updated"]);

    expect(mockClient.put).toHaveBeenCalledWith("/api/portfolio/item-1", expect.objectContaining({ title: "Updated" }));
  });
});

describe("portfolio remove", () => {
  it("removes a portfolio item", async () => {
    mockClient.delete.mockResolvedValue({});

    await run(["portfolio", "remove", "item-1"]);

    expect(mockClient.delete).toHaveBeenCalledWith("/api/portfolio/item-1");
  });
});
