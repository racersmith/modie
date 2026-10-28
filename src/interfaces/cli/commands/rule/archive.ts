/**
 * Declarative CLI command definition for `modie rule archive <tag> [options]`.
 * Transparent alias delegating to unified `modie archive` command.
 * Enforces RULE-4, RULE-25, RULE-27, and RULE-31.
 */

import { z } from "zod";
import {
  archiveArtifact,
  type ArchiveArtifactResult,
} from "../../../../core/index.ts";
import {
  createCommandHandler,
  defineCommand,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";
import { archiveCommand, archiveSchema } from "../archive/archive.ts";

export const ruleArchiveSchema = archiveSchema;

export type RuleArchiveInput = z.infer<typeof ruleArchiveSchema>;

export interface RuleArchiveFlags {
  force?: boolean;
  json?: boolean;
}

/**
 * Declarative definition for the `modie rule archive` command alias.
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
    "Archive a RULE artifact enforcing zero active incoming references (alias for 'modie archive')",
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
  flags: archiveCommand.flags,
  execute: async (input, context) => {
    return archiveArtifact({
      tag: input.tag,
      force: input.force,
      cwd: context.cwd,
    });
  },
  render: archiveCommand.render,
  renderJson: archiveCommand.renderJson,
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
