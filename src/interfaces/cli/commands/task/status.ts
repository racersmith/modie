/**
 * CLI command handler for `modie task status [id] [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { getTaskStatus } from "../../../../core/index.ts";
import { parseCliArgs } from "../../arg-parser.ts";
import type { CliIoOptions } from "../../types.ts";
import { handleTaskList } from "./list.ts";

/**
 * Prints usage instructions for `modie task status`.
 */
export function printTaskStatusHelp(stderr: (msg: string) => void): void {
  stderr(`Usage: modie task status [id-or-path] [options]

Inspect active task queue status or deep inspection of a specific task.

Arguments:
  [id-or-path]            Task ID (e.g. TASK-9, 9), slug, or file path (optional)

Options:
      --json              Emit machine-parsable JSON payload to stdout (RULE-27)
  -h, --help              Show this help message
`);
}

/**
 * Handles argument parsing and execution for `modie task status`.
 */
export async function handleTaskStatus(
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
    },
    helpUsage: "modie task status --help",
    stderr,
  });

  if (!parsed) {
    return 1;
  }

  if (parsed.values.help) {
    printTaskStatusHelp(stderr);
    return 0;
  }

  if (parsed.positionals.length > 1) {
    stderr(`Error: Unexpected additional argument "${parsed.positionals[1]}".`);
    return 1;
  }

  const json = Boolean(parsed.values.json);
  const taskIdentifier = parsed.positionals[0];

  // If no task identifier is passed, show the full queue status table
  if (!taskIdentifier) {
    const listArgs = json ? ["--json"] : [];
    return handleTaskList(listArgs, options);
  }

  try {
    const status = await getTaskStatus(taskIdentifier, { cwd });

    if (json) {
      stdout(JSON.stringify(status, null, 2));
      return 0;
    }

    stderr(`${status.fullTaskId}: ${status.slug}`);
    stderr(`Status:      ${status.readiness}`);
    if (status.blockedBy.length > 0) {
      stderr(`Blocked By:  ${status.blockedBy.join(", ")}`);
    }
    stderr(`Path:        ${status.relativePath}`);
    stderr(`Progress:    ${status.criteriaProgress} criteria satisfied`);
    if (status.depends_on.length > 0) {
      stderr(`Depends On:  ${status.depends_on.join(", ")}`);
    } else {
      stderr(`Depends On:  (none)`);
    }
    if (status.links.length > 0) {
      stderr(`Links:       ${status.links.join(", ")}`);
    }

    if (status.context) {
      stderr(`\nContext:\n  ${status.context}`);
    }

    if (status.acceptanceCriteria.length > 0) {
      stderr(`\nAcceptance Criteria:`);
      status.acceptanceCriteria.forEach((c, idx) => {
        const box = c.completed ? "[x]" : "[ ]";
        stderr(`  ${idx + 1}. ${box} ${c.text}`);
      });
    }

    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Error: ${message}`);
    return 1;
  }
}
