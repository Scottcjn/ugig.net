import type { Command } from "commander";
import ora from "ora";
import { createClient, handleError, type GlobalOpts } from "../helpers.js";
import { printTable, printDetail, printSuccess, type OutputOptions, relativeDate, truncate } from "../output.js";

export function registerPortfolioCommands(program: Command): void {
  const portfolio = program.command("portfolio").description("Manage portfolio items");

  portfolio
    .command("list [user-id]")
    .description("List portfolio items for a user")
    .action(async (userId: string | undefined) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching portfolio...").start();
      try {
        const client = createClient(opts);
        let targetUserId = userId;
        if (!targetUserId) {
          const profile = await client.get<{ profile: { id: string } }>("/api/profile");
          targetUserId = profile.profile.id;
        }
        const result = await client.get<{ portfolio_items: Record<string, unknown>[] }>("/api/portfolio", { user_id: targetUserId });
        spinner?.stop();
        printTable(
          [
            { header: "ID", key: "id", width: 10, transform: (v) => String(v).slice(0, 8) },
            { header: "Title", key: "title", width: 30, transform: truncate(28) },
            { header: "URL", key: "url", width: 30, transform: truncate(28) },
            { header: "Created", key: "created_at", transform: relativeDate },
          ],
          result.portfolio_items,
          opts as OutputOptions,
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  portfolio
    .command("add")
    .description("Add a portfolio item")
    .requiredOption("--title <title>", "Item title")
    .option("--description <text>", "Item description")
    .option("--url <url>", "Project URL")
    .option("--image-url <url>", "Image URL")
    .option("--gig-id <id>", "Related gig ID")
    .action(async (cmdOpts: { title: string; description?: string; url?: string; imageUrl?: string; gigId?: string }) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Adding portfolio item...").start();
      try {
        const client = createClient(opts);
        const result = await client.post<{ portfolio_item: Record<string, unknown> }>("/api/portfolio", {
          title: cmdOpts.title,
          description: cmdOpts.description,
          url: cmdOpts.url,
          image_url: cmdOpts.imageUrl,
          gig_id: cmdOpts.gigId,
        });
        spinner?.stop();
        printSuccess(`Portfolio item added: ${(result.portfolio_item as Record<string, unknown>).id}`, opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  portfolio
    .command("update <id>")
    .description("Update a portfolio item")
    .option("--title <title>", "Item title")
    .option("--description <text>", "Item description")
    .option("--url <url>", "Project URL")
    .option("--image-url <url>", "Image URL")
    .option("--gig-id <id>", "Related gig ID")
    .action(async (id: string, cmdOpts: { title?: string; description?: string; url?: string; imageUrl?: string; gigId?: string }) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Updating portfolio item...").start();
      try {
        const client = createClient(opts);
        const body: Record<string, unknown> = {};
        if (cmdOpts.title) body.title = cmdOpts.title;
        if (cmdOpts.description) body.description = cmdOpts.description;
        if (cmdOpts.url) body.url = cmdOpts.url;
        if (cmdOpts.imageUrl) body.image_url = cmdOpts.imageUrl;
        if (cmdOpts.gigId) body.gig_id = cmdOpts.gigId;
        await client.put<{ portfolio_item: Record<string, unknown> }>(`/api/portfolio/${id}`, body);
        spinner?.stop();
        printSuccess(`Portfolio item ${id} updated.`, opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  portfolio
    .command("remove <id>")
    .description("Remove a portfolio item")
    .action(async (id: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Removing portfolio item...").start();
      try {
        const client = createClient(opts);
        await client.delete(`/api/portfolio/${id}`);
        spinner?.stop();
        printSuccess(`Portfolio item ${id} removed.`, opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });
}
