/**
 * Declarative CLI command definition for `modie task check <id> --item <index> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { z } from "zod";
import {
  checkTaskItem,
  detectGitBranch,
  parseTaskIdFromBranch,
  type CheckTaskItemResult,
} from "../../../../core/index.ts";
import {
  createCommandHandler,
  defineCommand,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export const taskCheckSchema = z.object({
  id: z
    .string()
    .optional()
    .describe("Task ID (e.g. TASK-7-1, 7-1), slug, or file path (optional when on a task branch)"),
  item: z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === "") return undefined;
      const n = Number(val);
      return isNaN(n) ? val : n;
    },
    z
      .number()
      .int("Item index must be a positive integer (1-based index)")
      .positive("Item index must be a positive integer (1-based index)")
      .describe("1-based index of the acceptance criteria item (required)"),
  ),
  uncheck: z
    .boolean()
    .default(false)
    .describe("Uncheck the item (mark incomplete)"),
});

export type TaskCheckInput = z.infer<typeof taskCheckSchema>;

export interface TaskCheckFlags {
  item?: string;
  index?: string;
  uncheck?: boolean;
  json?: boolean;
}

/**
 * Declarative definition for the `modie task check` command.
 */
export const taskCheckCommand: CliCommandDefinition<
  TaskCheckFlags,
  CheckTaskItemResult,
  typeof taskCheckSchema
> = defineCommand({
  id: "task_check",
  name: "check",
  usage: "modie task check [id-or-path] --item <index> [options]",
  description: "Check or uncheck an acceptance criteria item",
  agentGuidance:
    "Call this tool to mark an acceptance criteria item as completed (or incomplete). All checklist items must be satisfied before completing a task.",
  helpUsage: "modie task check --help",
  schema: taskCheckSchema,
  positionals: [
    {
      name: "id-or-path",
      property: "id",
      description: "Task ID (e.g. TASK-7-1, 7-1), slug, or file path (optional when on a task branch)",
      required: false,
    },
  ],
  flags: {
    item: {
      type: "string",
      short: "i",
      placeholder: "<index>",
      description: "1-based index of the acceptance criteria item (required)",
      aliases: ["index"],
    },
    uncheck: {
      type: "boolean",
      short: "u",
      description: "Uncheck the item (mark incomplete)",
    },
  },
  execute: async (input, context) => {
    const idToCheck = input.id?.trim();
    if (!idToCheck) {
      const branch = await detectGitBranch(context.cwd);
      const inferredId = parseTaskIdFromBranch(branch);
      if (!inferredId) {
        const branchDisplay = branch ? ` "${branch}"` : "";
        throw new Error(
          `Error: Missing required task identifier and current git branch${branchDisplay} is not a task branch (expected "task/<id>-<slug>"). Usage: modie task check [id-or-path] --item <index>`,
        );
      }
    }

    return checkTaskItem(input.id, input.item, {
      completed: !input.uncheck,
      cwd: context.cwd,
    });
  },
  render: (result, context) => {
    context.stdout(result.filepath);

    const completed = result.completed;
    const action = completed ? "Checked" : "Unchecked";
    const statusIcon = completed ? "✓" : "○";
    context.stderr(
      `${statusIcon} ${action} item ${result.itemIndex} on TASK-${result.taskId}: "${result.itemText}" (${result.completedCount}/${result.totalItems} complete)`,
    );

    if (result.allCompleted) {
      context.stderr(
        `✓ All acceptance criteria for TASK-${result.taskId} are satisfied!`,
      );
    }
  },
  renderJson: (result, context) => {
    context.stdout(JSON.stringify(result, null, 2));

    const completed = result.completed;
    const action = completed ? "Checked" : "Unchecked";
    const statusIcon = completed ? "✓" : "○";
    context.stderr(
      `${statusIcon} ${action} item ${result.itemIndex} on TASK-${result.taskId}: "${result.itemText}" (${result.completedCount}/${result.totalItems} complete)`,
    );

    if (result.allCompleted) {
      context.stderr(
        `✓ All acceptance criteria for TASK-${result.taskId} are satisfied!`,
      );
    }
  },
});

/**
 * CLI command handler for `modie task check`.
 */
export const handleTaskCheck: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(taskCheckCommand);

/**
 * Prints usage instructions for `modie task check`.
 */
export function printTaskCheckHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(taskCheckCommand));
}
