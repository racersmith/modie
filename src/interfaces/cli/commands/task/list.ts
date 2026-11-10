/**
 * Declarative CLI command definition for `modie task list [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { z } from "zod";
import { queryTaskQueue, type TaskQueueItem } from "../../../../core/index.ts";
import {
  defineCommand,
  formatAlignedTable,
  type CliCommandDefinition,
} from "../../framework/index.ts";

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

/**
 * Formats task queue items into a human-readable aligned table.
 */
export function renderTaskQueueTable(tasks: TaskQueueItem[]): string {
  const formatStatus = (t: TaskQueueItem): string => {
    if (t.isCurrent) {
      return t.readiness === "BLOCKED" ? "CURRENT (BLOCKED)" : "CURRENT";
    }
    return t.readiness;
  };

  return formatAlignedTable(tasks, [
    { header: "ID", minWidth: 8, value: (t) => t.fullTaskId },
    { header: "STATUS", minWidth: 9, value: formatStatus },
    {
      header: "PROGRESS",
      minWidth: 10,
      value: (t) =>
        t.allCriteriaSatisfied
          ? `${t.criteriaProgress} ✓`
          : t.criteriaProgress,
    },
    {
      header: "BLOCKED BY",
      minWidth: 12,
      value: (t) => (t.blockedBy.length > 0 ? t.blockedBy.join(", ") : "-"),
    },
    { header: "TITLE / SLUG", separatorWidth: 24, value: (t) => t.slug },
  ]);
}

/**
 * Declarative definition for the `modie task list` command.
 */
export const taskListCommand: CliCommandDefinition<
  Record<string, any>,
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
      short: "r",
    },
    blocked: {
      short: "b",
    },
    scope: {
      placeholder: "<path>",
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
  render: (tasks, context, input) => {
    const readyOnly = Boolean(input?.ready ?? context.flags.ready);
    const blockedOnly = Boolean(input?.blocked ?? context.flags.blocked);

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
});
