/**
 * Declarative CLI command definition for `modie find <tag> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { z } from "zod";
import {
  resolveArtifactByTag,
  type ResolvedArtifact,
} from "../../../../core/index.ts";
import {
  createCommandHandler,
  defineCommand,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export const findSchema = z.object({
  tag: z
    .string()
    .min(1, "Artifact tag or identifier is required")
    .describe("Artifact tag (e.g. RULE-1, ADR-6, TASK-12), slug, or filename"),
  absolute: z
    .boolean()
    .default(false)
    .describe("Emit absolute file path instead of relative path"),
  history: z
    .boolean()
    .default(false)
    .describe(
      "Query completed task history and branches in Git if artifact is not active on disk",
    ),
});

export type FindInput = z.infer<typeof findSchema>;

export interface FindFlags {
  absolute?: boolean;
  history?: boolean;
  json?: boolean;
}

/**
 * Declarative definition for the `modie find` command.
 */
export const findCommand: CliCommandDefinition<
  FindFlags,
  ResolvedArtifact,
  typeof findSchema
> = defineCommand({
  id: "find",
  name: "find",
  usage: "modie find <tag-or-identifier> [options]",
  description:
    "Find the filesystem path of an indexable artifact by canonical tag.",
  helpUsage: "modie find --help",
  schema: findSchema,
  positionals: [
    {
      name: "tag-or-identifier",
      property: "tag",
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
    history: {
      type: "boolean",
      description:
        "Query completed task history and branches in Git if artifact is not active on disk",
    },
  },
  execute: async (input, context) => {
    return resolveArtifactByTag(input.tag, {
      cwd: context.cwd,
      history: input.history,
    });
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
});

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
