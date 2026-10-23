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
  "plan-rule"?: string[];
  "planned-rule"?: string[];
  "plan-rules"?: string[];
  "plan-adr"?: string[];
  "planned-adr"?: string[];
  "plan-adrs"?: string[];
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
  plannedGovernance: any;
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
    "Call this tool to generate a new TASK artifact with automatic sequence watermark resolution, link validation, and least-scope directory placement.\n\n" +
    "TASK AUTHORING BEST PRACTICES & INVARIANTS:\n" +
    "1. Contract-Based Acceptance Criteria (RULE-30): Define deliverables in terms of component roles, behavioral contracts, and testable outcomes rather than concrete filesystem paths that rot during refactorings.\n" +
    "2. Ephemeral Task Decoupling: ANTI-PATTERN WARNING: Never reference ephemeral TASK IDs (e.g. `[TASK-XX]`, `@verifies TASK-XX`) in tests or code implementation comments. Tasks are ephemeral and deleted upon completion (ADR-6, RULE-21). Tests and code must ONLY reference durable `RULE-` and `ADR-` artifacts. If you find yourself wanting to cite a TASK in code or tests, STOP and author a new `RULE` or `ADR` instead.\n" +
    "3. Upfront Planned Governance: Front-load candidate rules and architectural decisions in `--plan-rule` and `--plan-adr` before starting implementation. All planned governance artifacts must be authored and satisfied before the task can be completed.\n" +
    "4. Atomic Scope & Blast Radius (RULE-6, RULE-12): Tasks must represent a single, cohesive unit of work scoped at the deepest common ancestor.",
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
    "plan-rule": {
      type: "string",
      multiple: true,
      aliases: ["planned-rule"],
      property: "plan_rules",
      splitCommas: false,
      placeholder: "<rule-title>",
      description: "Planned RULE artifact to author before completing this task",
    },
    "plan-rules": {
      type: "string",
      multiple: true,
      property: "plan_rules",
      splitCommas: true,
      placeholder: "<rule-titles>",
      description: "Planned RULE artifacts (comma-separated list)",
    },
    "plan-adr": {
      type: "string",
      multiple: true,
      aliases: ["planned-adr"],
      property: "plan_adrs",
      splitCommas: false,
      placeholder: "<adr-title>",
      description: "Planned ADR artifact to author before completing this task",
    },
    "plan-adrs": {
      type: "string",
      multiple: true,
      property: "plan_adrs",
      splitCommas: true,
      placeholder: "<adr-titles>",
      description: "Planned ADR artifacts (comma-separated list)",
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
      plannedGovernance:
        (input.plan_rules && input.plan_rules.length > 0) ||
        (input.plan_adrs && input.plan_adrs.length > 0)
          ? {
              rules: input.plan_rules,
              adrs: input.plan_adrs,
            }
          : undefined,
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
