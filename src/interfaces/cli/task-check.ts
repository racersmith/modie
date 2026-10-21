/**
 * CLI command handler for `modie task check <id> --item <index> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { checkTaskItem } from "../../core/index.ts";
import type { CliIoOptions } from "./types.ts";

/**
 * Prints usage instructions for `modie task check`.
 */
export function printTaskCheckHelp(stderr: (msg: string) => void): void {
  stderr(`Usage: modie task check <id-or-path> [options]

Arguments:
  <id-or-path>            Task ID (e.g. TASK-7-1, 7-1), slug, or file path

Options:
  -i, --item <index>      1-based index of the acceptance criteria item (required)
  -u, --uncheck           Uncheck the item (mark incomplete)
      --json              Emit machine-parsable JSON payload to stdout (RULE-27)
  -h, --help              Show this help message
`);
}

/**
 * Handles argument parsing and execution for `canon task check`.
 */
export async function handleTaskCheck(args: string[], options: CliIoOptions = {}): Promise<number> {
  const stdout = options.stdout ?? ((msg: string) => process.stdout.write(msg + "\n"));
  const stderr = options.stderr ?? ((msg: string) => process.stderr.write(msg + "\n"));
  const cwd = options.cwd ?? process.cwd();

  let taskIdentifier: string | undefined;
  let itemIndex: number | undefined;
  let completed = true;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (arg === "-h" || arg === "--help") {
      printTaskCheckHelp(stderr);
      return 0;
    }

    if (arg === "-i" || arg === "--item" || arg === "--index") {
      const val = args[++i];
      if (!val) {
        stderr("Error: Missing argument for --item flag.");
        return 1;
      }
      const parsed = parseInt(val, 10);
      if (isNaN(parsed) || parsed < 1) {
        stderr(`Error: Invalid item index "${val}". Must be a positive integer (1-based index).`);
        return 1;
      }
      itemIndex = parsed;
      continue;
    }

    if (arg === "-u" || arg === "--uncheck") {
      completed = false;
      continue;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg.startsWith("-")) {
      stderr(`Error: Unknown flag "${arg}". Run 'modie task check --help' for usage.`);
      return 1;
    }

    if (!taskIdentifier) {
      taskIdentifier = arg;
    } else {
      stderr(`Error: Unexpected additional argument "${arg}".`);
      return 1;
    }
  }

  if (!taskIdentifier) {
    stderr("Error: Missing required task identifier. Usage: modie task check <id-or-path> --item <index>");
    return 1;
  }

  if (itemIndex === undefined) {
    stderr("Error: Missing required --item flag. Usage: modie task check <id-or-path> --item <index>");
    return 1;
  }

  try {
    const result = await checkTaskItem(taskIdentifier, itemIndex, {
      completed,
      cwd,
    });

    if (json) {
      stdout(JSON.stringify(result, null, 2));
    } else {
      stdout(result.filepath);
    }

    const action = completed ? "Checked" : "Unchecked";
    const statusIcon = completed ? "✓" : "○";
    stderr(
      `${statusIcon} ${action} item ${result.itemIndex} on TASK-${result.taskId}: "${result.itemText}" (${result.completedCount}/${result.totalItems} complete)`,
    );

    if (result.allCompleted) {
      stderr(`✓ All acceptance criteria for TASK-${result.taskId} are satisfied!`);
    }

    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Error: ${message}`);
    return 1;
  }
}
