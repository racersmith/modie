/**
 * Declarative CLI command definition for `modie task complete <id> [options]` (alias: finish).
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 * Enforces ADR-6, RULE-21, RULE-22, and RULE-32.
 */

import {
  completeTask,
  runGit,
  type CompleteTaskResult,
} from "../../../../core/index.ts";
import {
  createCommandHandler,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export interface TaskCompleteFlags {
  commit?: boolean;
  "no-commit"?: boolean;
  force?: boolean;
  "keep-file"?: boolean;
  "no-delete"?: boolean;
  json?: boolean;
}

function renderCompletionStatus(
  result: CompleteTaskResult,
  stderr: (msg: string) => void,
): void {
  const deletionNotice = result.deleted
    ? " (artifact deleted)"
    : " (artifact retained)";
  stderr(
    `✓ Completed task TASK-${result.taskId}: ${result.filename}${deletionNotice}`,
  );

  if (result.commits?.phase1) {
    stderr(`  Phase 1 commit (verified criteria): ${result.commits.phase1}`);
  } else if (result.commits?.phase2) {
    stderr(
      `  Phase 1 commit (verified criteria): (skipped - working tree already clean)`,
    );
  }
  if (result.commits?.phase2) {
    stderr(`  Phase 2 commit (artifact deletion): ${result.commits.phase2}`);
  }
}

/**
 * Declarative definition for the `modie task complete` command.
 */
export const taskCompleteCommand: CliCommandDefinition<
  TaskCompleteFlags,
  CompleteTaskResult
> = {
  name: "complete",
  usage: "modie task complete <id-or-path> [options] (alias: finish)",
  description: "Verify criteria and delete completed task",
  helpUsage: "modie task complete --help",
  positionals: [
    {
      name: "id-or-path",
      description: "Task ID (e.g. TASK-7-1, 7-1), slug, or file path",
      required: true,
      missingError:
        "Error: Missing required task identifier. Usage: modie task complete <id-or-path> [options]",
    },
  ],
  flags: {
    commit: {
      type: "boolean",
      short: "c",
      description:
        "Execute atomic two-phase Git commit ceremony (default in git repo)",
    },
    "no-commit": {
      type: "boolean",
      description:
        "Disable automatic Git commits and only delete the artifact locally",
    },
    force: {
      type: "boolean",
      short: "f",
      description:
        "Force completion even if acceptance criteria remain unchecked",
    },
    "keep-file": {
      type: "boolean",
      description:
        "Retain the task artifact file on disk instead of deleting it",
      aliases: ["no-delete"],
    },
  },
  run: async (context) => {
    const taskIdentifier = context.positionals[0]!;
    const force = Boolean(context.flags.force);
    const deleteArtifact = !Boolean(
      context.flags["keep-file"] || context.flags["no-delete"],
    );

    const isGitRepo =
      (await runGit(["rev-parse", "--is-inside-work-tree"], context.cwd)) ===
      "true";
    const noCommit = Boolean(context.flags["no-commit"]);
    const commit = noCommit ? false : Boolean(context.flags.commit || isGitRepo);

    return completeTask(taskIdentifier, {
      force,
      deleteArtifact,
      commit,
      cwd: context.cwd,
    });
  },
  render: (result, context) => {
    context.stdout(result.filepath);
    renderCompletionStatus(result, context.stderr);
  },
  renderJson: (result, context) => {
    context.stdout(JSON.stringify(result, null, 2));
    renderCompletionStatus(result, context.stderr);
  },
};

/**
 * CLI command handler for `modie task complete`.
 */
export const handleTaskComplete: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(taskCompleteCommand);

/**
 * Prints usage instructions for `modie task complete`.
 */
export function printTaskCompleteHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(taskCompleteCommand));
}
