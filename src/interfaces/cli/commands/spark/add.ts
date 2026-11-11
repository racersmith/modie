/**
 * Declarative CLI command definition for `modie spark add <title> [body]`.
 * Enforces RULE-25 and RULE-27.
 */

import { z } from "zod";
import { sparkAdd } from "../../../../core/index.ts";
import { toPosixRelative } from "../../../../core/domain/common/paths.ts";
import {
  defineCommand,
  type CliCommandDefinition,
} from "../../framework/index.ts";

export const sparkAddSchema = z.object({
  title: z
    .string()
    .min(1)
    .describe("Concise title or spark realization"),
  body: z
    .string()
    .optional()
    .describe("Optional detailed text, paragraphs, or code snippets"),
  handle: z
    .string()
    .optional()
    .describe("Optional custom handle for the spark (e.g. 'ide', 'resolver')"),
});

export type SparkAddInput = z.infer<typeof sparkAddSchema>;

export interface SparkAddResultPayload {
  handle: string;
  title: string;
  body: string;
  filepath: string;
  relativePath: string;
  isNewFile: boolean;
}

export const sparkAddCommand: CliCommandDefinition<
  Record<string, any>,
  SparkAddResultPayload,
  typeof sparkAddSchema
> = defineCommand({
  id: "spark_add",
  namespace: "spark",
  name: "add",
  summaryUsage: "<title> [body] [options]",
  usage: "modie spark add <title> [body] [options]",
  description: "Add a nascent realization to the spark ledger",
  agentGuidance:
    "Call this tool to quickly record out-of-scope architectural discoveries or thoughts without violating active task blast radius.",
  helpUsage: "modie spark add --help",
  schema: sparkAddSchema,
  positionals: [
    {
      name: "title",
      description: "Concise title or spark realization",
      required: true,
    },
    {
      name: "body",
      description: "Optional body paragraphs or code snippets",
      required: false,
      variadic: true,
    },
  ],
  flags: {
    handle: {
      short: "H",
      placeholder: "<handle>",
      description: "Custom handle for the spark",
    },
  },
  execute: async (input, context): Promise<SparkAddResultPayload> => {
    const result = await sparkAdd({
      title: input.title,
      body: input.body,
      handle: input.handle,
      cwd: context.cwd,
    });

    return {
      handle: result.spark.handle!,
      title: result.spark.title,
      body: result.spark.body,
      filepath: result.filepath,
      relativePath: toPosixRelative(context.cwd, result.filepath),
      isNewFile: result.isNewFile,
    };
  },
  render: (result, context) => {
    context.stdout(result.handle);
    context.stderr(
      `✓ Added spark [${result.handle}]: "${result.title}" in ${result.relativePath}`,
    );
  },
  renderJson: (result, context) => {
    context.stdout(JSON.stringify(result, null, 2));
    context.stderr(
      `✓ Added spark [${result.handle}] in ${result.relativePath}`,
    );
  },
});

