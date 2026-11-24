/**
 * Shared MCP handler helpers for active task ID and default scope resolution.
 * Implements RULE-25 and RULE-26.
 */

import { dirname } from "node:path";
import {
  detectGitBranch,
  getTaskStatus,
  normalizeTaskId,
  parseTaskIdFromBranch,
  resolveWorkspaceContext,
  type WorkspaceContext,
} from "../../../core/index.ts";
import { McpToolError } from "../errors.ts";

/**
 * Resolves the active task ID from an explicit argument or falls back to the current Git branch.
 */
export async function resolveActiveTaskId(
  explicitId: string | undefined,
  cwdOrContext?: string | WorkspaceContext,
): Promise<string> {
  if (explicitId && explicitId.trim().length > 0) {
    return normalizeTaskId(explicitId.trim());
  }
  const ctx = resolveWorkspaceContext(cwdOrContext);
  const branch = await detectGitBranch(ctx);
  if (branch) {
    const fromBranch = parseTaskIdFromBranch(branch);
    if (fromBranch) {
      return normalizeTaskId(fromBranch);
    }
  }
  throw McpToolError.invalidParameter({
    message: `No task_id specified and active Git branch "${branch ?? "unknown"}" is not a task branch.`,
    parameter: "task_id",
    tool: "start_task",
    suggestedParameters: { task_id: "<TASK_ID>" },
  });
}

/**
 * Resolves a default scope directory, optionally inferring it from the active task branch
 * when omitted (and when "." if `inferWhenDot` is enabled).
 */
export async function resolveDefaultScopeDir(
  explicitScope: string | undefined,
  ctx: WorkspaceContext,
  options: { inferWhenDot?: boolean } = {},
): Promise<string> {
  const trimmed = explicitScope?.trim();
  const shouldInfer =
    !trimmed || (options.inferWhenDot === true && trimmed === ".");

  if (shouldInfer) {
    try {
      const branch = await detectGitBranch(ctx);
      if (branch) {
        const fromBranch = parseTaskIdFromBranch(branch);
        if (fromBranch) {
          const status = await getTaskStatus(fromBranch, {
            cwd: ctx.root,
            workspace: ctx,
          });
          if (status.relativePath) {
            return (
              dirname(status.relativePath).replace(/\/\.modie\/tasks$/, "") ||
              "."
            );
          }
          return ".";
        }
      }
    } catch {
      // Fall back to explicit/default scope when active task inference fails
    }
  }

  return trimmed || ".";
}
