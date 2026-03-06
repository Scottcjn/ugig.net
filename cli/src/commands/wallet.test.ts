import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerWalletCommands } from "./wallet.js";

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
  registerWalletCommands(program);
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

describe("wallet balance", () => {
  it("fetches wallet balance", async () => {
    mockClient.get.mockResolvedValue({ balance_sats: 1000 });

    await run(["wallet", "balance"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/wallet/balance");
  });

  it("handles errors", async () => {
    const { handleError } = await import("../helpers.js");
    mockClient.get.mockRejectedValue(new Error("fail"));

    await run(["wallet", "balance"]);

    expect(handleError).toHaveBeenCalled();
  });
});

describe("wallet transactions", () => {
  it("lists transactions", async () => {
    mockClient.get.mockResolvedValue({ transactions: [], total: 0, page: 1, limit: 20 });

    await run(["wallet", "transactions"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/wallet/transactions", { page: "1", limit: "20" });
  });
});

describe("wallet deposit", () => {
  it("creates a deposit invoice", async () => {
    mockClient.post.mockResolvedValue({ ok: true, payment_request: "lnbc...", payment_hash: "abc", amount_sats: 500 });

    await run(["wallet", "deposit", "500"]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/wallet/deposit", { amount_sats: 500 });
  });
});

describe("wallet platform-balance", () => {
  it("fetches platform balance", async () => {
    mockClient.get.mockResolvedValue({ balance_sats: 50000, commission_sats: 1000 });

    await run(["wallet", "platform-balance"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/wallet/platform-balance");
  });
});
