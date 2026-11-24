/**
 * Model Context Protocol (MCP) Ambient Resources.
 * Exposes 4 canonical ambient resources (RULE-25, RULE-26) plus workspace-scoped
 * URI templates for dynamic multi-workspace clients (RULE-37):
 * 1. modie://task (and modie://task{?workspace})
 * 2. modie://tasks/ready (and modie://tasks/ready{?workspace})
 * 3. modie://tasks/all (and modie://tasks/all{?workspace})
 * 4. modie://instructions (static Markdown governance protocol)
 */

import {
  ResourceTemplate,
  type McpServer,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createWorkspaceContextSync,
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
  resolveWorkspace?: (workspacePath?: string) => Promise<WorkspaceContext>;
}

/**
 * Registers the 4 canonical ambient resources and workspace-parameterized templates
 * for the 3 dynamic resources on the Modie MCP server.
 */
export function registerAllResources(
  server: McpServer,
  options: RegisterResourcesOptions = {},
) {
  const defaultCtx = resolveWorkspaceContext(options.workspace ?? options.cwd);
  const instructions = options.instructions;

  const resolveResourceContext = async (uri: URL): Promise<WorkspaceContext> => {
    const workspaceParam = uri.searchParams.get("workspace")?.trim() || undefined;
    if (options.resolveWorkspace) {
      return options.resolveWorkspace(workspaceParam);
    }
    if (workspaceParam) {
      return createWorkspaceContextSync({
        root: workspaceParam,
        vcs: defaultCtx.vcs,
      });
    }
    return defaultCtx;
  };

  const readTaskResource = async (uri: URL) => {
    const ctx = await resolveResourceContext(uri);
    const branch = await detectGitBranch(ctx);
    const taskId = branch ? parseTaskIdFromBranch(branch) : null;

    let text: string;
    if (taskId) {
      try {
        const status = await getTaskStatus(taskId, {
          cwd: ctx.root,
          workspace: ctx,
        });
        text = await renderTaskMissionBrief(status, branch, ctx.root);
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
  };

  const readReadyTasksResource = async (uri: URL) => {
    const ctx = await resolveResourceContext(uri);
    const allTasks = await queryTaskQueue({
      cwd: ctx.root,
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
  };

  const readAllTasksResource = async (uri: URL) => {
    const ctx = await resolveResourceContext(uri);
    const allTasks = await queryTaskQueue({
      cwd: ctx.root,
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
  };

  const taskMeta = {
    title: "Current Task Brief",
    description:
      "Document for the current task that synesises the task document as well as relevant supporting documents.",
    mimeType: "text/markdown",
  };
  const readyTasksMeta = {
    title: "Ready Tasks",
    description:
      "List of available tasks that are unblocked and ready to be started.",
    mimeType: "text/markdown",
  };
  const allTasksMeta = {
    title: "All Tasks",
    description:
      "Condensed Markdown backlog of all tasks categorized by readiness with dependency blockers and downstream leverage",
    mimeType: "text/markdown",
  };

  // 1. Dynamic Active Task Brief (modie://task + workspace template)
  server.registerResource("task", "modie://task", taskMeta, readTaskResource);
  server.registerResource(
    "task-workspace",
    new ResourceTemplate("modie://task{?workspace}", { list: undefined }),
    taskMeta,
    async (uri) => readTaskResource(uri),
  );

  // 2. Active Ready Tasks Queue (modie://tasks/ready + workspace template)
  server.registerResource(
    "ready-tasks",
    "modie://tasks/ready",
    readyTasksMeta,
    readReadyTasksResource,
  );
  server.registerResource(
    "ready-tasks-workspace",
    new ResourceTemplate("modie://tasks/ready{?workspace}", {
      list: undefined,
    }),
    readyTasksMeta,
    async (uri) => readReadyTasksResource(uri),
  );

  // 3. Workspace Tasks Backlog (modie://tasks/all + workspace template)
  server.registerResource(
    "all-tasks",
    "modie://tasks/all",
    allTasksMeta,
    readAllTasksResource,
  );
  server.registerResource(
    "all-tasks-workspace",
    new ResourceTemplate("modie://tasks/all{?workspace}", { list: undefined }),
    allTasksMeta,
    async (uri) => readAllTasksResource(uri),
  );

  // 4. Agent Instructions Resource (modie://instructions)
  server.registerResource(
    "instructions",
    "modie://instructions",
    {
      title: "Agent Instructions & Governance Best Practices",
      description:
        "Comprehensive guidelines on ephemeral task decoupling, contract-based criteria, governance deliverables, and task lifecycle",
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
