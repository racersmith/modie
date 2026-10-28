/**
 * Declarative CLI command definition for `modie task complete <id> [options]` (alias: finish).
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 * Enforces ADR-6, RULE-21, RULE-22, and RULE-32.
 */

import { z } from "zod";
import {
  completeTask,
  defaultVcsAdapter,
  detectGitBranch,
  parseTaskIdFromBranch,
  type CompleteTaskResult,
} from "../../../../core/index.ts";
import {
  createCommandHandler,
  defineCommand,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export const taskCompleteSchema = z.object({
  id: z
    .string()
    .optional()
    .describe(
      "Task ID (e.g. TASK-7-1, 7-1), slug, or file path (optional when on a task branch)",
    ),
  commit: z
    .boolean()
    .optional()
    .describe(
      "Execute atomic two-phase Git commit ceremony (default in git repo)",
    ),
  noCommit: z
    .boolean()
    .default(false)
    .describe(
      "Disable automatic Git commits and only delete the artifact locally",
    ),
  force: z
    .boolean()
    .default(false)
    .describe("Force completion even if acceptance criteria remain unchecked"),
  keepFile: z
    .boolean()
    .default(false)
    .describe("Retain the task artifact file on disk instead of deleting it"),
});

export type TaskCompleteInput = z.infer<typeof taskCompleteSchema>;

export interface TaskCompleteFlags {
  commit?: boolean;
  "no-commit"?: boolean;
  force?: boolean;
  "keep-file"?: boolean;
  "no-delete"?: boolean;
  json?: boolean;
}

/**
 * Declarative definition for the `modie task complete` command.
 */
export const taskCompleteCommand: CliCommandDefinition<
  TaskCompleteFlags,
  CompleteTaskResult,
  typeof taskCompleteSchema
> = defineCommand({
  id: "task_complete",
  name: "complete",
  usage: "modie task complete [id-or-path] [options] (alias: finish)",
  description:
    "Verify criteria and delete completed task artifact (alias: finish)",
  agentGuidance:
    "Call this tool only when all acceptance criteria are satisfied, all planned governance artifacts (rules/ADRs) are authored and verified on disk, and tests pass. Executes the atomic two-phase commit ceremony and deletes the ephemeral task file per RULE-21 and ADR-6.\n\n" +
    "EPHEMERAL TASK INVARIANT: Once a task is completed, it is permanently deleted. Never leave test headers or code comments citing this completed task ID (cite durable RULEs or ADRs instead).",
  helpUsage: "modie task complete --help",
  schema: taskCompleteSchema,
  positionals: [
    {
      name: "id-or-path",
      property: "id",
      description:
        "Task ID (e.g. TASK-7-1, 7-1), slug, or file path (optional when on a task branch)",
      required: false,
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
      property: "noCommit",
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
      property: "keepFile",
    },
  },
  execute: async (input, context) => {
    const isGitRepo = await defaultVcsAdapter.isInsideWorkTree(context.cwd);
    const commit = input.noCommit
      ? false
      : input.commit !== undefined
        ? input.commit
        : isGitRepo;
    const deleteArtifact = !input.keepFile;

    const idToComplete = input.id?.trim();
    if (!idToComplete) {
      const branch = await detectGitBranch(context.cwd);
      const inferredId = parseTaskIdFromBranch(branch);
      if (!inferredId) {
        const branchDisplay = branch ? ` "${branch}"` : "";
        throw new Error(
          `Error: Missing required task identifier and current git branch${branchDisplay} is not a task branch (expected "task/<id>-<slug>"). Usage: modie task complete [id-or-path] [options]`,
        );
      }
    }

    return completeTask(input.id, {
      force: input.force,
      deleteArtifact,
      commit,
      cwd: context.cwd,
    });
  },
  render: (result, context) => {
    context.stdout(result.filepath);

    const deletionNotice = result.deleted
      ? " (artifact deleted)"
      : " (artifact retained)";
    context.stderr(
      `✓ Completed task TASK-${result.taskId}: ${result.filename}${deletionNotice}`,
    );

    if (result.commits?.phase1) {
      context.stderr(
        `  Phase 1 commit (verified criteria): ${result.commits.phase1}`,
      );
    } else if (result.commits?.phase2) {
      context.stderr(
        `  Phase 1 commit (verified criteria): (skipped - working tree already clean)`,
      );
    }
    if (result.commits?.phase2) {
      context.stderr(
        `  Phase 2 commit (artifact deletion): ${result.commits.phase2}`,
      );
    }
  },
  renderJson: (result, context) => {
    context.stdout(JSON.stringify(result, null, 2));

    const deletionNotice = result.deleted
      ? " (artifact deleted)"
      : " (artifact retained)";
    context.stderr(
      `✓ Completed task TASK-${result.taskId} (${result.filename})${deletionNotice}`,
    );
  },
});

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
