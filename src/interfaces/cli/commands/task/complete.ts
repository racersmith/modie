/**
 * CLI command handler for `modie task complete <id> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 * Enforces RULE-21 and RULE-22.
 */

import { completeTask } from "../../../../core/index.ts";
import { parseCliArgs } from "../../arg-parser.ts";
import type { CliIoOptions } from "../../types.ts";

/**
 * Prints usage instructions for `modie task complete`.
 */
export function printTaskCompleteHelp(stderr: (msg: string) => void): void {
  stderr(`Usage: modie task complete <id-or-path> [options]

Arguments:
  <id-or-path>            Task ID (e.g. TASK-7-1, 7-1), slug, or file path

Options:
  -c, --commit            Execute atomic two-phase Git commit ceremony (ADR-6, RULE-21)
  -f, --force             Force completion even if acceptance criteria remain unchecked
      --keep-file         Retain the task artifact file on disk instead of deleting it
      --json              Emit machine-parsable JSON payload to stdout (RULE-27)
  -h, --help              Show this help message
`);
}

/**
 * Handles argument parsing and execution for `modie task complete`.
 */
export async function handleTaskComplete(
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
      commit: { type: "boolean", short: "c" },
      force: { type: "boolean", short: "f" },
      "keep-file": { type: "boolean" },
      "no-delete": { type: "boolean" },
    },
    helpUsage: "modie task complete --help",
    stderr,
  });

  if (!parsed) {
    return 1;
  }

  if (parsed.values.help) {
    printTaskCompleteHelp(stderr);
    return 0;
  }

  if (parsed.positionals.length === 0) {
    stderr(
      "Error: Missing required task identifier. Usage: modie task complete <id-or-path> [options]",
    );
    return 1;
  }

  if (parsed.positionals.length > 1) {
    stderr(`Error: Unexpected additional argument "${parsed.positionals[1]}".`);
    return 1;
  }

  const taskIdentifier = parsed.positionals[0]!;
  const force = Boolean(parsed.values.force);
  const deleteArtifact = !Boolean(parsed.values["keep-file"] || parsed.values["no-delete"]);
  const commit = Boolean(parsed.values.commit);
  const json = Boolean(parsed.values.json);

  try {
    const result = await completeTask(taskIdentifier, {
      force,
      deleteArtifact,
      commit,
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
    stderr(
      `✓ Completed task TASK-${result.taskId}: ${result.filename}${deletionNotice}`,
    );

    if (result.commits?.phase1) {
      stderr(`  Phase 1 commit (verified criteria): ${result.commits.phase1}`);
    }
    if (result.commits?.phase2) {
      stderr(`  Phase 2 commit (artifact deletion): ${result.commits.phase2}`);
    }

    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Error: ${message}`);
    return 1;
  }
}
