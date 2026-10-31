/**
 * Declarative CLI command definition for `modie task status [id] [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { z } from "zod";
import {
  getTaskStatus,
  queryTaskHistory,
  queryTaskQueue,
  resolveCurrentTask,
  type TaskQueueItem,
  type TaskStatusDetails,
} from "../../../../core/index.ts";
import {
  createCommandHandler,
  defineCommand,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";
import { renderTaskQueueTable } from "./list.ts";

export const taskStatusSchema = z.object({
  id: z
    .string()
    .optional()
    .describe("Task ID (e.g. TASK-9, 9), slug, or file path (optional)"),
  current: z
    .boolean()
    .default(false)
    .describe("Resolve and display current task from active git branch"),
  history: z
    .boolean()
    .default(false)
    .describe("Query completed task history and branches in Git per ADR-6"),
});

export type TaskStatusInput = z.infer<typeof taskStatusSchema>;

export interface TaskStatusFlags {
  current?: boolean;
  history?: boolean;
  json?: boolean;
}

/**
 * Declarative definition for the `modie task status` command.
 */
export const taskStatusCommand: CliCommandDefinition<
  TaskStatusFlags,
  TaskStatusDetails | TaskQueueItem[],
  typeof taskStatusSchema
> = defineCommand({
  id: "task_status",
  namespace: "task",
  name: "status",
  summaryUsage: "[id]",
  usage: "modie task status [id-or-path] [options]",
  description: "Inspect active queue or specific task status",
  agentGuidance:
    "Call this tool to inspect detailed progress, dependencies, blockers, and acceptance criteria checklist for a specific task.",
  helpUsage: "modie task status --help",
  schema: taskStatusSchema,
  positionals: [
    {
      name: "id-or-path",
      required: false,
    },
  ],
  flags: {
    current: {
      short: "c",
    },
  },
  execute: async (input, context) => {
    // 1. If explicit task identifier provided, query that task
    if (input.id) {
      return getTaskStatus(input.id, {
        cwd: context.cwd,
        history: input.history,
      });
    }

    // 2. If --current is explicitly passed, resolve current task or throw if outside task branch
    if (input.current) {
      const current = await resolveCurrentTask({
        cwd: context.cwd,
        history: input.history,
      });
      if (!current) {
        throw new Error(
          "Not on a task branch: cannot resolve current task from git branch.",
        );
      }
      return current;
    }

    // 3. If --history is explicitly passed without an ID, query historical tasks and branches
    if (input.history) {
      return queryTaskHistory({ cwd: context.cwd });
    }

    // 4. If no ID and no --current, attempt to resolve current task from active git branch
    const current = await resolveCurrentTask({ cwd: context.cwd });
    if (current) {
      return current;
    }

    // 5. Fallback to active task queue if not on a task branch
    return queryTaskQueue({ cwd: context.cwd });
  },
  render: (status, context) => {
    if (!status || typeof status === "number") return;
    if (Array.isArray(status)) {
      if (status.length === 0) {
        if (context.flags.history) {
          context.stderr(
            "No completed tasks or task branches found in Git history.",
          );
        } else {
          context.stderr("No active tasks found in working tree.");
        }
        return;
      }
      context.stdout(renderTaskQueueTable(status));
      return;
    }
    context.stderr(`${status.fullTaskId}: ${status.slug}`);
    context.stderr(`Status:      ${status.readiness}`);
    if (status.branch) {
      context.stderr(`Branch:      ${status.branch}`);
    }
    if (status.blockedBy.length > 0) {
      context.stderr(`Blocked By:  ${status.blockedBy.join(", ")}`);
    }
    context.stderr(`Path:        ${status.relativePath}`);
    context.stderr(
      `Progress:    ${status.criteriaProgress} criteria satisfied`,
    );
    if (status.depends_on.length > 0) {
      context.stderr(`Depends On:  ${status.depends_on.join(", ")}`);
    } else {
      context.stderr(`Depends On:  (none)`);
    }
    if (status.links.length > 0) {
      context.stderr(`Links:       ${status.links.join(", ")}`);
    }

    if (status.context) {
      context.stderr(`\nContext:\n  ${status.context}`);
    }

    if (status.acceptanceCriteria.length > 0) {
      context.stderr(`\nAcceptance Criteria:`);
      status.acceptanceCriteria.forEach(
        (c: { completed: boolean; text: string }, idx: number) => {
          const box = c.completed ? "[x]" : "[ ]";
          context.stderr(`  ${idx + 1}. ${box} ${c.text}`);
        },
      );
    }
  },
  renderJson: (status, context) => {
    if (!status || typeof status === "number") return;
    context.stdout(JSON.stringify(status, null, 2));
  },
});

/**
 * CLI command handler for `modie task status`.
 */
export const handleTaskStatus: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(taskStatusCommand);

/**
 * Prints usage instructions for `modie task status`.
 */
export function printTaskStatusHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(taskStatusCommand));
}
