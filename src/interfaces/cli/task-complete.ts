/**
 * CLI command handler for `canon task complete <id> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 * Enforces RULE-21 and RULE-22.
 */

import { completeTask } from "../../core/index.ts";
import type { CliIoOptions } from "./types.ts";

/**
 * Prints usage instructions for `canon task complete`.
 */
export function printTaskCompleteHelp(stderr: (msg: string) => void): void {
  stderr(`Usage: canon task complete <id-or-path> [options]

Arguments:
  <id-or-path>            Task ID (e.g. TASK-7-1, 7-1), slug, or file path

Options:
  -f, --force             Force completion even if acceptance criteria remain unchecked
      --keep-file         Retain the task artifact file on disk instead of deleting it
      --json              Emit machine-parsable JSON payload to stdout (RULE-27)
  -h, --help              Show this help message
`);
}

/**
 * Handles argument parsing and execution for `canon task complete`.
 */
export async function handleTaskComplete(args: string[], options: CliIoOptions = {}): Promise<number> {
  const stdout = options.stdout ?? ((msg: string) => process.stdout.write(msg + "\n"));
  const stderr = options.stderr ?? ((msg: string) => process.stderr.write(msg + "\n"));
  const cwd = options.cwd ?? process.cwd();

  let taskIdentifier: string | undefined;
  let force = false;
  let deleteArtifact = true;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (arg === "-h" || arg === "--help") {
      printTaskCompleteHelp(stderr);
      return 0;
    }

    if (arg === "-f" || arg === "--force") {
      force = true;
      continue;
    }

    if (arg === "--keep-file" || arg === "--no-delete") {
      deleteArtifact = false;
      continue;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg.startsWith("-")) {
      stderr(`Error: Unknown flag "${arg}". Run 'canon task complete --help' for usage.`);
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
    stderr("Error: Missing required task identifier. Usage: canon task complete <id-or-path> [options]");
    return 1;
  }

  try {
    const result = await completeTask(taskIdentifier, {
      force,
      deleteArtifact,
      cwd,
    });

    if (json) {
      stdout(JSON.stringify(result, null, 2));
    } else {
      stdout(result.filepath);
    }

    const deletionNotice = result.deleted
      ? " (artifact deleted per RULE-21)"
      : " (artifact retained)";
    stderr(`✓ Completed task TASK-${result.taskId}: ${result.filename}${deletionNotice}`);

    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Error: ${message}`);
    return 1;
  }
}
