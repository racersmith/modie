/**
 * Declarative CLI command definition for `modie spark reject <handle> [reason]`.
 * Enforces RULE-25 and RULE-27.
 */

import { z } from "zod";
import { sparkReject } from "../../../../core/index.ts";
import { toPosixRelative } from "../../../../core/domain/common/paths.ts";
import {
  defineCommand,
  type CliCommandDefinition,
} from "../../framework/index.ts";

export const sparkRejectSchema = z.object({
  handle: z.string().min(1).describe("Handle of the spark to reject"),
  reason: z
    .string()
    .optional()
    .describe("Optional rationale for rejection"),
});

export type SparkRejectInput = z.infer<typeof sparkRejectSchema>;

export interface SparkRejectResultPayload {
  handle: string;
  title: string;
  rejectedPath: string;
  relativePath: string;
}

export const sparkRejectCommand: CliCommandDefinition<
  Record<string, any>,
  SparkRejectResultPayload,
  typeof sparkRejectSchema
> = defineCommand({
  id: "spark_reject",
  namespace: "spark",
  name: "reject",
  summaryUsage: "<handle> [reason] [options]",
  usage: "modie spark reject <handle> [reason] [options]",
  description: "Reject an active spark and archive it to .rejected/SPARKS.md",
  agentGuidance:
    "Archive a discarded spark with an explicit rationale to prevent re-proposing settled non-goals.",
  helpUsage: "modie spark reject --help",
  schema: sparkRejectSchema,
  positionals: [
    {
      name: "handle",
      description: "Handle of the spark to reject",
      required: true,
    },
    {
      name: "reason",
      description: "Optional rationale for rejection",
      required: false,
      variadic: true,
    },
  ],
  flags: {
    reason: {
      short: "r",
      placeholder: "<text>",
      description: "Rationale for rejection",
    },
  },
  execute: async (input, context): Promise<SparkRejectResultPayload> => {
    const result = await sparkReject(input.handle, {
      reason: input.reason,
      cwd: context.cwd,
    });

    return {
      handle: result.spark.handle ?? input.handle,
      title: result.spark.title,
      rejectedPath: result.rejectedPath,
      relativePath: toPosixRelative(context.cwd, result.rejectedPath),
    };
  },
  render: (result, context) => {
    context.stdout(result.handle);
    context.stderr(
      `✓ Rejected spark [${result.handle}] ("${result.title}"): archived to ${result.relativePath}`,
    );
  },
  renderJson: (result, context) => {
    context.stdout(JSON.stringify(result, null, 2));
    context.stderr(
      `✓ Rejected spark [${result.handle}] archived to ${result.relativePath}`,
    );
  },
});

