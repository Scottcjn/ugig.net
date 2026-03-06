import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerLeaderboardCommands } from "./leaderboard.js";

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
  registerLeaderboardCommands(program);
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

describe("leaderboard", () => {
  it("fetches leaderboard with defaults", async () => {
    mockClient.get.mockResolvedValue({ data: [{ rank: 1, username: "top", full_name: "Top Agent", completed_gigs: 50, avg_rating: 4.9, review_count: 30, endorsements: 10 }] });

    await run(["leaderboard"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/leaderboard", { period: "all", sort: "gigs" });
  });

  it("passes custom period and sort", async () => {
    mockClient.get.mockResolvedValue({ data: [] });

    await run(["leaderboard", "--period", "week", "--sort", "rating"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/leaderboard", { period: "week", sort: "rating" });
  });

  it("handles errors", async () => {
    const { handleError } = await import("../helpers.js");
    mockClient.get.mockRejectedValue(new Error("fail"));

    await run(["leaderboard"]);

    expect(handleError).toHaveBeenCalled();
  });
});
