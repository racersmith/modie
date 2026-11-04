/**
 * Declarative CLI command definition for `modie task create <title> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { z } from "zod";
import { createTask, type CreateTaskOptions } from "../../../../core/index.ts";
import {
  defineCommand,
  type CliCommandDefinition,
} from "../../framework/index.ts";

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
    .describe(
      "Prerequisite TASK IDs (repeat flag or use comma-separated list)",
    ),
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
  plan_rules: z
    .array(z.string())
    .optional()
    .default([])
    .describe(
      "Planned RULE artifacts to author before completing this task (repeat flag or use comma-separated list)",
    ),
  plan_adrs: z
    .array(z.string())
    .optional()
    .default([])
    .describe(
      "Planned ADR artifacts to author before completing this task (repeat flag or use comma-separated list)",
    ),
  forceTrunk: z
    .boolean()
    .default(false)
    .describe("Force trunk monotonic integer sequence"),
  allowBroadScope: z
    .boolean()
    .default(false)
    .describe("Allow placing task above deepest common ancestor"),
  review: z
    .boolean()
    .default(true)
    .describe("Automatically include a 'User Review' acceptance criterion (default: true)"),
});

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

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
  plannedGovernance: any;
  watermark: any;
}

/**
 * Declarative definition for the `modie task create` command.
 */
export const taskCreateCommand: CliCommandDefinition<
  Record<string, any>,
  TaskCreateResultPayload,
  typeof taskCreateSchema
> = defineCommand({
  id: "task_create",
  namespace: "task",
  name: "create",
  summaryUsage: "<title>",
  usage: "modie task create <title> [options]",
  description:
    "Create a new TASK artifact with automatic watermark resolution",
  agentGuidance:
    "Call this tool to generate a new TASK artifact with automatic sequence watermark resolution, link validation, and least-scope directory placement.",
  helpUsage: "modie task create --help",
  schema: taskCreateSchema,
  positionals: [
    {
      name: "title",
      required: true,
      variadic: true,
      missingError:
        "Error: Missing required task title. Usage: modie task create <title> [options]",
    },
  ],
  flags: {
    scope: {
      short: "s",
      placeholder: "<dir>",
    },
    context: {
      short: "c",
      placeholder: "<text>",
    },
    "depends-on": {
      property: "depends_on",
      short: "d",
      placeholder: "<ids>",
      aliases: ["depend-on"],
    },
    "depend-on": {
      property: "depends_on",
      description: "Prerequisite TASK ID (verbatim)",
      splitCommas: false,
    },
    link: {
      property: "links",
      short: "l",
      placeholder: "<targets>",
      description:
        "ADR and RULE link targets (repeat flag for verbatim targets)",
      splitCommas: false,
    },
    links: {
      property: "links",
      placeholder: "<targets>",
      description: "ADR and RULE link targets (comma-separated list)",
      splitCommas: true,
    },
    criterion: {
      property: "criteria",
      short: "a",
      placeholder: "<items>",
      splitCommas: false,
    },
    criteria: {
      property: "criteria",
      placeholder: "<items>",
      description: "Acceptance criteria items (comma-separated list)",
      splitCommas: true,
    },
    "acceptance-criteria": {
      property: "criteria",
      description: "Alias for --criteria",
      splitCommas: true,
    },
    "plan-rule": {
      property: "plan_rules",
      aliases: ["planned-rule"],
      splitCommas: false,
      placeholder: "<rule-title>",
      description:
        "Planned RULE artifact to author before completing this task",
    },
    "plan-rules": {
      property: "plan_rules",
      splitCommas: true,
      placeholder: "<rule-titles>",
      description: "Planned RULE artifacts (comma-separated list)",
    },
    "plan-adr": {
      property: "plan_adrs",
      aliases: ["planned-adr"],
      splitCommas: false,
      placeholder: "<adr-title>",
      description: "Planned ADR artifact to author before completing this task",
    },
    "plan-adrs": {
      property: "plan_adrs",
      splitCommas: true,
      placeholder: "<adr-titles>",
      description: "Planned ADR artifacts (comma-separated list)",
    },
    prefix: {
      short: "p",
      placeholder: "<tag>",
    },
    branch: {
      short: "b",
      placeholder: "<name>",
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
      plannedGovernance:
        (input.plan_rules && input.plan_rules.length > 0) ||
        (input.plan_adrs && input.plan_adrs.length > 0)
          ? {
              rules: input.plan_rules,
              adrs: input.plan_adrs,
            }
          : undefined,
      prefix: input.prefix,
      branch: input.branch,
      forceTrunk: Boolean(input.forceTrunk),
      allowBroadScope: Boolean(input.allowBroadScope),
      review: input.review,
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
      plannedGovernance: result.artifact.plannedGovernance,
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

