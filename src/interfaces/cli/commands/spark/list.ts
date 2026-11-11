/**
 * Declarative CLI command definition for `modie spark list` (or `modie sparks`).
 * Enforces RULE-25 and RULE-27.
 */

import { z } from "zod";
import { readSparks, type SparkEntry } from "../../../../core/index.ts";
import {
  defineCommand,
  formatAlignedTable,
  type CliCommandDefinition,
} from "../../framework/index.ts";

export const sparkListSchema = z.object({});

export type SparkListInput = z.infer<typeof sparkListSchema>;

export interface SparkListResultPayload {
  sparks: SparkEntry[];
  mintedCount: number;
  filepath: string;
}

export function renderSparkTable(sparks: SparkEntry[]): string {
  return formatAlignedTable(sparks, [
    {
      header: "HANDLE",
      minWidth: 8,
      value: (s) => (s.handle ? `[${s.handle}]` : "-"),
    },
    {
      header: "TITLE",
      separatorWidth: 40,
      value: (s) => s.title,
    },
  ]);
}

export const sparkListCommand: CliCommandDefinition<
  Record<string, any>,
  SparkListResultPayload,
  typeof sparkListSchema
> = defineCommand({
  id: "spark_list",
  namespace: "spark",
  name: "list",
  aliases: ["ls"],
  rootAliases: ["sparks"],
  summaryUsage: "[options]",
  usage: "modie spark list",
  description: "List active sparks in the repository",
  helpUsage: "modie spark list --help",
  schema: sparkListSchema,
  execute: async (_input, context): Promise<SparkListResultPayload> => {
    const result = await readSparks(context.cwd);
    return {
      sparks: result.sparks,
      mintedCount: result.mintedCount,
      filepath: result.filepath,
    };
  },
  render: (result, context) => {
    if (result.mintedCount > 0) {
      context.stderr(
        `✓ Minted ${result.mintedCount} new spark handle(s) in-place\n`,
      );
    }

    if (result.sparks.length === 0) {
      context.stderr("No active sparks found. Add one with 'modie spark add <title>'.");
      return;
    }

    // Machine-readable handles to stdout per RULE-27
    context.stdout(result.sparks.map((s) => s.handle ?? "").filter(Boolean).join("\n"));
    // Human-formatted aligned table to stderr
    context.stderr(renderSparkTable(result.sparks));
  },
  renderJson: (result, context) => {
    if (result.mintedCount > 0) {
      context.stderr(
        `✓ Minted ${result.mintedCount} new spark handle(s) in-place\n`,
      );
    }
    context.stdout(JSON.stringify(result.sparks, null, 2));
  },
});

