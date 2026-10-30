/**
 * Declarative CLI command definition for `modie task list [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { z } from "zod";
import { queryTaskQueue, type TaskQueueItem } from "../../../../core/index.ts";
import {
  createCommandHandler,
  defineCommand,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export const taskListSchema = z.object({
  ready: z
    .boolean()
    .default(false)
    .describe("Show only unblocked tasks ready for execution"),
  blocked: z
    .boolean()
    .default(false)
    .describe("Show only tasks blocked by pending dependencies"),
  scope: z
    .string()
    .optional()
    .describe("Filter tasks located within specified directory scope"),
});

export type TaskListInput = z.infer<typeof taskListSchema>;

export interface TaskListFlags {
  ready?: boolean;
  blocked?: boolean;
  scope?: string;
  json?: boolean;
}

/**
 * Formats task queue items into a human-readable aligned table.
 */
export function renderTaskQueueTable(tasks: TaskQueueItem[]): string {
  if (tasks.length === 0) {
    return "";
  }

  const formatStatus = (t: TaskQueueItem): string => {
    if (t.isCurrent) {
      return t.readiness === "BLOCKED" ? "CURRENT (BLOCKED)" : "CURRENT";
    }
    return t.readiness;
  };

  const idColWidth = Math.max(8, ...tasks.map((t) => t.fullTaskId.length));
  const statusColWidth = Math.max(
    9,
    ...tasks.map((t) => formatStatus(t).length),
  );
  const progressColWidth = Math.max(
    10,
    ...tasks.map((t) => t.criteriaProgress.length),
  );
  const blockedColWidth = Math.max(
    12,
    ...tasks.map((t) =>
      t.blockedBy.length > 0 ? t.blockedBy.join(", ").length : 1,
    ),
  );

  const header = `${"ID".padEnd(idColWidth)}  ${"STATUS".padEnd(statusColWidth)}  ${"PROGRESS".padEnd(progressColWidth)}  ${"BLOCKED BY".padEnd(blockedColWidth)}  TITLE / SLUG`;
  const separator = `${"-".repeat(idColWidth)}  ${"-".repeat(statusColWidth)}  ${"-".repeat(progressColWidth)}  ${"-".repeat(blockedColWidth)}  ${"-".repeat(24)}`;

  const rows = tasks.map((t) => {
    const id = t.fullTaskId.padEnd(idColWidth);
    const status = formatStatus(t).padEnd(statusColWidth);
    const progressText = t.allCriteriaSatisfied
      ? `${t.criteriaProgress} ✓`
      : t.criteriaProgress;
    const progress = progressText.padEnd(progressColWidth);
    const blockedStr = t.blockedBy.length > 0 ? t.blockedBy.join(", ") : "-";
    const blocked = blockedStr.padEnd(blockedColWidth);
    const slug = t.slug;

    return `${id}  ${status}  ${progress}  ${blocked}  ${slug}`;
  });

  return [header, separator, ...rows].join("\n");
}

/**
 * Declarative definition for the `modie task list` command.
 */
export const taskListCommand: CliCommandDefinition<
  TaskListFlags,
  TaskQueueItem[],
  typeof taskListSchema
> = defineCommand({
  id: "task_list",
  namespace: "task",
  name: "list",
  aliases: ["ls", "backlog"],
  rootAliases: ["backlog"],
  summaryUsage: "[options]",
  usage: "modie task list [options]",
  description: "List active tasks with DAG readiness and progress",
  agentGuidance:
    "Call this tool to inspect active tasks in the repository DAG. Filter by ready: true to discover unblocked tasks ready for execution.",
  helpUsage: "modie task list --help",
  schema: taskListSchema,
  positionals: [],
  flags: {
    ready: {
      type: "boolean",
      short: "r",
      description: "Show only unblocked tasks ready for execution",
    },
    blocked: {
      type: "boolean",
      short: "b",
      description: "Show only tasks blocked by pending dependencies",
    },
    scope: {
      type: "string",
      placeholder: "<path>",
      description: "Filter tasks located within specified directory scope",
    },
  },
  execute: async (input, context) => {
    return queryTaskQueue({
      cwd: context.cwd,
      readyOnly: input.ready,
      blockedOnly: input.blocked,
      scope: input.scope,
    });
  },
  render: (tasks, context) => {
    const readyOnly = Boolean(context.flags.ready);
    const blockedOnly = Boolean(context.flags.blocked);

    if (tasks.length === 0) {
      if (readyOnly) {
        context.stderr("No ready tasks found in active queue.");
      } else if (blockedOnly) {
        context.stderr("No blocked tasks found in active queue.");
      } else {
        context.stderr(
          "Active task queue is empty. No pending tasks found on disk.",
        );
      }
      return;
    }

    const readyCount = tasks.filter((t) => t.readiness === "READY").length;
    const blockedCount = tasks.filter((t) => t.readiness === "BLOCKED").length;

    let filterSummary = "";
    if (readyOnly) {
      filterSummary = ` (${tasks.length} ready)`;
    } else if (blockedOnly) {
      filterSummary = ` (${tasks.length} blocked)`;
    } else {
      filterSummary = ` (${tasks.length} task${tasks.length === 1 ? "" : "s"}: ${readyCount} ready, ${blockedCount} blocked)`;
    }

    context.stderr(`Active Task Queue${filterSummary}:\n`);
    context.stderr(renderTaskQueueTable(tasks));
  },
  renderJson: (tasks, context) => {
    context.stdout(JSON.stringify(tasks, null, 2));
  },
});

/**
 * CLI command handler for `modie task list`.
 */
export const handleTaskList: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(taskListCommand);

/**
 * Prints usage instructions for `modie task list`.
 */
export function printTaskListHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(taskListCommand));
}
