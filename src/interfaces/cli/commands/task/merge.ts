/**
 * Declarative CLI command definition for `modie task merge <id> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 * Enforces RULE-28 and ADR-9.
 */

import { z } from "zod";
import {
  mergeTaskBranch,
  type MergeTaskBranchResult,
} from "../../../../core/index.ts";
import {
  createCommandHandler,
  defineCommand,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export const taskMergeSchema = z.object({
  id: z
    .string()
    .min(1, "Task identifier is required")
    .describe("Task ID (e.g. TASK-11, 11-1), slug, or file path"),
  target: z
    .string()
    .optional()
    .describe(
      "Target branch to merge into (default: parent branch or trunk)",
    ),
  keepBranch: z
    .boolean()
    .default(false)
    .describe(
      "Retain the task branch after merging instead of deleting it",
    ),
  force: z
    .boolean()
    .default(false)
    .describe(
      "Bypass completion verification and protected branch guards",
    ),
});

export type TaskMergeInput = z.infer<typeof taskMergeSchema>;

export interface TaskMergeFlags {
  target?: string;
  "keep-branch"?: boolean;
  force?: boolean;
  json?: boolean;
}

/**
 * Declarative definition for the `modie task merge` command.
 */
export const taskMergeCommand: CliCommandDefinition<
  TaskMergeFlags,
  MergeTaskBranchResult,
  typeof taskMergeSchema
> = defineCommand({
  id: "task_merge",
  name: "merge",
  usage: "modie task merge <id-or-path> [options]",
  description: "Merge completed task branch back into parent or trunk",
  agentGuidance:
    "Call this tool to merge a completed task branch back into its parent branch or trunk according to hierarchical task branch topology.",
  helpUsage: "modie task merge --help",
  schema: taskMergeSchema,
  positionals: [
    {
      name: "id-or-path",
      property: "id",
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
      property: "keepBranch",
    },
    force: {
      type: "boolean",
      short: "f",
      description:
        "Bypass completion verification and protected branch guards",
    },
  },
  execute: async (input, context) => {
    return mergeTaskBranch(input.id, {
      target: input.target,
      keepBranch: input.keepBranch,
      force: input.force,
      cwd: context.cwd,
    });
  },
  render: (result, context) => {
    context.stdout(result.targetBranch);

    const deletionNotice = result.deletedSourceBranch
      ? `and deleted branch "${result.sourceBranch}"`
      : `retaining branch "${result.sourceBranch}"`;
    context.stderr(
      `✓ Merged task branch "${result.sourceBranch}" into "${result.targetBranch}" (${deletionNotice})`,
    );
  },
  renderJson: (result, context) => {
    context.stdout(JSON.stringify(result, null, 2));

    const deletionNotice = result.deletedSourceBranch
      ? `and deleted branch "${result.sourceBranch}"`
      : `retaining branch "${result.sourceBranch}"`;
    context.stderr(
      `✓ Merged task branch "${result.sourceBranch}" into "${result.targetBranch}" (${deletionNotice})`,
    );
  },
});

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
