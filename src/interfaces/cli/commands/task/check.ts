/**
 * CLI command handler for `modie task check <id> --item <index> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { checkTaskItem } from "../../../../core/index.ts";
import { parseCliArgs } from "../../arg-parser.ts";
import type { CliIoOptions } from "../../types.ts";

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
 * Handles argument parsing and execution for `modie task check`.
 */
export async function handleTaskCheck(
  args: string[],
  options: CliIoOptions = {},
): Promise<number> {
  const stdout =
    options.stdout ?? ((msg: string) => process.stdout.write(msg + "\n"));
  const stderr =
    options.stderr ?? ((msg: string) => process.stderr.write(msg + "\n"));
  const cwd = options.cwd ?? process.cwd();

  const parsed = parseCliArgs({
    args,
    options: {
      help: { type: "boolean", short: "h" },
      json: { type: "boolean" },
      uncheck: { type: "boolean", short: "u" },
      item: { type: "string", short: "i" },
      index: { type: "string" },
    },
    helpUsage: "modie task check --help",
    stderr,
  });

  if (!parsed) {
    return 1;
  }

  if (parsed.values.help) {
    printTaskCheckHelp(stderr);
    return 0;
  }

  if (parsed.positionals.length === 0) {
    stderr(
      "Error: Missing required task identifier. Usage: modie task check <id-or-path> --item <index>",
    );
    return 1;
  }

  if (parsed.positionals.length > 1) {
    stderr(`Error: Unexpected additional argument "${parsed.positionals[1]}".`);
    return 1;
  }

  const taskIdentifier = parsed.positionals[0]!;
  const rawItem = parsed.values.item ?? parsed.values.index;

  if (rawItem === undefined) {
    stderr(
      "Error: Missing required --item flag. Usage: modie task check <id-or-path> --item <index>",
    );
    return 1;
  }

  const itemIndex = parseInt(String(rawItem), 10);
  if (isNaN(itemIndex) || itemIndex < 1) {
    stderr(
      `Error: Invalid item index "${rawItem}". Must be a positive integer (1-based index).`,
    );
    return 1;
  }

  const completed = !parsed.values.uncheck;
  const json = Boolean(parsed.values.json);

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
      stderr(
        `✓ All acceptance criteria for TASK-${result.taskId} are satisfied!`,
      );
    }

    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Error: ${message}`);
    return 1;
  }
}
