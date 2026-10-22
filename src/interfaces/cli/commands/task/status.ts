/**
 * Declarative CLI command definition for `modie task status [id] [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { getTaskStatus, type TaskStatusDetails } from "../../../../core/index.ts";
import {
  createCommandHandler,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";
import { handleTaskList } from "./list.ts";

export interface TaskStatusFlags {
  json?: boolean;
}

/**
 * Declarative definition for the `modie task status` command.
 */
export const taskStatusCommand: CliCommandDefinition<
  TaskStatusFlags,
  TaskStatusDetails
> = {
  name: "status",
  usage: "modie task status [id-or-path] [options]",
  description:
    "Inspect active task queue status or deep inspection of a specific task.",
  helpUsage: "modie task status --help",
  positionals: [
    {
      name: "id-or-path",
      description: "Task ID (e.g. TASK-9, 9), slug, or file path (optional)",
      required: false,
    },
  ],
  flags: {},
  run: async (context) => {
    const taskIdentifier = context.positionals[0];

    // If no task identifier is passed, delegate to task list
    if (!taskIdentifier) {
      const listArgs = context.flags.json ? ["--json"] : [];
      return handleTaskList(listArgs, context.io);
    }

    return getTaskStatus(taskIdentifier, { cwd: context.cwd });
  },
  render: (status, context) => {
    context.stderr(`${status.fullTaskId}: ${status.slug}`);
    context.stderr(`Status:      ${status.readiness}`);
    if (status.blockedBy.length > 0) {
      context.stderr(`Blocked By:  ${status.blockedBy.join(", ")}`);
    }
    context.stderr(`Path:        ${status.relativePath}`);
    context.stderr(`Progress:    ${status.criteriaProgress} criteria satisfied`);
    if (status.depends_on.length > 0) {
      context.stderr(`Depends On:  ${status.depends_on.join(", ")}`);
    } else {
      context.stderr(`Depends On:  (none)`);
    }
    if (status.links.length > 0) {
      context.stderr(`Links:       ${status.links.join(", ")}`);
    }

    if (status.context) {
      context.stderr(`\nContext:\n  ${status.context}`);
    }

    if (status.acceptanceCriteria.length > 0) {
      context.stderr(`\nAcceptance Criteria:`);
      status.acceptanceCriteria.forEach((c, idx) => {
        const box = c.completed ? "[x]" : "[ ]";
        context.stderr(`  ${idx + 1}. ${box} ${c.text}`);
      });
    }
  },
  renderJson: (status, context) => {
    context.stdout(JSON.stringify(status, null, 2));
  },
};

/**
 * CLI command handler for `modie task status`.
 */
export const handleTaskStatus: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(taskStatusCommand);

/**
 * Prints usage instructions for `modie task status`.
 */
export function printTaskStatusHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(taskStatusCommand));
}
