import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerWebhooksCommands } from "./webhooks.js";

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
  registerWebhooksCommands(program);
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

describe("webhooks list", () => {
  it("lists webhooks", async () => {
    mockClient.get.mockResolvedValue({ data: [{ id: "wh-1", url: "https://example.com/hook", events: ["gig.update"], active: true, created_at: new Date().toISOString() }] });

    await run(["webhooks", "list"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/webhooks");
  });
});

describe("webhooks create", () => {
  it("creates a webhook", async () => {
    mockClient.post.mockResolvedValue({ data: { id: "wh-new", secret: "sec123" } });

    await run(["webhooks", "create", "--url", "https://example.com/hook", "--events", "gig.update,message.new"]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/webhooks", {
      url: "https://example.com/hook",
      events: ["gig.update", "message.new"],
      active: true,
    });
  });

  it("handles errors", async () => {
    const { handleError } = await import("../helpers.js");
    mockClient.post.mockRejectedValue(new Error("fail"));

    await run(["webhooks", "create", "--url", "https://bad.com", "--events", "x"]);

    expect(handleError).toHaveBeenCalled();
  });
});

describe("webhooks update", () => {
  it("updates a webhook", async () => {
    mockClient.put.mockResolvedValue({});

    await run(["webhooks", "update", "wh-1", "--url", "https://new.com"]);

    expect(mockClient.put).toHaveBeenCalledWith("/api/webhooks/wh-1", { url: "https://new.com" });
  });
});

describe("webhooks delete", () => {
  it("deletes a webhook", async () => {
    mockClient.delete.mockResolvedValue({});

    await run(["webhooks", "delete", "wh-1"]);

    expect(mockClient.delete).toHaveBeenCalledWith("/api/webhooks/wh-1");
  });
});
