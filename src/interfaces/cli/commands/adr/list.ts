/**
 * Declarative CLI command definition for `modie adr list [options]`.
 * Consumes public core API per RULE-25, honors ancestral scope traversal per RULE-9,
 * and enforces stdout/stderr separation per RULE-27.
 */

import { z } from "zod";
import { listAdrs, type ListedArtifact } from "../../../../core/index.ts";
import {
  createCommandHandler,
  defineCommand,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export const adrListSchema = z.object({
  scope: z
    .string()
    .optional()
    .describe(
      "Filter ADRs by ancestral scope traversal from target path up to workspace root",
    ),
});

export type AdrListInput = z.infer<typeof adrListSchema>;

export interface AdrListFlags {
  scope?: string;
  json?: boolean;
}

/**
 * Formats listed ADR artifacts into a human-readable aligned table.
 */
export function renderAdrListTable(adrs: ListedArtifact[]): string {
  if (adrs.length === 0) {
    return "";
  }

  const tagColWidth = Math.max(8, ...adrs.map((a) => a.tag.length));
  const titleColWidth = Math.max(12, ...adrs.map((a) => a.title.length));
  const linksColWidth = Math.max(
    10,
    ...adrs.map((a) => (a.links.length > 0 ? a.links.join(", ").length : 1)),
  );

  const header = `${"TAG".padEnd(tagColWidth)}  ${"TITLE".padEnd(titleColWidth)}  ${"LINKS".padEnd(linksColWidth)}  PATH`;
  const separator = `${"-".repeat(tagColWidth)}  ${"-".repeat(titleColWidth)}  ${"-".repeat(linksColWidth)}  ${"-".repeat(24)}`;

  const rows = adrs.map((a) => {
    const tag = a.tag.padEnd(tagColWidth);
    const title = a.title.padEnd(titleColWidth);
    const linksStr = a.links.length > 0 ? a.links.join(", ") : "-";
    const links = linksStr.padEnd(linksColWidth);
    return `${tag}  ${title}  ${links}  ${a.relativePath}`;
  });

  return [header, separator, ...rows].join("\n");
}

/**
 * Declarative definition for the `modie adr list` command.
 */
export const adrListCommand: CliCommandDefinition<
  AdrListFlags,
  ListedArtifact[],
  typeof adrListSchema
> = defineCommand({
  id: "adr_list",
  namespace: "adr",
  name: "list",
  aliases: ["ls"],
  summaryUsage: "[options]",
  usage: "modie adr list [options]",
  description: "List active ADR artifacts",
  agentGuidance:
    "Call this tool to discover active architectural decision records (ADRs) across the repository or governing a specific directory scope (honoring ancestral scope traversal per RULE-9).",
  helpUsage: "modie adr list --help",
  schema: adrListSchema,
  positionals: [],
  flags: {
    scope: {
      short: "s",
      placeholder: "<path>",
      description:
        "Filter ADRs governing target directory scope via ancestral traversal",
    },
  },
  execute: async (input, context) => {
    return listAdrs({
      cwd: context.cwd,
      scope: input.scope,
    });
  },
  render: (adrs, context) => {
    const scope = context.flags.scope;
    if (adrs.length === 0) {
      if (scope) {
        context.stderr(`No active ADRs found governing scope "${scope}".`);
      } else {
        context.stderr("No active ADRs found in workspace.");
      }
      return;
    }

    const scopeSummary = scope ? ` governing scope "${scope}"` : "";
    context.stderr(
      `Active ADRs (${adrs.length} ADR${adrs.length === 1 ? "" : "s"}${scopeSummary}):\n`,
    );
    context.stderr(renderAdrListTable(adrs));
  },
  renderJson: (adrs, context) => {
    context.stdout(JSON.stringify(adrs, null, 2));
  },
});

/**
 * CLI command handler for `modie adr list`.
 */
export const handleAdrList: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(adrListCommand);

/**
 * Prints usage instructions for `modie adr list`.
 */
export function printAdrListHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(adrListCommand));
}
