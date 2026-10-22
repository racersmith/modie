/**
 * Declarative CLI command definition for `modie task check <id> --item <index> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { checkTaskItem, type CheckTaskItemResult } from "../../../../core/index.ts";
import {
  createCommandHandler,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export interface TaskCheckFlags {
  item?: string;
  index?: string;
  uncheck?: boolean;
}

/**
 * Declarative definition for the `modie task check` command.
 */
export const taskCheckCommand: CliCommandDefinition<
  TaskCheckFlags,
  CheckTaskItemResult
> = {
  name: "check",
  usage: "modie task check <id-or-path> [options]",
  description: "Check or uncheck an acceptance criteria item",
  helpUsage: "modie task check --help",
  positionals: [
    {
      name: "id-or-path",
      description: "Task ID (e.g. TASK-7-1, 7-1), slug, or file path",
      required: true,
      missingError:
        "Error: Missing required task identifier. Usage: modie task check <id-or-path> --item <index>",
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
  run: async (context) => {
    const taskIdentifier = context.positionals[0]!;
    const rawItem = context.flags.item;

    if (rawItem === undefined) {
      throw new Error(
        "Missing required --item flag. Usage: modie task check <id-or-path> --item <index>",
      );
    }

    const itemIndex = parseInt(String(rawItem), 10);
    if (isNaN(itemIndex) || itemIndex < 1) {
      throw new Error(
        `Invalid item index "${rawItem}". Must be a positive integer (1-based index).`,
      );
    }

    const completed = !context.flags.uncheck;

    return checkTaskItem(taskIdentifier, itemIndex, {
      completed,
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
};

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
