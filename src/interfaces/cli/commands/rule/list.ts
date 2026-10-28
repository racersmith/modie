/**
 * Declarative CLI command definition for `modie rule list [options]`.
 * Consumes public core API per RULE-25, honors ancestral scope traversal per RULE-9,
 * and enforces stdout/stderr separation per RULE-27.
 */

import { z } from "zod";
import { listRules, type ListedArtifact } from "../../../../core/index.ts";
import {
  createCommandHandler,
  defineCommand,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export const ruleListSchema = z.object({
  scope: z
    .string()
    .optional()
    .describe(
      "Filter rules by ancestral scope traversal from target path up to workspace root",
    ),
});

export type RuleListInput = z.infer<typeof ruleListSchema>;

export interface RuleListFlags {
  scope?: string;
  json?: boolean;
}

/**
 * Formats listed RULE artifacts into a human-readable aligned table.
 */
export function renderRuleListTable(rules: ListedArtifact[]): string {
  if (rules.length === 0) {
    return "";
  }

  const tagColWidth = Math.max(8, ...rules.map((r) => r.tag.length));
  const titleColWidth = Math.max(12, ...rules.map((r) => r.title.length));
  const linksColWidth = Math.max(
    10,
    ...rules.map((r) => (r.links.length > 0 ? r.links.join(", ").length : 1)),
  );

  const header = `${"TAG".padEnd(tagColWidth)}  ${"TITLE".padEnd(titleColWidth)}  ${"LINKS".padEnd(linksColWidth)}  PATH`;
  const separator = `${"-".repeat(tagColWidth)}  ${"-".repeat(titleColWidth)}  ${"-".repeat(linksColWidth)}  ${"-".repeat(24)}`;

  const rows = rules.map((r) => {
    const tag = r.tag.padEnd(tagColWidth);
    const title = r.title.padEnd(titleColWidth);
    const linksStr = r.links.length > 0 ? r.links.join(", ") : "-";
    const links = linksStr.padEnd(linksColWidth);
    return `${tag}  ${title}  ${links}  ${r.relativePath}`;
  });

  return [header, separator, ...rows].join("\n");
}

/**
 * Declarative definition for the `modie rule list` command.
 */
export const ruleListCommand: CliCommandDefinition<
  RuleListFlags,
  ListedArtifact[],
  typeof ruleListSchema
> = defineCommand({
  id: "rule_list",
  name: "list",
  usage: "modie rule list [options]",
  description:
    "List active RULE artifacts with titles, tags, relative paths, and links.",
  agentGuidance:
    "Call this tool to discover active governance rules across the repository or governing a specific directory scope (honoring ancestral scope traversal per RULE-9).",
  helpUsage: "modie rule list --help",
  schema: ruleListSchema,
  positionals: [],
  flags: {
    scope: {
      type: "string",
      short: "s",
      placeholder: "<path>",
      description:
        "Filter rules governing target directory scope via ancestral traversal",
    },
  },
  execute: async (input, context) => {
    return listRules({
      cwd: context.cwd,
      scope: input.scope,
    });
  },
  render: (rules, context) => {
    const scope = context.flags.scope;
    if (rules.length === 0) {
      if (scope) {
        context.stderr(`No active rules found governing scope "${scope}".`);
      } else {
        context.stderr("No active rules found in workspace.");
      }
      return;
    }

    const scopeSummary = scope ? ` governing scope "${scope}"` : "";
    context.stderr(
      `Active Rules (${rules.length} rule${rules.length === 1 ? "" : "s"}${scopeSummary}):\n`,
    );
    context.stderr(renderRuleListTable(rules));
  },
  renderJson: (rules, context) => {
    context.stdout(JSON.stringify(rules, null, 2));
  },
});

/**
 * CLI command handler for `modie rule list`.
 */
export const handleRuleList: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(ruleListCommand);

/**
 * Prints usage instructions for `modie rule list`.
 */
export function printRuleListHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(ruleListCommand));
}
