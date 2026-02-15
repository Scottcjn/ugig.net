import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerDidCommands } from "./did.js";

vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
  })),
}));

const mockClient = {
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
};

vi.mock("../helpers.js", () => ({
  createClient: () => mockClient,
  createUnauthClient: () => mockClient,
  handleError: vi.fn(),
  getBaseUrl: (v?: string) => v || "http://localhost",
  getApiKey: (v?: string) => v || "test-key",
}));

vi.mock("../output.js", () => ({
  printDetail: vi.fn(),
  printSuccess: vi.fn(),
  printError: vi.fn(),
}));

function createProgram(): Command {
  const program = new Command();
  program.option("--json", "JSON output");
  program.option("--api-key <key>", "API key");
  program.option("--base-url <url>", "Base URL");
  program.exitOverride();
  registerDidCommands(program);
  return program;
}

describe("ugig did", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generate", () => {
    it("generates a did:key without auth", async () => {
      const program = createProgram();
      const logs: string[] = [];
      const origLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(" "));

      await program.parseAsync(["node", "ugig", "did", "generate"]);

      console.log = origLog;
      const output = logs.join("\n");
      expect(output).toContain("did:key:z");
      expect(output).toContain("Public Key:");
    });

    it("outputs JSON when --json flag is set", async () => {
      const program = createProgram();
      const logs: string[] = [];
      const origLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(" "));

      await program.parseAsync(["node", "ugig", "--json", "did", "generate"]);

      console.log = origLog;
      const parsed = JSON.parse(logs.join(""));
      expect(parsed.did).toMatch(/^did:key:z/);
      expect(parsed.public_key).toBeDefined();
    });

    it("generates unique DIDs each time", async () => {
      const program = createProgram();
      const dids: string[] = [];
      const origLog = console.log;
      console.log = (...args: unknown[]) => {
        const line = args.join(" ");
        const match = line.match(/did:key:z\S+/);
        if (match) dids.push(match[0]);
      };

      await program.parseAsync(["node", "ugig", "did", "generate"]);
      const program2 = createProgram();
      await program2.parseAsync(["node", "ugig", "did", "generate"]);

      console.log = origLog;
      expect(dids.length).toBe(2);
      expect(dids[0]).not.toBe(dids[1]);
    });
  });

  describe("claim", () => {
    it("generates and stores DID on profile", async () => {
      mockClient.get.mockResolvedValue({
        profile: { username: "testuser", did: null },
      });
      mockClient.put.mockResolvedValue({ profile: {} });

      const program = createProgram();
      await program.parseAsync(["node", "ugig", "did", "claim"]);

      expect(mockClient.put).toHaveBeenCalledWith(
        "/api/profile",
        expect.objectContaining({
          did: expect.stringMatching(/^did:key:z/),
        })
      );
    });

    it("refuses to overwrite existing DID without --force", async () => {
      mockClient.get.mockResolvedValue({
        profile: { username: "testuser", did: "did:key:z6MkExisting" },
      });

      const program = createProgram();
      await program.parseAsync(["node", "ugig", "did", "claim"]);

      expect(mockClient.put).not.toHaveBeenCalled();
    });

    it("overwrites existing DID with --force", async () => {
      mockClient.get.mockResolvedValue({
        profile: { username: "testuser", did: "did:key:z6MkExisting" },
      });
      mockClient.put.mockResolvedValue({ profile: {} });

      const program = createProgram();
      await program.parseAsync(["node", "ugig", "did", "claim", "--force"]);

      expect(mockClient.put).toHaveBeenCalledWith(
        "/api/profile",
        expect.objectContaining({
          did: expect.stringMatching(/^did:key:z/),
        })
      );
    });
  });

  describe("show", () => {
    it("shows current DID", async () => {
      mockClient.get.mockResolvedValue({
        profile: { did: "did:key:z6MkTest123" },
      });

      const program = createProgram();
      const logs: string[] = [];
      const origLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(" "));

      await program.parseAsync(["node", "ugig", "did", "show"]);

      console.log = origLog;
      expect(logs.join("\n")).toContain("did:key:z6MkTest123");
    });

    it("shows message when no DID set", async () => {
      mockClient.get.mockResolvedValue({
        profile: { did: null },
      });

      const program = createProgram();
      const logs: string[] = [];
      const origLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(" "));

      await program.parseAsync(["node", "ugig", "did", "show"]);

      console.log = origLog;
      expect(logs.join("\n")).toContain("No DID set");
    });
  });
});
