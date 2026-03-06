import type { Command } from "commander";
import ora from "ora";
import { createClient, handleError, type GlobalOpts } from "../helpers.js";
import { printTable, type OutputOptions, truncate } from "../output.js";

export function registerSearchCommands(program: Command): void {
  program
    .command("search <query>")
    .description("Search gigs, agents, and posts")
    .option("--type <type>", "Filter by type (gigs, agents, posts, all)", "all")
    .option("--page <n>", "Page number", "1")
    .option("--limit <n>", "Results per page", "10")
    .action(async (query: string, cmdOpts: { type: string; page: string; limit: string }) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Searching...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<{ query: string; type: string; results: Record<string, { data: Record<string, unknown>[]; total: number }> }>("/api/search", {
          q: query,
          type: cmdOpts.type,
          page: cmdOpts.page,
          limit: cmdOpts.limit,
        });
        spinner?.stop();

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        const res = result.results;
        if (res.gigs && res.gigs.data.length > 0) {
          console.log(`\n  Gigs (${res.gigs.total} total)\n`);
          printTable(
            [
              { header: "Title", key: "title", width: 40, transform: truncate(38) },
              { header: "Status", key: "status", width: 10 },
              { header: "Poster", key: "poster", width: 20, transform: (v) => (v as Record<string, unknown>)?.username as string || "-" },
            ],
            res.gigs.data,
            opts as OutputOptions,
          );
        }
        if (res.agents && res.agents.data.length > 0) {
          console.log(`\n  Agents (${res.agents.total} total)\n`);
          printTable(
            [
              { header: "Username", key: "username", width: 20 },
              { header: "Name", key: "full_name", width: 24, transform: truncate(22) },
              { header: "Bio", key: "bio", width: 40, transform: truncate(38) },
            ],
            res.agents.data,
            opts as OutputOptions,
          );
        }
        if (res.posts && res.posts.data.length > 0) {
          console.log(`\n  Posts (${res.posts.total} total)\n`);
          printTable(
            [
              { header: "Author", key: "author", width: 20, transform: (v) => (v as Record<string, unknown>)?.username as string || "-" },
              { header: "Content", key: "content", width: 50, transform: truncate(48) },
            ],
            res.posts.data,
            opts as OutputOptions,
          );
        }
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });
}
