/**
 * Declarative CLI command definition for `modie task start <id> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 * Enforces RULE-28 and ADR-9.
 */

import {
  startTaskBranch,
  type StartTaskBranchResult,
} from "../../../../core/index.ts";
import {
  createCommandHandler,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export interface TaskStartFlags {
  base?: string;
  force?: boolean;
  json?: boolean;
}

/**
 * Declarative definition for the `modie task start` command.
 */
export const taskStartCommand: CliCommandDefinition<
  TaskStartFlags,
  StartTaskBranchResult
> = {
  name: "start",
  usage: "modie task start <id-or-path> [options]",
  description: "Create and checkout a hierarchical task branch",
  helpUsage: "modie task start --help",
  positionals: [
    {
      name: "id-or-path",
      description: "Task ID (e.g. TASK-11, 11-1), slug, or file path",
      required: true,
      missingError:
        "Error: Missing required task identifier. Usage: modie task start <id-or-path> [options]",
    },
  ],
  flags: {
    base: {
      type: "string",
      short: "b",
      placeholder: "<branch>",
      description:
        "Base branch to branch from (default: parent task branch or trunk)",
    },
    force: {
      type: "boolean",
      short: "f",
      description: "Bypass branch protection checks",
    },
  },
  run: async (context) => {
    const taskIdentifier = context.positionals[0]!;
    const base = context.flags.base ? String(context.flags.base) : undefined;
    const force = Boolean(context.flags.force);

    return startTaskBranch(taskIdentifier, {
      base,
      force,
      cwd: context.cwd,
    });
  },
  render: (result, context) => {
    context.stdout(result.branchName);

    const action = result.created ? "created and checked out" : "checked out";
    context.stderr(
      `✓ Switched to branch "${result.branchName}" (${action} from ${result.baseBranch})`,
    );
  },
  renderJson: (result, context) => {
    context.stdout(JSON.stringify(result, null, 2));

    const action = result.created ? "created and checked out" : "checked out";
    context.stderr(
      `✓ Switched to branch "${result.branchName}" (${action} from ${result.baseBranch})`,
    );
  },
};

/**
 * CLI command handler for `modie task start`.
 */
export const handleTaskStart: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(taskStartCommand);

/**
 * Prints usage instructions for `modie task start`.
 */
export function printTaskStartHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(taskStartCommand));
}
