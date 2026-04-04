import ora from "ora";
import { createClient, handleError } from "../helpers.js";
import { printTable, printDetail, printSuccess, relativeDate, truncate, } from "../output.js";
export function registerPromptsCommands(program) {
    const prompts = program.command("prompts").description("Manage prompt marketplace listings");
    // ── List prompts ───────────────────────────────────────────────
    prompts
        .command("list")
        .description("List active prompt listings")
        .option("--search <query>", "Search by title/description")
        .option("--category <cat>", "Filter by category")
        .option("--tag <tag>", "Filter by tag")
        .option("--sort <sort>", "Sort: newest|popular|rating|price_low|price_high")
        .option("--page <n>", "Page number", "1")
        .action(async (cmdOpts) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching prompts...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/prompts", {
                search: cmdOpts.search,
                category: cmdOpts.category,
                tag: cmdOpts.tag,
                sort: cmdOpts.sort,
                page: cmdOpts.page,
            });
            spinner?.stop();
            printTable([
                { header: "Slug", key: "slug", width: 25, transform: truncate(23) },
                { header: "Title", key: "title", width: 30, transform: truncate(28) },
                { header: "Price", key: "price_sats", width: 10, transform: (v) => `${v} sats` },
                { header: "Rating", key: "rating_avg", width: 8 },
                { header: "Downloads", key: "downloads_count", width: 10 },
                { header: "Created", key: "created_at", transform: relativeDate },
            ], result.listings, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── View prompt detail ─────────────────────────────────────────
    prompts
        .command("view <slug>")
        .description("View details of a prompt listing")
        .action(async (slug) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching prompt...").start();
        try {
            const client = createClient(opts);
            const result = await client.get(`/api/prompts/${slug}`);
            spinner?.stop();
            printDetail(result.listing, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Create prompt listing ──────────────────────────────────────
    prompts
        .command("create")
        .description("Create a new prompt listing")
        .requiredOption("--title <title>", "Prompt title")
        .requiredOption("--description <text>", "Prompt description")
        .option("--price <sats>", "Price in sats (0 = free)", "0")
        .option("--category <cat>", "Category")
        .option("--tags <tags>", "Comma-separated tags")
        .option("--tagline <text>", "Short tagline")
        .option("--status <status>", "Status: draft|active", "active")
        .action(async (cmdOpts) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Creating prompt listing...").start();
        try {
            const client = createClient(opts);
            const body = {
                title: cmdOpts.title,
                description: cmdOpts.description,
                price_sats: parseInt(cmdOpts.price || "0", 10),
                status: cmdOpts.status || "active",
            };
            if (cmdOpts.category)
                body.category = cmdOpts.category;
            if (cmdOpts.tagline)
                body.tagline = cmdOpts.tagline;
            if (cmdOpts.tags)
                body.tags = cmdOpts.tags.split(",").map((t) => t.trim());
            const result = await client.post("/api/prompts", body);
            spinner?.stop();
            printSuccess(`Prompt listing created: ${result.listing.slug}`, opts);
            printDetail(result.listing, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Update prompt listing ──────────────────────────────────────
    prompts
        .command("update <slug>")
        .description("Update a prompt listing")
        .option("--title <title>", "Prompt title")
        .option("--description <text>", "Prompt description")
        .option("--price <sats>", "Price in sats")
        .option("--category <cat>", "Category")
        .option("--tags <tags>", "Comma-separated tags")
        .option("--tagline <text>", "Short tagline")
        .option("--status <status>", "Status: draft|active")
        .action(async (slug, cmdOpts) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Updating prompt listing...").start();
        try {
            const client = createClient(opts);
            const body = {};
            if (cmdOpts.title)
                body.title = cmdOpts.title;
            if (cmdOpts.description)
                body.description = cmdOpts.description;
            if (cmdOpts.price)
                body.price_sats = parseInt(cmdOpts.price, 10);
            if (cmdOpts.category)
                body.category = cmdOpts.category;
            if (cmdOpts.tagline)
                body.tagline = cmdOpts.tagline;
            if (cmdOpts.tags)
                body.tags = cmdOpts.tags.split(",").map((t) => t.trim());
            if (cmdOpts.status)
                body.status = cmdOpts.status;
            const result = await client.patch(`/api/prompts/${slug}`, body);
            spinner?.stop();
            printSuccess(`Prompt listing updated: ${slug}`, opts);
            printDetail(result.listing, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Delete prompt listing ──────────────────────────────────────
    prompts
        .command("delete <slug>")
        .description("Archive (soft-delete) a prompt listing")
        .action(async (slug) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Deleting prompt listing...").start();
        try {
            const client = createClient(opts);
            await client.delete(`/api/prompts/${slug}`);
            spinner?.stop();
            printSuccess(`Prompt listing archived: ${slug}`, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── My prompt listings ─────────────────────────────────────────
    prompts
        .command("mine")
        .description("List your own prompt listings")
        .action(async () => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching your prompts...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/prompts/my");
            spinner?.stop();
            printTable([
                { header: "Slug", key: "slug", width: 25, transform: truncate(23) },
                { header: "Title", key: "title", width: 30, transform: truncate(28) },
                { header: "Status", key: "status", width: 10 },
                { header: "Price", key: "price_sats", width: 10, transform: (v) => `${v} sats` },
                { header: "Downloads", key: "downloads_count", width: 10 },
            ], result.listings, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Vote (upvote) ──────────────────────────────────────────────
    prompts
        .command("vote <slug>")
        .description("Upvote a prompt listing")
        .action(async (slug) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Voting...").start();
        try {
            const client = createClient(opts);
            const result = await client.post(`/api/prompts/${slug}/vote`, { vote_type: 1 });
            spinner?.stop();
            printSuccess(`Voted on ${slug} (score: ${result.score})`, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Unvote (remove vote) ───────────────────────────────────────
    prompts
        .command("unvote <slug>")
        .description("Remove your vote from a prompt listing")
        .action(async (slug) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Removing vote...").start();
        try {
            const client = createClient(opts);
            const result = await client.post(`/api/prompts/${slug}/vote`, { vote_type: 1 });
            spinner?.stop();
            printSuccess(`Vote removed from ${slug} (score: ${result.score})`, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Purchase ───────────────────────────────────────────────────
    prompts
        .command("purchase <slug>")
        .description("Purchase a prompt listing")
        .action(async (slug) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Purchasing prompt...").start();
        try {
            const client = createClient(opts);
            const result = await client.post(`/api/prompts/${slug}/purchase`, {});
            spinner?.stop();
            printSuccess(`Prompt purchased! (balance: ${result.new_balance} sats)`, opts);
            if (!opts.json) {
                console.log(`  Purchase ID: ${result.purchase_id}`);
                console.log(`  Fee: ${result.fee_sats} sats (${(result.fee_rate * 100).toFixed(1)}%)`);
            }
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Library (purchased prompts) ────────────────────────────────
    prompts
        .command("library")
        .description("List your purchased prompts")
        .action(async () => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching your prompt library...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/prompts/library");
            spinner?.stop();
            if (opts.json) {
                console.log(JSON.stringify(result, null, 2));
            }
            else {
                const rows = (result.purchases || []).map((p) => ({
                    slug: p.listing?.slug,
                    title: p.listing?.title,
                    price_sats: p.price_sats,
                    purchased_at: p.created_at,
                }));
                printTable([
                    { header: "Slug", key: "slug", width: 25, transform: truncate(23) },
                    { header: "Title", key: "title", width: 30, transform: truncate(28) },
                    { header: "Price", key: "price_sats", width: 10, transform: (v) => `${v} sats` },
                    { header: "Purchased", key: "purchased_at", transform: relativeDate },
                ], rows, opts);
            }
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── List reviews ───────────────────────────────────────────────
    prompts
        .command("reviews <slug>")
        .description("List reviews for a prompt")
        .action(async (slug) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching reviews...").start();
        try {
            const client = createClient(opts);
            const result = await client.get(`/api/prompts/${slug}/reviews`);
            spinner?.stop();
            printTable([
                { header: "User", key: "reviewer", width: 20, transform: (v) => v?.username || "—" },
                { header: "Rating", key: "rating", width: 8, transform: (v) => "★".repeat(Number(v)) },
                { header: "Comment", key: "comment", width: 40, transform: (v) => truncate(38)(v || "—") },
                { header: "Date", key: "created_at", transform: relativeDate },
            ], result.reviews, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Submit review ──────────────────────────────────────────────
    prompts
        .command("review <slug>")
        .description("Submit a review for a prompt (must have purchased)")
        .requiredOption("--rating <n>", "Rating (1-5)")
        .option("--comment <text>", "Review comment")
        .action(async (slug, cmdOpts) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Submitting review...").start();
        try {
            const client = createClient(opts);
            const body = {
                rating: parseInt(cmdOpts.rating, 10),
            };
            if (cmdOpts.comment)
                body.comment = cmdOpts.comment;
            const result = await client.post(`/api/prompts/${slug}/reviews`, body);
            spinner?.stop();
            printSuccess(`Review submitted for ${slug}`, opts);
            printDetail(result.review, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Download prompt ────────────────────────────────────────────
    prompts
        .command("download <slug>")
        .description("Download a purchased prompt")
        .action(async (slug) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Downloading prompt...").start();
        try {
            const client = createClient(opts);
            const result = await client.post(`/api/prompts/${slug}/download`, {});
            spinner?.stop();
            if (opts.json) {
                console.log(JSON.stringify(result, null, 2));
            }
            else {
                console.log(`\n📝 ${result.title}`);
                console.log(`\n${result.content}`);
                console.log();
            }
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=prompts.js.map