/**
 * Declarative CLI command definition for `modie rule archive <tag> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 * Enforces RULE-4 and RULE-31.
 */

import { z } from "zod";
import { archiveRule, type ArchiveArtifactResult } from "../../../../core/index.ts";
import {
  createCommandHandler,
  defineCommand,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export const ruleArchiveSchema = z.object({
  tag: z
    .string()
    .min(1, "RULE identifier is required")
    .describe("RULE tag (e.g. RULE-5), slug, or file path"),
  force: z
    .boolean()
    .default(false)
    .describe(
      "Force archival bypassing active incoming reference checks (RULE-31 override)",
    ),
});

export type RuleArchiveInput = z.infer<typeof ruleArchiveSchema>;

export interface RuleArchiveFlags {
  force?: boolean;
  json?: boolean;
}

/**
 * Declarative definition for the `modie rule archive` command.
 */
export const ruleArchiveCommand: CliCommandDefinition<
  RuleArchiveFlags,
  ArchiveArtifactResult,
  typeof ruleArchiveSchema
> = defineCommand({
  id: "rule_archive",
  name: "archive",
  usage: "modie rule archive <tag-or-path> [options]",
  description:
    "Archive a RULE artifact enforcing zero active incoming references (RULE-31)",
  agentGuidance:
    "Call this tool to archive an invariant RULE. Verifies that zero active artifacts reference it before renaming to *.ARCHIVED.md.",
  helpUsage: "modie rule archive --help",
  schema: ruleArchiveSchema,
  positionals: [
    {
      name: "tag-or-path",
      property: "tag",
      description: "RULE tag (e.g. RULE-5), slug, or file path",
      required: true,
      missingError:
        "Error: Missing required RULE identifier. Usage: modie rule archive <tag-or-path> [options]",
    },
  ],
  flags: {
    force: {
      type: "boolean",
      short: "f",
      description:
        "Force archival bypassing active incoming reference checks (RULE-31 override)",
    },
  },
  execute: async (input, context) => {
    return archiveRule(input.tag, {
      force: input.force,
      cwd: context.cwd,
    });
  },
  render: (result, context) => {
    context.stdout(result.archivedRelativePath);

    const forceNotice = result.forced ? " (forced with active references)" : "";
    context.stderr(
      `✓ Archived RULE ${result.tag}: ${result.archivedFilename}${forceNotice}`,
    );
  },
  renderJson: (result, context) => {
    context.stdout(JSON.stringify(result, null, 2));

    const forceNotice = result.forced ? " (forced)" : "";
    context.stderr(
      `✓ Archived RULE ${result.tag} (${result.archivedRelativePath})${forceNotice}`,
    );
  },
});

/**
 * CLI command handler for `modie rule archive`.
 */
export const handleRuleArchive: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(ruleArchiveCommand);

/**
 * Prints usage instructions for `modie rule archive`.
 */
export function printRuleArchiveHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(ruleArchiveCommand));
}
