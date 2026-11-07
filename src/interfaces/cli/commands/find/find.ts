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
  defineCommand,
  type CliCommandDefinition,
} from "../../framework/index.ts";

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

/**
 * Declarative definition for the `modie find` command.
 */
export const findCommand: CliCommandDefinition<
  Record<string, any>,
  ResolvedArtifact,
  typeof findSchema
> = defineCommand({
  id: "find",
  name: "find",
  summaryUsage: "<tag> [options]",
  usage: "modie find <tag-or-identifier> [options]",
  description: "Find the file path of an artifact by tag",
  helpUsage: "modie find --help",
  schema: findSchema,
  positionals: [
    {
      name: "tag-or-identifier",
      required: true,
      missingError:
        "Error: Missing required artifact identifier. Usage: modie find <tag>",
    },
  ],
  execute: async (input, context) => {
    return resolveArtifactByTag(input.tag, {
      cwd: context.cwd,
      history: input.history,
    });
  },
  render: (result, context, input) => {
    const outputPath = input?.absolute ? result.filepath : result.relativePath;
    context.stdout(outputPath);
  },
});
