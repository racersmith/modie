/**
 * Declarative CLI command definition for `modie adr archive <tag> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 * Enforces RULE-4 and RULE-31.
 */

import { z } from "zod";
import { archiveAdr, type ArchiveArtifactResult } from "../../../../core/index.ts";
import {
  createCommandHandler,
  defineCommand,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export const adrArchiveSchema = z.object({
  tag: z
    .string()
    .min(1, "ADR identifier is required")
    .describe("ADR tag (e.g. ADR-3), slug, or file path"),
  force: z
    .boolean()
    .default(false)
    .describe(
      "Force archival bypassing active incoming reference checks (RULE-31 override)",
    ),
});

export type AdrArchiveInput = z.infer<typeof adrArchiveSchema>;

export interface AdrArchiveFlags {
  force?: boolean;
  json?: boolean;
}

/**
 * Declarative definition for the `modie adr archive` command.
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
    "Archive an ADR artifact enforcing zero active incoming references (RULE-31)",
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
  flags: {
    force: {
      type: "boolean",
      short: "f",
      description:
        "Force archival bypassing active incoming reference checks (RULE-31 override)",
    },
  },
  execute: async (input, context) => {
    return archiveAdr(input.tag, {
      force: input.force,
      cwd: context.cwd,
    });
  },
  render: (result, context) => {
    context.stdout(result.archivedRelativePath);

    const forceNotice = result.forced ? " (forced with active references)" : "";
    context.stderr(
      `✓ Archived ADR ${result.tag}: ${result.archivedFilename}${forceNotice}`,
    );
  },
  renderJson: (result, context) => {
    context.stdout(JSON.stringify(result, null, 2));

    const forceNotice = result.forced ? " (forced)" : "";
    context.stderr(
      `✓ Archived ADR ${result.tag} (${result.archivedRelativePath})${forceNotice}`,
    );
  },
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
