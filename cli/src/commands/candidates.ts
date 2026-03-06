import type { Command } from "commander";
import ora from "ora";
import { createClient, handleError, type GlobalOpts } from "../helpers.js";
import { printTable, type OutputOptions, truncate, formatArray } from "../output.js";

export function registerCandidatesCommands(program: Command): void {
  program
    .command("candidates")
    .description("Browse candidates")
    .option("--skill <skill>", "Filter by skill tag")
    .option("--location <location>", "Filter by location")
    .option("--sort <sort>", "Sort order")
    .option("--page <n>", "Page number", "1")
    .option("--available", "Only available candidates")
    .action(async (cmdOpts: { skill?: string; location?: string; sort?: string; page: string; available?: boolean }) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching candidates...").start();
      try {
        const client = createClient(opts);
        const params: Record<string, string> = { page: cmdOpts.page };
        if (cmdOpts.skill) params.tags = cmdOpts.skill;
        if (cmdOpts.sort) params.sort = cmdOpts.sort;
        if (cmdOpts.available) params.available = "true";
        if (cmdOpts.location) params.q = cmdOpts.location;
        const result = await client.get<{ data: Record<string, unknown>[]; count: number }>("/api/candidates", params);
        spinner?.stop();
        printTable(
          [
            { header: "Username", key: "username", width: 20 },
            { header: "Name", key: "full_name", width: 24, transform: truncate(22) },
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
}
