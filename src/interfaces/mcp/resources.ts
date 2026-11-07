/**
 * Model Context Protocol (MCP) Ambient Resources.
 * Exposes strictly 4 parameterless, discoverable ambient resources (RULE-25, RULE-26):
 * 1. modie://task (Markdown Mission Brief)
 * 2. modie://tasks/ready (Markdown ready tasks queue)
 * 3. modie://tasks/all (Markdown workspace tasks backlog)
 * 4. modie://instructions (Markdown governance protocol)
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  detectGitBranch,
  getTaskStatus,
  parseTaskIdFromBranch,
  queryTaskQueue,
  resolveWorkspaceContext,
  type WorkspaceContext,
} from "../../core/index.ts";
import { loadMcpInstructions } from "./instructions.ts";
import {
  renderReadyTasks,
  renderTaskMissionBrief,
  renderTasksBacklog,
} from "./renderers.ts";

export interface RegisterResourcesOptions {
  cwd?: string;
  workspace?: WorkspaceContext;
  instructions?: string;
}

/**
 * Registers strictly 4 parameterless ambient resources on the Modie MCP server:
 * - modie://task: Dynamic unescaped Markdown Mission Brief for the active task branch.
 * - modie://tasks/ready: Real-time Markdown triage queue of unblocked ready tasks.
 * - modie://tasks/all: Condensed Markdown backlog of all workspace tasks with blockers and downstream leverage.
 * - modie://instructions: Static Markdown governance and ephemeral task instructions.
 */
export function registerAllResources(
  server: McpServer,
  options: RegisterResourcesOptions = {},
) {
  const ctx = resolveWorkspaceContext(options.workspace ?? options.cwd);
  const cwd = ctx.root;
  const instructions = options.instructions;

  // 1. Dynamic Active Task Brief (modie://task)
  server.registerResource(
    "task",
    "modie://task",
    {
      title: "Current Task Brief",
      description:
        "Document for the current task that synesises the task document as well as relevant supporting documents.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      const branch = await detectGitBranch(ctx);
      const taskId = branch ? parseTaskIdFromBranch(branch) : null;

      let text: string;
      if (taskId) {
        try {
          const status = await getTaskStatus(taskId, {
            cwd,
            workspace: ctx,
          });
          text = await renderTaskMissionBrief(status, branch, cwd);
        } catch {
          text = `# Mission Brief: Unknown Task (${taskId})\n\nUnable to load status for task \`${taskId}\` on branch \`${branch}\`.`;
        }
      } else {
        text = `# Mission Brief: No Active Task\n\nNo active task branch detected (current branch: \`${branch ?? "unknown"}\`). Use \`start_task\` to begin a task.`;
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text,
          },
        ],
      };
    },
  );

  // 2. Active Ready Tasks Queue (modie://tasks/ready)
  server.registerResource(
    "ready-tasks",
    "modie://tasks/ready",
    {
      title: "Ready Tasks",
      description:
        "List of available tasks that are unblocked and ready to be started.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      const allTasks = await queryTaskQueue({
        cwd,
        workspace: ctx,
        readyOnly: false,
      });
      const readyTasks = allTasks.filter((t) => t.readiness === "READY");
      const text = renderReadyTasks(readyTasks, allTasks);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text,
          },
        ],
      };
    },
  );

  // 3. Workspace Tasks Backlog (modie://tasks/all)
  server.registerResource(
    "all-tasks",
    "modie://tasks/all",
    {
      title: "All Tasks",
      description:
        "Condensed Markdown backlog of all tasks categorized by readiness with dependency blockers and downstream leverage",
      mimeType: "text/markdown",
    },
    async (uri) => {
      const allTasks = await queryTaskQueue({
        cwd,
        workspace: ctx,
        readyOnly: false,
      });
      const text = renderTasksBacklog(allTasks);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text,
          },
        ],
      };
    },
  );

  // 4. Agent Instructions Resource (modie://instructions)
  server.registerResource(
    "instructions",
    "modie://instructions",
    {
      title: "Agent Instructions & Governance Best Practices",
      description:
        "Comprehensive guidelines on ephemeral task decoupling, contract-based criteria, planned governance, and task lifecycle",
      mimeType: "text/markdown",
    },
    async (uri) => {
      const text = instructions ?? loadMcpInstructions();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text,
          },
        ],
      };
    },
  );
}
