/**
 * Declarative CLI command definition for `modie archive <tag> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 * Enforces RULE-4 and RULE-31 across all indexable governance artifacts.
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

export const archiveSchema = z.object({
  tag: z
    .string()
    .min(1, "Artifact identifier is required")
    .describe("Artifact tag (e.g. RULE-5, ADR-3), slug, or file path"),
  force: z
    .boolean()
    .default(false)
    .describe(
      "Force archival bypassing active incoming reference checks (RULE-31 override)",
    ),
});

export type ArchiveInput = z.infer<typeof archiveSchema>;

export interface ArchiveFlags {
  force?: boolean;
  json?: boolean;
}

/**
 * Declarative definition for the root `modie archive` command.
 */
export const archiveCommand: CliCommandDefinition<
  ArchiveFlags,
  ArchiveArtifactResult,
  typeof archiveSchema
> = defineCommand({
  id: "archive",
  name: "archive",
  summaryUsage: "<tag> [options]",
  usage: "modie archive <tag-or-path> [options]",
  description: "Archive a governance artifact (RULE, ADR)",
  agentGuidance:
    "Call this tool to archive a superseded governance artifact (ADR or RULE). Verifies that zero active artifacts reference it before renaming to *.ARCHIVED.md.",
  helpUsage: "modie archive --help",
  schema: archiveSchema,
  positionals: [
    {
      name: "tag-or-path",
      property: "tag",
      description: "Artifact tag (e.g. RULE-5, ADR-3), slug, or file path",
      required: true,
      missingError:
        "Error: Missing required artifact identifier. Usage: modie archive <tag-or-path> [options]",
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
    return archiveArtifact({
      tag: input.tag,
      force: input.force,
      cwd: context.cwd,
    });
  },
  render: (result, context) => {
    context.stdout(result.archivedRelativePath);

    const forceNotice = result.forced ? " (forced with active references)" : "";
    context.stderr(
      `✓ Archived ${result.subtype} ${result.tag}: ${result.archivedFilename}${forceNotice}`,
    );
  },
  renderJson: (result, context) => {
    context.stdout(JSON.stringify(result, null, 2));

    const forceNotice = result.forced ? " (forced)" : "";
    context.stderr(
      `✓ Archived ${result.subtype} ${result.tag} (${result.archivedRelativePath})${forceNotice}`,
    );
  },
});

/**
 * CLI command handler for `modie archive`.
 */
export const handleArchive: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(archiveCommand);

/**
 * Prints usage instructions for `modie archive`.
 */
export function printArchiveHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(archiveCommand));
}
