/**
 * CLI command handler for `modie task merge <id> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 * Enforces RULE-28 and ADR-9.
 */

import { mergeTaskBranch } from "../../../../core/index.ts";
import { parseCliArgs } from "../../arg-parser.ts";
import type { CliIoOptions } from "../../types.ts";

/**
 * Prints usage instructions for `modie task merge`.
 */
export function printTaskMergeHelp(stderr: (msg: string) => void): void {
  stderr(`Usage: modie task merge <id-or-path> [options]

Arguments:
  <id-or-path>            Task ID (e.g. TASK-11, 11-1), slug, or file path

Options:
  -t, --target <branch>   Target branch to merge into (default: parent branch or trunk)
      --keep-branch       Retain the task branch after merging instead of deleting it
  -f, --force             Bypass completion verification and protected branch guards
      --json              Emit machine-parsable JSON payload to stdout (RULE-27)
  -h, --help              Show this help message
`);
}

/**
 * Handles argument parsing and execution for `modie task merge`.
 */
export async function handleTaskMerge(
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
      target: { type: "string", short: "t" },
      "keep-branch": { type: "boolean" },
      force: { type: "boolean", short: "f" },
    },
    helpUsage: "modie task merge --help",
    stderr,
  });

  if (!parsed) {
    return 1;
  }

  if (parsed.values.help) {
    printTaskMergeHelp(stderr);
    return 0;
  }

  if (parsed.positionals.length === 0) {
    stderr(
      "Error: Missing required task identifier. Usage: modie task merge <id-or-path> [options]",
    );
    return 1;
  }

  if (parsed.positionals.length > 1) {
    stderr(`Error: Unexpected additional argument "${parsed.positionals[1]}".`);
    return 1;
  }

  const taskIdentifier = parsed.positionals[0]!;
  const target = parsed.values.target ? String(parsed.values.target) : undefined;
  const keepBranch = Boolean(parsed.values["keep-branch"]);
  const force = Boolean(parsed.values.force);
  const json = Boolean(parsed.values.json);

  try {
    const result = await mergeTaskBranch(taskIdentifier, {
      target,
      keepBranch,
      force,
      cwd,
    });

    if (json) {
      stdout(JSON.stringify(result, null, 2));
    } else {
      stdout(result.targetBranch);
    }

    const deletionNotice = result.deletedSourceBranch
      ? `and deleted branch "${result.sourceBranch}"`
      : `retaining branch "${result.sourceBranch}"`;
    stderr(
      `✓ Merged task branch "${result.sourceBranch}" into "${result.targetBranch}" (${deletionNotice})`,
    );

    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Error: ${message}`);
    return 1;
  }
}
