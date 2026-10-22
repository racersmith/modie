/**
 * CLI command handler for `modie task list [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { queryTaskQueue, type TaskQueueItem } from "../../../../core/index.ts";
import { parseCliArgs } from "../../arg-parser.ts";
import type { CliIoOptions } from "../../types.ts";

/**
 * Prints usage instructions for `modie task list`.
 */
export function printTaskListHelp(stderr: (msg: string) => void): void {
  stderr(`Usage: modie task list [options]

List active tasks in the working tree with DAG dependency readiness and progress.

Options:
  -r, --ready             Show only unblocked tasks ready for execution
  -b, --blocked           Show only tasks blocked by pending dependencies
      --scope <path>      Filter tasks located within specified directory scope
      --json              Emit machine-parsable JSON payload to stdout (RULE-27)
  -h, --help              Show this help message
`);
}

/**
 * Formats task queue items into a human-readable aligned table.
 */
export function renderTaskQueueTable(tasks: TaskQueueItem[]): string {
  if (tasks.length === 0) {
    return "";
  }

  const idColWidth = Math.max(
    8,
    ...tasks.map((t) => t.fullTaskId.length),
  );
  const statusColWidth = 9; // "BLOCKED" is 7
  const progressColWidth = Math.max(
    10,
    ...tasks.map((t) => t.criteriaProgress.length),
  );
  const blockedColWidth = Math.max(
    12,
    ...tasks.map((t) => (t.blockedBy.length > 0 ? t.blockedBy.join(", ").length : 1)),
  );

  const header = `${"ID".padEnd(idColWidth)}  ${"STATUS".padEnd(statusColWidth)}  ${"PROGRESS".padEnd(progressColWidth)}  ${"BLOCKED BY".padEnd(blockedColWidth)}  TITLE / SLUG`;
  const separator = `${"-".repeat(idColWidth)}  ${"-".repeat(statusColWidth)}  ${"-".repeat(progressColWidth)}  ${"-".repeat(blockedColWidth)}  ${"-".repeat(24)}`;

  const rows = tasks.map((t) => {
    const id = t.fullTaskId.padEnd(idColWidth);
    const status = t.readiness.padEnd(statusColWidth);
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
 * Handles argument parsing and execution for `modie task list`.
 */
export async function handleTaskList(
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
      ready: { type: "boolean", short: "r" },
      blocked: { type: "boolean", short: "b" },
      scope: { type: "string" },
    },
    helpUsage: "modie task list --help",
    stderr,
  });

  if (!parsed) {
    return 1;
  }

  if (parsed.values.help) {
    printTaskListHelp(stderr);
    return 0;
  }

  if (parsed.positionals.length > 0) {
    stderr(`Error: Unexpected argument "${parsed.positionals[0]}".`);
    return 1;
  }

  const readyOnly = Boolean(parsed.values.ready);
  const blockedOnly = Boolean(parsed.values.blocked);
  const json = Boolean(parsed.values.json);
  const scope = parsed.values.scope as string | undefined;

  try {
    const tasks = await queryTaskQueue({
      cwd,
      readyOnly,
      blockedOnly,
      scope,
    });

    if (json) {
      stdout(JSON.stringify(tasks, null, 2));
      return 0;
    }

    if (tasks.length === 0) {
      if (readyOnly) {
        stderr("No ready tasks found in active queue.");
      } else if (blockedOnly) {
        stderr("No blocked tasks found in active queue.");
      } else {
        stderr("Active task queue is empty. No pending tasks found on disk.");
      }
      return 0;
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

    stderr(`Active Task Queue${filterSummary}:\n`);
    stderr(renderTaskQueueTable(tasks));

    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Error: ${message}`);
    return 1;
  }
}
