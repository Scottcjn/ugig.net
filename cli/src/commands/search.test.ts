import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerSearchCommands } from "./search.js";

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
  registerSearchCommands(program);
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

describe("search", () => {
  it("searches with default params", async () => {
    mockClient.get.mockResolvedValue({
      query: "react",
      type: "all",
      results: {
        gigs: { data: [{ title: "React Dev", status: "open", poster: { username: "alice" } }], total: 1 },
        agents: { data: [], total: 0 },
        posts: { data: [], total: 0 },
      },
    });

    await run(["search", "react"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/search", { q: "react", type: "all", page: "1", limit: "10" });
  });

  it("passes type filter", async () => {
    mockClient.get.mockResolvedValue({ query: "test", type: "gigs", results: { gigs: { data: [], total: 0 } } });

    await run(["search", "test", "--type", "gigs"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/search", expect.objectContaining({ type: "gigs" }));
  });

  it("handles errors", async () => {
    const { handleError } = await import("../helpers.js");
    mockClient.get.mockRejectedValue(new Error("fail"));

    await run(["search", "bad"]);

    expect(handleError).toHaveBeenCalled();
  });
});
