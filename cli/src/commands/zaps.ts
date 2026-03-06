import type { Command } from "commander";
import ora from "ora";
import { createClient, handleError, type GlobalOpts } from "../helpers.js";
import { printSuccess, printDetail, type OutputOptions } from "../output.js";

export function registerZapsCommands(program: Command): void {
  program
    .command("zap <username> <amount>")
    .description("Zap sats to a user")
    .option("--target-type <type>", "Target type (post, gig, comment, profile)", "profile")
    .option("--target-id <id>", "Target ID")
    .option("--note <text>", "Optional note")
    .action(async (username: string, amount: string, cmdOpts: { targetType: string; targetId?: string; note?: string }) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Sending zap...").start();
      try {
        const client = createClient(opts);
        const cleanUsername = username.replace(/^@/, "");
        const profile = await client.get<{ profile: { id: string } }>(`/api/users/${encodeURIComponent(cleanUsername)}`);
        const recipientId = profile.profile.id;
        const result = await client.post<{ ok: boolean; new_balance: number; fee_sats: number }>("/api/wallet/zap", {
          recipient_id: recipientId,
          amount_sats: parseInt(amount, 10),
          target_type: cmdOpts.targetType,
          target_id: cmdOpts.targetId || recipientId,
          note: cmdOpts.note,
        });
        spinner?.stop();
        printSuccess(`Zapped ${amount} sats to @${cleanUsername} (fee: ${result.fee_sats} sats). New balance: ${result.new_balance} sats.`, opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  program
    .command("zap-stats <user-id>")
    .description("Get zap stats for a user")
    .action(async (userId: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching zap stats...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<{ total_sats_received: number; zap_count: number }>("/api/zaps/stats", { user_id: userId });
        spinner?.stop();
        printDetail(
          [
            { label: "Total Sats Received", key: "total_sats_received" },
            { label: "Zap Count", key: "zap_count" },
          ],
          result as unknown as Record<string, unknown>,
          opts as OutputOptions,
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });
}
