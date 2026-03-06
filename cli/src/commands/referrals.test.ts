import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerReferralsCommands } from "./referrals.js";

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
  registerReferralsCommands(program);
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

describe("referrals", () => {
  it("lists referrals with stats", async () => {
    mockClient.get.mockResolvedValue({
      data: [{ referred_email: "a@b.com", status: "registered", referral_code: "ABC", created_at: new Date().toISOString() }],
      stats: { total_invited: 5, total_registered: 3, conversion_rate: 60 },
    });

    await run(["referrals"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/referrals");
  });

  it("handles errors", async () => {
    const { handleError } = await import("../helpers.js");
    mockClient.get.mockRejectedValue(new Error("fail"));

    await run(["referrals"]);

    expect(handleError).toHaveBeenCalled();
  });
});

describe("referral-code", () => {
  it("fetches referral code", async () => {
    mockClient.get.mockResolvedValue({ code: "REF123", link: "https://ugig.net/r/REF123" });

    await run(["referral-code"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/referrals/code");
  });
});
