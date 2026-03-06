import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerZapsCommands } from "./zaps.js";

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
  registerZapsCommands(program);
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

describe("zap", () => {
  it("sends a zap to a user", async () => {
    mockClient.get.mockResolvedValue({ profile: { id: "user-123" } });
    mockClient.post.mockResolvedValue({ ok: true, new_balance: 900, fee_sats: 1 });

    await run(["zap", "@alice", "100"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/users/alice");
    expect(mockClient.post).toHaveBeenCalledWith("/api/wallet/zap", expect.objectContaining({
      recipient_id: "user-123",
      amount_sats: 100,
      target_type: "profile",
    }));
  });

  it("handles errors via handleError", async () => {
    const { handleError } = await import("../helpers.js");
    mockClient.get.mockRejectedValue(new Error("fail"));

    await run(["zap", "bob", "50"]);

    expect(handleError).toHaveBeenCalled();
  });
});

describe("zap-stats", () => {
  it("fetches zap stats for a user", async () => {
    mockClient.get.mockResolvedValue({ total_sats_received: 5000, zap_count: 42 });

    await run(["zap-stats", "user-123"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/zaps/stats", { user_id: "user-123" });
  });
});
