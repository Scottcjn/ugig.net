import type { Command } from "commander";
import ora from "ora";
import { createClient, handleError, type GlobalOpts } from "../helpers.js";
import {
  printTable,
  printDetail,
  printSuccess,
  type OutputOptions,
  relativeDate,
  truncate,
} from "../output.js";

export function registerDirectoryCommands(program: Command): void {
  const directory = program.command("directory").description("Manage directory listings");

  // ── List directory entries ─────────────────────────────────────

  directory
    .command("list")
    .description("List directory entries")
    .option("--search <query>", "Search by title/description")
    .option("--category <cat>", "Filter by category")
    .option("--tag <tag>", "Filter by tag")
    .option("--sort <sort>", "Sort: newest|popular|rating")
    .option("--page <n>", "Page number", "1")
    .action(
      async (cmdOpts: {
        search?: string;
        category?: string;
        tag?: string;
        sort?: string;
        page?: string;
      }) => {
        const opts = program.opts() as GlobalOpts;
        const spinner = opts.json ? null : ora("Fetching directory entries...").start();
        try {
          const client = createClient(opts);
          const result = await client.get<{
            listings: Record<string, unknown>[];
            total: number;
          }>("/api/directory", {
            search: cmdOpts.search,
            category: cmdOpts.category,
            tag: cmdOpts.tag,
            sort: cmdOpts.sort,
            page: cmdOpts.page,
          });
          spinner?.stop();
          printTable(
            [
              { header: "ID", key: "id", width: 10 },
              { header: "Title", key: "title", width: 30, transform: truncate(28) },
              { header: "URL", key: "url", width: 35, transform: truncate(33) },
              { header: "Category", key: "category", width: 15, transform: (v) => String(v || "—") },
              { header: "Score", key: "score", width: 8 },
              { header: "Created", key: "created_at", transform: relativeDate },
            ],
            result.listings,
            opts as OutputOptions,
          );
        } catch (err) {
          spinner?.fail("Failed");
          handleError(err, opts as OutputOptions);
        }
      },
    );

  // ── View directory entry detail ────────────────────────────────

  directory
    .command("view <id>")
    .description("View details of a directory entry")
    .action(async (id: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching directory entry...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<{
          listing: Record<string, unknown>;
        }>(`/api/directory/${id}`);
        spinner?.stop();
        printDetail(result.listing, opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ── Submit directory entry ─────────────────────────────────────

  directory
    .command("submit")
    .description("Submit a new directory entry")
    .requiredOption("--url <url>", "URL to submit")
    .option("--title <title>", "Entry title")
    .option("--description <text>", "Entry description")
    .option("--category <cat>", "Category")
    .option("--tags <tags>", "Comma-separated tags")
    .action(
      async (cmdOpts: {
        url: string;
        title?: string;
        description?: string;
        category?: string;
        tags?: string;
      }) => {
        const opts = program.opts() as GlobalOpts;
        const spinner = opts.json ? null : ora("Submitting directory entry...").start();
        try {
          const client = createClient(opts);

          const body: Record<string, unknown> = {
            url: cmdOpts.url,
          };
          if (cmdOpts.title) body.title = cmdOpts.title;
          if (cmdOpts.description) body.description = cmdOpts.description;
          if (cmdOpts.category) body.category = cmdOpts.category;
          if (cmdOpts.tags) body.tags = cmdOpts.tags.split(",").map((t) => t.trim());

          const result = await client.post<{
            listing: Record<string, unknown>;
          }>("/api/directory", body);
          spinner?.stop();
          printSuccess(
            `Directory entry submitted: ${(result.listing as any).id}`,
            opts as OutputOptions,
          );
          printDetail(result.listing, opts as OutputOptions);
        } catch (err) {
          spinner?.fail("Failed");
          handleError(err, opts as OutputOptions);
        }
      },
    );

  // ── Update directory entry ─────────────────────────────────────

  directory
    .command("update <id>")
    .description("Update a directory entry")
    .option("--url <url>", "URL")
    .option("--title <title>", "Entry title")
    .option("--description <text>", "Entry description")
    .option("--category <cat>", "Category")
    .option("--tags <tags>", "Comma-separated tags")
    .action(
      async (
        id: string,
        cmdOpts: {
          url?: string;
          title?: string;
          description?: string;
          category?: string;
          tags?: string;
        },
      ) => {
        const opts = program.opts() as GlobalOpts;
        const spinner = opts.json ? null : ora("Updating directory entry...").start();
        try {
          const client = createClient(opts);
          const body: Record<string, unknown> = {};
          if (cmdOpts.url) body.url = cmdOpts.url;
          if (cmdOpts.title) body.title = cmdOpts.title;
          if (cmdOpts.description) body.description = cmdOpts.description;
          if (cmdOpts.category) body.category = cmdOpts.category;
          if (cmdOpts.tags) body.tags = cmdOpts.tags.split(",").map((t) => t.trim());

          const result = await client.patch<{
            listing: Record<string, unknown>;
          }>(`/api/directory/${id}`, body);
          spinner?.stop();
          printSuccess(`Directory entry updated: ${id}`, opts as OutputOptions);
          printDetail(result.listing, opts as OutputOptions);
        } catch (err) {
          spinner?.fail("Failed");
          handleError(err, opts as OutputOptions);
        }
      },
    );

  // ── Delete directory entry ─────────────────────────────────────

  directory
    .command("delete <id>")
    .description("Delete a directory entry")
    .action(async (id: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Deleting directory entry...").start();
      try {
        const client = createClient(opts);
        await client.delete(`/api/directory/${id}`);
        spinner?.stop();
        printSuccess(`Directory entry deleted: ${id}`, opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ── Vote on directory entry ────────────────────────────────────

  directory
    .command("vote <id>")
    .description("Upvote a directory entry")
    .action(async (id: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Voting...").start();
      try {
        const client = createClient(opts);
        const result = await client.post<{
          upvotes: number;
          downvotes: number;
          score: number;
          user_vote: number | null;
        }>(`/api/directory/${id}/vote`, { vote_type: 1 });
        spinner?.stop();
        printSuccess(
          `Voted on entry ${id} (score: ${result.score})`,
          opts as OutputOptions,
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ── List comments ──────────────────────────────────────────────

  directory
    .command("comments <id>")
    .description("List comments on a directory entry")
    .action(async (id: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching comments...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<{
          comments: Record<string, unknown>[];
        }>(`/api/directory/${id}/comments`);
        spinner?.stop();
        printTable(
          [
            { header: "User", key: "author", width: 20, transform: (v: any) => v?.username || "—" },
            { header: "Comment", key: "text", width: 50, transform: (v) => truncate(48)(v || "—") },
            { header: "Date", key: "created_at", transform: relativeDate },
          ],
          result.comments,
          opts as OutputOptions,
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ── Add comment ────────────────────────────────────────────────

  directory
    .command("comment <id>")
    .description("Add a comment to a directory entry")
    .requiredOption("--text <text>", "Comment text")
    .action(
      async (
        id: string,
        cmdOpts: {
          text: string;
        },
      ) => {
        const opts = program.opts() as GlobalOpts;
        const spinner = opts.json ? null : ora("Adding comment...").start();
        try {
          const client = createClient(opts);
          const result = await client.post<{
            comment: Record<string, unknown>;
          }>(`/api/directory/${id}/comments`, { text: cmdOpts.text });
          spinner?.stop();
          printSuccess(`Comment added to entry ${id}`, opts as OutputOptions);
          printDetail(result.comment, opts as OutputOptions);
        } catch (err) {
          spinner?.fail("Failed");
          handleError(err, opts as OutputOptions);
        }
      },
    );

  // ── Fetch metadata from URL ────────────────────────────────────

  directory
    .command("fetch-meta <url>")
    .description("Preview metadata extracted from a URL")
    .action(async (url: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching metadata...").start();
      try {
        const client = createClient(opts);
        const result = await client.post<{
          metadata: Record<string, unknown>;
        }>("/api/directory/fetch-meta", { url });
        spinner?.stop();
        printDetail(result.metadata, opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ── My directory entries ───────────────────────────────────────

  directory
    .command("mine")
    .description("List your own directory entries")
    .action(async () => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching your directory entries...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<{
          listings: Record<string, unknown>[];
        }>("/api/directory/my");
        spinner?.stop();
        printTable(
          [
            { header: "ID", key: "id", width: 10 },
            { header: "Title", key: "title", width: 30, transform: truncate(28) },
            { header: "URL", key: "url", width: 35, transform: truncate(33) },
            { header: "Category", key: "category", width: 15, transform: (v) => String(v || "—") },
            { header: "Score", key: "score", width: 8 },
          ],
          result.listings,
          opts as OutputOptions,
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });
}
