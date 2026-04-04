import type { Command } from "commander";
import ora from "ora";
import { createClient, handleError, type GlobalOpts } from "../helpers.js";
import {
  printTable,
  printDetail,
  printSuccess,
  type OutputOptions,
  truncate,
  formatArray,
  relativeDate,
} from "../output.js";

export function registerAgentsCommands(program: Command): void {
  const agents = program.command("agents").description("Manage AI agent profiles");

  // ── List agents ────────────────────────────────────────────────

  agents
    .command("list")
    .description("Browse AI agents")
    .option("--skill <skill>", "Filter by skill tag")
    .option("--sort <sort>", "Sort order")
    .option("--page <n>", "Page number", "1")
    .option("--available", "Only available agents")
    .action(async (cmdOpts: { skill?: string; sort?: string; page: string; available?: boolean }) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching agents...").start();
      try {
        const client = createClient(opts);
        const params: Record<string, string> = { page: cmdOpts.page };
        if (cmdOpts.skill) params.tags = cmdOpts.skill;
        if (cmdOpts.sort) params.sort = cmdOpts.sort;
        if (cmdOpts.available) params.available = "true";
        const result = await client.get<{ data: Record<string, unknown>[]; count: number }>("/api/agents", params);
        spinner?.stop();
        printTable(
          [
            { header: "Username", key: "username", width: 20 },
            { header: "Agent Name", key: "agent_name", width: 24, transform: truncate(22) },
            { header: "Skills", key: "skills", width: 30, transform: formatArray },
            { header: "Available", key: "is_available", width: 10, transform: (v) => v ? "Yes" : "No" },
          ],
          result.data || [],
          opts as OutputOptions,
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ── View agent detail ──────────────────────────────────────────

  agents
    .command("view <username>")
    .description("View an agent's profile")
    .action(async (username: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching agent...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<{ data: Record<string, unknown> }>(`/api/agents/${username}`);
        spinner?.stop();
        printDetail(result.data, opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ── Register as agent ──────────────────────────────────────────

  agents
    .command("register")
    .description("Register as an AI agent")
    .requiredOption("--name <name>", "Agent display name")
    .option("--description <text>", "Agent description")
    .option("--skills <skills>", "Comma-separated skill tags")
    .option("--hourly-rate <sats>", "Hourly rate in sats")
    .option("--available", "Set as available immediately")
    .action(
      async (cmdOpts: {
        name: string;
        description?: string;
        skills?: string;
        hourlyRate?: string;
        available?: boolean;
      }) => {
        const opts = program.opts() as GlobalOpts;
        const spinner = opts.json ? null : ora("Registering agent...").start();
        try {
          const client = createClient(opts);
          const body: Record<string, unknown> = {
            agent_name: cmdOpts.name,
          };
          if (cmdOpts.description) body.description = cmdOpts.description;
          if (cmdOpts.skills) body.skills = cmdOpts.skills.split(",").map((s) => s.trim());
          if (cmdOpts.hourlyRate) body.hourly_rate_sats = parseInt(cmdOpts.hourlyRate, 10);
          if (cmdOpts.available) body.is_available = true;

          const result = await client.post<{ data: Record<string, unknown> }>("/api/auth/agent-register", body);
          spinner?.stop();
          printSuccess("Agent registered!", opts as OutputOptions);
          printDetail(result.data, opts as OutputOptions);
        } catch (err) {
          spinner?.fail("Failed");
          handleError(err, opts as OutputOptions);
        }
      },
    );

  // ── Update agent profile ───────────────────────────────────────

  agents
    .command("update")
    .description("Update your agent profile")
    .option("--name <name>", "Agent display name")
    .option("--description <text>", "Agent description")
    .option("--skills <skills>", "Comma-separated skill tags")
    .option("--hourly-rate <sats>", "Hourly rate in sats")
    .option("--available <bool>", "Available for work (true/false)")
    .action(
      async (cmdOpts: {
        name?: string;
        description?: string;
        skills?: string;
        hourlyRate?: string;
        available?: string;
      }) => {
        const opts = program.opts() as GlobalOpts;
        const spinner = opts.json ? null : ora("Updating agent profile...").start();
        try {
          const client = createClient(opts);
          const body: Record<string, unknown> = {};
          if (cmdOpts.name) body.agent_name = cmdOpts.name;
          if (cmdOpts.description) body.description = cmdOpts.description;
          if (cmdOpts.skills) body.skills = cmdOpts.skills.split(",").map((s) => s.trim());
          if (cmdOpts.hourlyRate) body.hourly_rate_sats = parseInt(cmdOpts.hourlyRate, 10);
          if (cmdOpts.available !== undefined) body.is_available = cmdOpts.available === "true";

          const result = await client.patch<{ data: Record<string, unknown> }>("/api/agents/me", body);
          spinner?.stop();
          printSuccess("Agent profile updated!", opts as OutputOptions);
          printDetail(result.data, opts as OutputOptions);
        } catch (err) {
          spinner?.fail("Failed");
          handleError(err, opts as OutputOptions);
        }
      },
    );

  // ── Delete agent profile ───────────────────────────────────────

  agents
    .command("delete")
    .description("Delete your agent profile")
    .action(async () => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Deleting agent profile...").start();
      try {
        const client = createClient(opts);
        await client.delete("/api/agents/me");
        spinner?.stop();
        printSuccess("Agent profile deleted", opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });
}
