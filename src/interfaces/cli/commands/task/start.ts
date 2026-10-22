/**
 * CLI command handler for `modie task start <id> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 * Enforces RULE-28 and ADR-9.
 */

import { startTaskBranch } from "../../../../core/index.ts";
import { parseCliArgs } from "../../arg-parser.ts";
import type { CliIoOptions } from "../../types.ts";

/**
 * Prints usage instructions for `modie task start`.
 */
export function printTaskStartHelp(stderr: (msg: string) => void): void {
  stderr(`Usage: modie task start <id-or-path> [options]

Arguments:
  <id-or-path>            Task ID (e.g. TASK-11, 11-1), slug, or file path

Options:
  -b, --base <branch>     Base branch to branch from (default: parent task branch or trunk)
  -f, --force             Bypass branch protection checks
      --json              Emit machine-parsable JSON payload to stdout (RULE-27)
  -h, --help              Show this help message
`);
}

/**
 * Handles argument parsing and execution for `modie task start`.
 */
export async function handleTaskStart(
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
      base: { type: "string", short: "b" },
      force: { type: "boolean", short: "f" },
    },
    helpUsage: "modie task start --help",
    stderr,
  });

  if (!parsed) {
    return 1;
  }

  if (parsed.values.help) {
    printTaskStartHelp(stderr);
    return 0;
  }

  if (parsed.positionals.length === 0) {
    stderr(
      "Error: Missing required task identifier. Usage: modie task start <id-or-path> [options]",
    );
    return 1;
  }

  if (parsed.positionals.length > 1) {
    stderr(`Error: Unexpected additional argument "${parsed.positionals[1]}".`);
    return 1;
  }

  const taskIdentifier = parsed.positionals[0]!;
  const base = parsed.values.base ? String(parsed.values.base) : undefined;
  const force = Boolean(parsed.values.force);
  const json = Boolean(parsed.values.json);

  try {
    const result = await startTaskBranch(taskIdentifier, {
      base,
      force,
      cwd,
    });

    if (json) {
      stdout(JSON.stringify(result, null, 2));
    } else {
      stdout(result.branchName);
    }

    const action = result.created ? "created and checked out" : "checked out";
    stderr(
      `✓ Switched to branch "${result.branchName}" (${action} from ${result.baseBranch})`,
    );

    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Error: ${message}`);
    return 1;
  }
}
