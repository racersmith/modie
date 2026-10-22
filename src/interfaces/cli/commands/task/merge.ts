/**
 * Declarative CLI command definition for `modie task merge <id> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 * Enforces RULE-28 and ADR-9.
 */

import {
  mergeTaskBranch,
  type MergeTaskBranchResult,
} from "../../../../core/index.ts";
import {
  createCommandHandler,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export interface TaskMergeFlags {
  target?: string;
  "keep-branch"?: boolean;
  force?: boolean;
  json?: boolean;
}

function renderMergeStatus(
  result: MergeTaskBranchResult,
  stderr: (msg: string) => void,
): void {
  const deletionNotice = result.deletedSourceBranch
    ? `and deleted branch "${result.sourceBranch}"`
    : `retaining branch "${result.sourceBranch}"`;
  stderr(
    `✓ Merged task branch "${result.sourceBranch}" into "${result.targetBranch}" (${deletionNotice})`,
  );
}

/**
 * Declarative definition for the `modie task merge` command.
 */
export const taskMergeCommand: CliCommandDefinition<
  TaskMergeFlags,
  MergeTaskBranchResult
> = {
  name: "merge",
  usage: "modie task merge <id-or-path> [options]",
  description: "Merge completed task branch back into parent or trunk",
  helpUsage: "modie task merge --help",
  positionals: [
    {
      name: "id-or-path",
      description: "Task ID (e.g. TASK-11, 11-1), slug, or file path",
      required: true,
      missingError:
        "Error: Missing required task identifier. Usage: modie task merge <id-or-path> [options]",
    },
  ],
  flags: {
    target: {
      type: "string",
      short: "t",
      placeholder: "<branch>",
      description:
        "Target branch to merge into (default: parent branch or trunk)",
    },
    "keep-branch": {
      type: "boolean",
      description:
        "Retain the task branch after merging instead of deleting it",
    },
    force: {
      type: "boolean",
      short: "f",
      description:
        "Bypass completion verification and protected branch guards",
    },
  },
  run: async (context) => {
    const taskIdentifier = context.positionals[0]!;
    const target = context.flags.target
      ? String(context.flags.target)
      : undefined;
    const keepBranch = Boolean(context.flags["keep-branch"]);
    const force = Boolean(context.flags.force);

    return mergeTaskBranch(taskIdentifier, {
      target,
      keepBranch,
      force,
      cwd: context.cwd,
    });
  },
  render: (result, context) => {
    context.stdout(result.targetBranch);
    renderMergeStatus(result, context.stderr);
  },
  renderJson: (result, context) => {
    context.stdout(JSON.stringify(result, null, 2));
    renderMergeStatus(result, context.stderr);
  },
};

/**
 * CLI command handler for `modie task merge`.
 */
export const handleTaskMerge: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(taskMergeCommand);

/**
 * Prints usage instructions for `modie task merge`.
 */
export function printTaskMergeHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(taskMergeCommand));
}
