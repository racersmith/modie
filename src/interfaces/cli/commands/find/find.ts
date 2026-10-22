/**
 * Declarative CLI command definition for `modie find <tag> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import {
  resolveArtifactByTag,
  type ResolvedArtifact,
} from "../../../../core/index.ts";
import {
  createCommandHandler,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export interface FindFlags {
  absolute?: boolean;
  json?: boolean;
}

/**
 * Declarative definition for the `modie find` command.
 */
export const findCommand: CliCommandDefinition<FindFlags, ResolvedArtifact> = {
  name: "find",
  usage: "modie find <tag-or-identifier> [options]",
  description:
    "Find the filesystem path of an indexable artifact by canonical tag.",
  helpUsage: "modie find --help",
  positionals: [
    {
      name: "tag-or-identifier",
      description:
        "Artifact tag (e.g. RULE-1, ADR-6, TASK-12), slug, or filename",
      required: true,
      missingError:
        "Error: Missing required artifact identifier. Usage: modie find <tag>",
    },
  ],
  flags: {
    absolute: {
      type: "boolean",
      description: "Emit absolute file path instead of relative path",
    },
  },
  run: async (context) => {
    const targetIdentifier = context.positionals[0]!;
    return resolveArtifactByTag(targetIdentifier, { cwd: context.cwd });
  },
  render: (result, context) => {
    const outputPath = context.flags.absolute
      ? result.filepath
      : result.relativePath;
    context.stdout(outputPath);
  },
  renderJson: (result, context) => {
    context.stdout(JSON.stringify(result, null, 2));
  },
};

/**
 * CLI command handler for `modie find`.
 */
export const handleFind: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(findCommand);

/**
 * Prints usage instructions for `modie find`.
 */
export function printFindHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(findCommand));
}
