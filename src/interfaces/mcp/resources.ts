/**
 * Model Context Protocol (MCP) Ambient Resources.
 * Exposes strictly 3 parameterless, discoverable ambient resources (RULE-25, RULE-26):
 * 1. modie://task (Markdown Mission Brief)
 * 2. modie://tasks/ready (JSON ready tasks queue)
 * 3. modie://instructions (Markdown governance protocol)
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  detectGitBranch,
  getTaskStatus,
  parseTaskIdFromBranch,
  queryTaskQueue,
} from "../../core/index.ts";
import { loadMcpInstructions } from "./instructions.ts";
import { renderTaskMissionBrief } from "./renderers.ts";

export interface RegisterResourcesOptions {
  cwd?: string;
  instructions?: string;
}

/**
 * Registers strictly 3 parameterless ambient resources on the Modie MCP server:
 * - modie://task: Dynamic unescaped Markdown Mission Brief for the active task branch.
 * - modie://tasks/ready: Real-time JSON triage queue of unblocked ready tasks.
 * - modie://instructions: Static Markdown governance and ephemeral task instructions.
 */
export function registerAllResources(
  server: McpServer,
  options: RegisterResourcesOptions = {},
) {
  const cwd = options.cwd ?? process.cwd();
  const instructions = options.instructions;

  // 1. Dynamic Active Task Mission Brief (modie://task)
  server.registerResource(
    "task",
    "modie://task",
    {
      title: "Active Task Mission Brief",
      description:
        "Ambient zero-roundtrip hydration of the full active branch Mission Brief in Markdown",
      mimeType: "text/markdown",
    },
    async (uri) => {
      const branch = await detectGitBranch(cwd);
      const taskId = branch ? parseTaskIdFromBranch(branch) : null;

      let text: string;
      if (taskId) {
        try {
          const status = await getTaskStatus(taskId, { cwd });
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
      title: "Active Ready Tasks",
      description:
        "Active workspace tasks unblocked by dependencies and ready for execution",
      mimeType: "application/json",
    },
    async (uri) => {
      const readyTasks = await queryTaskQueue({ cwd, readyOnly: true });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(readyTasks, null, 2),
          },
        ],
      };
    },
  );

  // 3. Agent Instructions Resource (modie://instructions)
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
