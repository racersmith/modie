/**
 * Declarative CLI command definition for `modie spark promote <handle> [slug]`.
 * Enforces RULE-25 and RULE-27.
 */

import { z } from "zod";
import { sparkPromote } from "../../../../core/index.ts";
import { toPosixRelative } from "../../../../core/domain/common/paths.ts";
import {
  defineCommand,
  type CliCommandDefinition,
} from "../../framework/index.ts";

export const sparkPromoteSchema = z.object({
  handle: z.string().min(1).describe("Handle of the spark to promote"),
  slug: z.string().optional().describe("Optional custom slug for the idea file"),
});

export type SparkPromoteInput = z.infer<typeof sparkPromoteSchema>;

export interface SparkPromoteResultPayload {
  handle: string;
  title: string;
  slug: string;
  ideaPath: string;
  relativePath: string;
}

export const sparkPromoteCommand: CliCommandDefinition<
  Record<string, any>,
  SparkPromoteResultPayload,
  typeof sparkPromoteSchema
> = defineCommand({
  id: "spark_promote",
  namespace: "spark",
  name: "promote",
  summaryUsage: "<handle> [slug] [options]",
  usage: "modie spark promote <handle> [slug] [options]",
  description: "Promote an active spark to a dedicated .IDEA.md file",
  agentGuidance:
    "Promote a spark from SPARKS.md into an un-indexed [slug].IDEA.md file for active design incubation.",
  helpUsage: "modie spark promote --help",
  schema: sparkPromoteSchema,
  positionals: [
    {
      name: "handle",
      description: "Handle of the spark to promote",
      required: true,
    },
    {
      name: "slug",
      description: "Optional custom slug for the idea file",
      required: false,
    },
  ],
  flags: {
    slug: {
      short: "s",
      placeholder: "<slug>",
      description: "Custom slug for the idea file",
    },
  },
  execute: async (input, context): Promise<SparkPromoteResultPayload> => {
    const result = await sparkPromote(input.handle, {
      slug: input.slug,
      cwd: context.cwd,
    });

    return {
      handle: result.spark.handle ?? input.handle,
      title: result.spark.title,
      slug: result.slug,
      ideaPath: result.ideaPath,
      relativePath: toPosixRelative(context.cwd, result.ideaPath),
    };
  },
  render: (result, context) => {
    context.stdout(result.relativePath);
    context.stderr(
      `✓ Promoted spark [${result.handle}] to idea "${result.slug}": ${result.relativePath}`,
    );
  },
  renderJson: (result, context) => {
    context.stdout(JSON.stringify(result, null, 2));
    context.stderr(
      `✓ Promoted spark [${result.handle}] to idea "${result.slug}" (${result.relativePath})`,
    );
  },
});

