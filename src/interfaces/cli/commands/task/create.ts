/**
 * Declarative CLI command definition for `modie task create <title> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { z } from "zod";
import { createTask, type CreateTaskOptions } from "../../../../core/index.ts";
import {
  createCommandHandler,
  defineCommand,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export const taskCreateSchema = z.object({
  title: z
    .string()
    .min(1, "Task title is required")
    .describe("Title of the task to create (e.g. 'Create CLI Harness')"),
  scope: z
    .string()
    .optional()
    .describe("Target scope directory (defaults to current working directory)"),
  context: z
    .string()
    .optional()
    .describe("Context / problem statement for the task"),
  depends_on: z
    .array(z.string())
    .optional()
    .default([])
    .describe("Prerequisite TASK IDs (repeat flag or use comma-separated list)"),
  links: z
    .array(z.string())
    .optional()
    .default([])
    .describe(
      "ADR and RULE link targets (repeat flag for verbatim targets or use comma-separated list)",
    ),
  criteria: z
    .array(z.string())
    .optional()
    .default([])
    .describe(
      "Acceptance criteria items (repeat -a/--criterion for verbatim items with punctuation)",
    ),
  prefix: z
    .string()
    .optional()
    .describe('Custom task ID prefix tag (e.g. "J" for TASK-J1)'),
  branch: z
    .string()
    .optional()
    .describe("Git branch override for ID allocation"),
  flat: z
    .boolean()
    .default(false)
    .describe("Create flat task file without .tasks container"),
  forceTrunk: z
    .boolean()
    .default(false)
    .describe("Force trunk monotonic integer sequence"),
  allowBroadScope: z
    .boolean()
    .default(false)
    .describe("Allow placing task above deepest common ancestor"),
});

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

export interface TaskCreateFlags {
  scope?: string;
  context?: string;
  "depends-on"?: string[];
  "depend-on"?: string[];
  link?: string[];
  links?: string[];
  criterion?: string[];
  criteria?: string[];
  "acceptance-criteria"?: string[];
  prefix?: string;
  branch?: string;
  flat?: boolean;
  "force-trunk"?: boolean;
  "allow-broad-scope"?: boolean;
}

export interface TaskCreateResultPayload {
  id: string;
  slug: string;
  filename: string;
  filepath: string;
  relativePath: string;
  title: string;
  depends_on: string[];
  links: string[];
  acceptanceCriteria: any[];
  watermark: any;
}

/**
 * Declarative definition for the `modie task create` command.
 */
export const taskCreateCommand: CliCommandDefinition<
  TaskCreateFlags,
  TaskCreateResultPayload,
  typeof taskCreateSchema
> = defineCommand({
  id: "task_create",
  name: "create",
  usage: "modie task create <title> [options]",
  description: "Create a new TASK artifact",
  agentGuidance:
    "Call this tool to generate a new TASK artifact with automatic sequence watermark resolution, link validation, and least-scope directory placement.",
  helpUsage: "modie task create --help",
  schema: taskCreateSchema,
  positionals: [
    {
      name: "title",
      property: "title",
      description: 'Title of the task to create (e.g. "Create CLI Harness")',
      required: true,
      variadic: true,
      missingError:
        "Error: Missing required task title. Usage: modie task create <title> [options]",
    },
  ],
  flags: {
    scope: {
      type: "string",
      short: "s",
      placeholder: "<dir>",
      description: "Target scope directory (defaults to current working directory)",
    },
    context: {
      type: "string",
      short: "c",
      placeholder: "<text>",
      description: "Context / problem statement for the task",
    },
    "depends-on": {
      type: "string",
      short: "d",
      multiple: true,
      placeholder: "<ids>",
      description: "Prerequisite TASK IDs (repeat flag or use comma-separated list)",
      aliases: ["depend-on"],
      property: "depends_on",
    },
    "depend-on": {
      type: "string",
      multiple: true,
      description: "Prerequisite TASK ID (verbatim)",
      property: "depends_on",
      splitCommas: false,
    },
    link: {
      type: "string",
      short: "l",
      multiple: true,
      placeholder: "<targets>",
      description: "ADR and RULE link targets (repeat flag for verbatim targets)",
      property: "links",
      splitCommas: false,
    },
    links: {
      type: "string",
      multiple: true,
      placeholder: "<targets>",
      description: "ADR and RULE link targets (comma-separated list)",
      property: "links",
      splitCommas: true,
    },
    criterion: {
      type: "string",
      short: "a",
      multiple: true,
      placeholder: "<items>",
      description:
        "Acceptance criteria items (repeat -a/--criterion for verbatim items with punctuation)",
      property: "criteria",
      splitCommas: false,
    },
    criteria: {
      type: "string",
      multiple: true,
      placeholder: "<items>",
      description: "Acceptance criteria items (comma-separated list)",
      property: "criteria",
      splitCommas: true,
    },
    "acceptance-criteria": {
      type: "string",
      multiple: true,
      description: "Alias for --criteria",
      property: "criteria",
      splitCommas: true,
    },
    prefix: {
      type: "string",
      short: "p",
      placeholder: "<tag>",
      description: 'Custom task ID prefix tag (e.g. "J" for TASK-J1)',
    },
    branch: {
      type: "string",
      short: "b",
      placeholder: "<name>",
      description: "Git branch override for ID allocation",
    },
    flat: {
      type: "boolean",
      description: "Create flat task file without .tasks container",
    },
    "force-trunk": {
      type: "boolean",
      description: "Force trunk monotonic integer sequence",
      property: "forceTrunk",
    },
    "allow-broad-scope": {
      type: "boolean",
      description: "Allow placing task above deepest common ancestor",
      property: "allowBroadScope",
    },
  },
  execute: async (input, context) => {
    const taskOptions: CreateTaskOptions = {
      title: input.title,
      scopeDir: input.scope,
      context: input.context,
      depends_on: input.depends_on.length > 0 ? input.depends_on : undefined,
      links: input.links.length > 0 ? input.links : undefined,
      acceptanceCriteria:
        input.criteria.length > 0 ? input.criteria : undefined,
      useSubtypeContainer: !input.flat,
      prefix: input.prefix,
      branch: input.branch,
      forceTrunk: Boolean(input.forceTrunk),
      allowBroadScope: Boolean(input.allowBroadScope),
      cwd: context.cwd,
    };

    const result = await createTask(taskOptions);

    return {
      id: result.artifact.id,
      slug: result.artifact.slug,
      filename: result.filename,
      filepath: result.filepath,
      relativePath: result.relativePath,
      title: result.artifact.title ?? input.title,
      depends_on: result.artifact.depends_on,
      links: result.artifact.links,
      acceptanceCriteria: result.artifact.acceptanceCriteria,
      watermark: result.watermark,
    };
  },
  render: (result, context) => {
    context.stdout(result.relativePath);
    context.stderr(`✓ Created task TASK-${result.id}: ${result.filename}`);
  },
  renderJson: (result, context) => {
    context.stdout(JSON.stringify(result, null, 2));
    context.stderr(`✓ Created task TASK-${result.id} (${result.relativePath})`);
  },
});

/**
 * CLI command handler for `modie task create`.
 */
export const handleTaskCreate: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(taskCreateCommand);

/**
 * Prints usage instructions for `modie task create`.
 */
export function printTaskCreateHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(taskCreateCommand));
}
