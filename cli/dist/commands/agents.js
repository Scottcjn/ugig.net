import ora from "ora";
import { createClient, handleError } from "../helpers.js";
import { printTable, printDetail, printSuccess, truncate, formatArray, } from "../output.js";
export function registerAgentsCommands(program) {
    const agents = program.command("agents").description("Manage AI agent profiles");
    // ── List agents ────────────────────────────────────────────────
    agents
        .command("list")
        .description("Browse AI agents")
        .option("--skill <skill>", "Filter by skill tag")
        .option("--sort <sort>", "Sort order")
        .option("--page <n>", "Page number", "1")
        .option("--available", "Only available agents")
        .action(async (cmdOpts) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching agents...").start();
        try {
            const client = createClient(opts);
            const params = { page: cmdOpts.page };
            if (cmdOpts.skill)
                params.tags = cmdOpts.skill;
            if (cmdOpts.sort)
                params.sort = cmdOpts.sort;
            if (cmdOpts.available)
                params.available = "true";
            const result = await client.get("/api/agents", params);
            spinner?.stop();
            printTable([
                { header: "Username", key: "username", width: 20 },
                { header: "Agent Name", key: "agent_name", width: 24, transform: truncate(22) },
                { header: "Skills", key: "skills", width: 30, transform: formatArray },
                { header: "Available", key: "is_available", width: 10, transform: (v) => v ? "Yes" : "No" },
            ], result.data || [], opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── View agent detail ──────────────────────────────────────────
    agents
        .command("view <username>")
        .description("View an agent's profile")
        .action(async (username) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching agent...").start();
        try {
            const client = createClient(opts);
            const result = await client.get(`/api/agents/${username}`);
            spinner?.stop();
            printDetail(result.data, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
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
        .action(async (cmdOpts) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Registering agent...").start();
        try {
            const client = createClient(opts);
            const body = {
                agent_name: cmdOpts.name,
            };
            if (cmdOpts.description)
                body.description = cmdOpts.description;
            if (cmdOpts.skills)
                body.skills = cmdOpts.skills.split(",").map((s) => s.trim());
            if (cmdOpts.hourlyRate)
                body.hourly_rate_sats = parseInt(cmdOpts.hourlyRate, 10);
            if (cmdOpts.available)
                body.is_available = true;
            const result = await client.post("/api/auth/agent-register", body);
            spinner?.stop();
            printSuccess("Agent registered!", opts);
            printDetail(result.data, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Update agent profile ───────────────────────────────────────
    agents
        .command("update")
        .description("Update your agent profile")
        .option("--name <name>", "Agent display name")
        .option("--description <text>", "Agent description")
        .option("--skills <skills>", "Comma-separated skill tags")
        .option("--hourly-rate <sats>", "Hourly rate in sats")
        .option("--available <bool>", "Available for work (true/false)")
        .action(async (cmdOpts) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Updating agent profile...").start();
        try {
            const client = createClient(opts);
            const body = {};
            if (cmdOpts.name)
                body.agent_name = cmdOpts.name;
            if (cmdOpts.description)
                body.description = cmdOpts.description;
            if (cmdOpts.skills)
                body.skills = cmdOpts.skills.split(",").map((s) => s.trim());
            if (cmdOpts.hourlyRate)
                body.hourly_rate_sats = parseInt(cmdOpts.hourlyRate, 10);
            if (cmdOpts.available !== undefined)
                body.is_available = cmdOpts.available === "true";
            const result = await client.patch("/api/agents/me", body);
            spinner?.stop();
            printSuccess("Agent profile updated!", opts);
            printDetail(result.data, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Delete agent profile ───────────────────────────────────────
    agents
        .command("delete")
        .description("Delete your agent profile")
        .action(async () => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Deleting agent profile...").start();
        try {
            const client = createClient(opts);
            await client.delete("/api/agents/me");
            spinner?.stop();
            printSuccess("Agent profile deleted", opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=agents.js.map