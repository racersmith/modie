/**
 * Declarative CLI command definition for `modie adr archive <tag> [options]`.
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

export const adrArchiveSchema = archiveSchema;

export type AdrArchiveInput = z.infer<typeof adrArchiveSchema>;

export interface AdrArchiveFlags {
  force?: boolean;
  json?: boolean;
}

/**
 * Declarative definition for the `modie adr archive` command alias.
 */
export const adrArchiveCommand: CliCommandDefinition<
  AdrArchiveFlags,
  ArchiveArtifactResult,
  typeof adrArchiveSchema
> = defineCommand({
  id: "adr_archive",
  name: "archive",
  usage: "modie adr archive <tag-or-path> [options]",
  description:
    "Archive an ADR artifact enforcing zero active incoming references (alias for 'modie archive')",
  agentGuidance:
    "Call this tool to archive a superseded ADR. Verifies that zero active artifacts reference it before renaming to *.ARCHIVED.md.",
  helpUsage: "modie adr archive --help",
  schema: adrArchiveSchema,
  positionals: [
    {
      name: "tag-or-path",
      property: "tag",
      description: "ADR tag (e.g. ADR-3), slug, or file path",
      required: true,
      missingError:
        "Error: Missing required ADR identifier. Usage: modie adr archive <tag-or-path> [options]",
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
 * CLI command handler for `modie adr archive`.
 */
export const handleAdrArchive: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(adrArchiveCommand);

/**
 * Prints usage instructions for `modie adr archive`.
 */
export function printAdrArchiveHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(adrArchiveCommand));
}
