import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerVerificationCommands } from "./verification.js";

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
  registerVerificationCommands(program);
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

describe("verification status", () => {
  it("checks verification status", async () => {
    mockClient.get.mockResolvedValue({
      verified: true,
      verified_at: "2024-01-01T00:00:00Z",
      verification_type: "manual",
      latest_request: null,
      auto_check: { eligible: true },
    });

    await run(["verification", "status"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/verification/status");
  });

  it("handles errors", async () => {
    const { handleError } = await import("../helpers.js");
    mockClient.get.mockRejectedValue(new Error("fail"));

    await run(["verification", "status"]);

    expect(handleError).toHaveBeenCalled();
  });
});

describe("verification request", () => {
  it("submits a verification request", async () => {
    mockClient.post.mockResolvedValue({ request: { id: "req-1", status: "pending" } });

    await run(["verification", "request", "--evidence", "https://github.com/me"]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/verification/request", { evidence: "https://github.com/me" });
  });
});
