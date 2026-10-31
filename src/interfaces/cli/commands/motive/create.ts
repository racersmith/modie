/**
 * Declarative CLI command definition for `modie motive create [content] [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { z } from "zod";
import {
  createMotive,
  type CreateMotiveOptions,
} from "../../../../core/index.ts";
import {
  createCommandHandler,
  defineCommand,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export const motiveCreateSchema = z.object({
  content: z
    .string()
    .optional()
    .describe(
      "Motive prose expressing scope-level purpose and trajectory (no artifact tags or cross-document references per RULE-10). When omitted, scaffolds a default MOTIVE.md template.",
    ),
  context: z
    .string()
    .optional()
    .describe("Alias for content"),
  scope: z
    .string()
    .optional()
    .describe("Target scope directory (defaults to current working directory)"),
  overwrite: z
    .boolean()
    .optional()
    .default(false)
    .describe("Explicitly allow overwriting an existing MOTIVE.md in the target scope"),
});

export type MotiveCreateInput = z.infer<typeof motiveCreateSchema>;

export interface MotiveCreateFlags {
  scope?: string;
  content?: string;
  context?: string;
  purpose?: string;
  overwrite?: boolean;
  force?: boolean;
}

export interface MotiveCreateResultPayload {
  scope: string;
  filename: string;
  filepath: string;
  relativePath: string;
  content: string;
  overwritten: boolean;
  scaffolded: boolean;
}

/**
 * Declarative definition for the `modie motive create` command.
 */
export const motiveCreateCommand: CliCommandDefinition<
  MotiveCreateFlags,
  MotiveCreateResultPayload,
  typeof motiveCreateSchema
> = defineCommand({
  id: "motive_create",
  namespace: "motive",
  name: "create",
  summaryUsage: "[content] [options]",
  usage: "modie motive create [content] [options]",
  description: "Create or scaffold a MOTIVE.md scope intent file",
  agentGuidance:
    "Call this tool to create or scaffold a singleton `<dir>/.modie/MOTIVE.md` file expressing directory-level purpose and long-term trajectory.\n\n" +
    "BEST PRACTICE: `MOTIVE.md` must never cite or link to any artifact IDs or other Modie documents (RULE-10). Creation fails if `MOTIVE.md` already exists in the target scope unless `overwrite: true` is explicitly passed.",
  helpUsage: "modie motive create --help",
  schema: motiveCreateSchema,
  positionals: [
    {
      name: "content",
      description:
        "Initial motive prose content (when omitted, scaffolds a default template)",
      required: false,
      variadic: true,
    },
  ],
  flags: {
    scope: {
      short: "s",
      placeholder: "<dir>",
    },
    content: {
      short: "c",
      placeholder: "<text>",
      description:
        "Motive prose expressing directory-level purpose and trajectory",
      aliases: ["context", "purpose"],
    },
    overwrite: {
      short: "f",
      description:
        "Overwrite an existing MOTIVE.md in the target scope",
      aliases: ["force"],
    },
  },
  execute: async (input, context): Promise<MotiveCreateResultPayload> => {
    const motiveOptions: CreateMotiveOptions = {
      scopeDir: input.scope,
      content: input.content ?? input.context,
      overwrite: input.overwrite,
      cwd: context.cwd,
    };

    const result = await createMotive(motiveOptions);

    return {
      scope: result.scope,
      filename: result.filename,
      filepath: result.filepath,
      relativePath: result.relativePath,
      content: result.content,
      overwritten: result.overwritten,
      scaffolded: result.scaffolded,
    };
  },
  render: (result, context) => {
    const actionLabel = result.overwritten
      ? "Updated"
      : result.scaffolded
        ? "Scaffolded"
        : "Created";
    context.stdout(result.relativePath);
    context.stderr(
      `✓ ${actionLabel} motive for scope "${result.scope}": ${result.relativePath}`,
    );
  },
  renderJson: (result, context) => {
    const actionLabel = result.overwritten
      ? "Updated"
      : result.scaffolded
        ? "Scaffolded"
        : "Created";
    context.stdout(JSON.stringify(result, null, 2));
    context.stderr(
      `✓ ${actionLabel} motive for scope "${result.scope}" (${result.relativePath})`,
    );
  },
});

/**
 * CLI command handler for `modie motive create`.
 */
export const handleMotiveCreate: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(motiveCreateCommand);

/**
 * Prints usage instructions for `modie motive create`.
 */
export function printMotiveCreateHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(motiveCreateCommand));
}

