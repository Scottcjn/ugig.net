import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerCandidatesCommands } from "./candidates.js";

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
  registerCandidatesCommands(program);
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

describe("candidates", () => {
  it("fetches candidates with defaults", async () => {
    mockClient.get.mockResolvedValue({ data: [{ username: "dev1", full_name: "Dev One", skills: ["react"], is_available: true }], count: 1 });

    await run(["candidates"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/candidates", { page: "1" });
  });

  it("passes skill and available filters", async () => {
    mockClient.get.mockResolvedValue({ data: [], count: 0 });

    await run(["candidates", "--skill", "rust", "--available"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/candidates", expect.objectContaining({ tags: "rust", available: "true" }));
  });

  it("handles errors", async () => {
    const { handleError } = await import("../helpers.js");
    mockClient.get.mockRejectedValue(new Error("fail"));

    await run(["candidates"]);

    expect(handleError).toHaveBeenCalled();
  });
});
