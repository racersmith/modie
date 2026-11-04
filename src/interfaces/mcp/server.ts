/**
 * Model Context Protocol (MCP) server implementation for Modie.
 * Registers 4 consolidated, goal-oriented agent tools with flat Zod input/output schemas,
 * declared behavioral annotations, stateless parameters with Git branch fallback,
 * and token economy progressive disclosure (RULE-25, RULE-26, RULE-27).
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  McpServer,
  type McpServerOptions,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  detectGitBranch,
  getArtifactDetails,
  getTaskStatus,
  MODIE_VERSION,
  parseTaskIdFromBranch,
  queryTaskQueue,
  scanActiveArtifacts,
} from "../../core/index.ts";
import {
  handleCompileContext,
  handleCreateArtifact,
  handleMutateGovernance,
  handleTaskLifecycle,
} from "./handlers.ts";
import { formatMcpToolError } from "./errors.ts";
import {
  compileContextInputSchema,
  compileContextOutputSchema,
  createArtifactInputSchema,
  createArtifactOutputSchema,
  mutateGovernanceInputSchema,
  mutateGovernanceOutputSchema,
  taskLifecycleInputSchema,
  taskLifecycleOutputSchema,
} from "./schemas.ts";

export interface ModieMcpServerOptions {
  /**
   * Root working directory for workspace operations (defaults to process.cwd()).
   */
  cwd?: string;

  /**
   * Optional command registry override (retained for backward compatibility, ignored).
   */
  commands?: any[];

  /**
   * Underlying MCP server options.
   */
  serverOptions?: McpServerOptions;

  /**
   * Diagnostics/logging stderr sink (RULE-27: never emit human diagnostics to stdout in stdio mode).
   */
  stderr?: (msg: string) => void;
}

/**
 * Creates and initializes a Modie MCP server with the 5 consolidated agent tools
 * and ambient governance resources.
 */
export function createModieMcpServer(
  options: ModieMcpServerOptions = {},
): McpServer {
  const cwd = options.cwd ?? process.env.MODIE_CWD ?? process.cwd();
  const stderr =
    options.stderr ?? ((msg: string) => process.stderr.write(msg + "\n"));

  const server = new McpServer(
    {
      name: "modie",
      version: MODIE_VERSION,
    },
    options.serverOptions,
  );

  // 1. Tool 1: modie_compile_context
  server.registerTool(
    "modie_compile_context",
    {
      description:
        "Compile spatial architectural context, composite artifact view (path + content + refs), or scope lookup.",
      inputSchema: compileContextInputSchema.shape,
      outputSchema: compileContextOutputSchema.shape,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
      },
    },
    async (args: any) => {
      try {
        const result = await handleCompileContext(args, cwd);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
          structuredContent: result,
        };
      } catch (error: any) {
        return formatMcpToolError(error, "modie_compile_context", args, stderr);
      }
    },
  );

  // 2. Tool 2: modie_task_lifecycle
  server.registerTool(
    "modie_task_lifecycle",
    {
      description:
        "Manage task execution: start (with auto-injected context), batch check criteria, complete (2-phase commit), and merge.",
      inputSchema: taskLifecycleInputSchema.shape,
      outputSchema: taskLifecycleOutputSchema.shape,
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: true,
      },
    },
    async (args: any) => {
      try {
        const result = await handleTaskLifecycle(args, cwd);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
          structuredContent: result,
        };
      } catch (error: any) {
        return formatMcpToolError(error, "modie_task_lifecycle", args, stderr);
      }
    },
  );

  // 3. Tool 3: modie_create_artifact
  server.registerTool(
    "modie_create_artifact",
    {
      description:
        "Universal declarative authoring for RULE, ADR, TASK, MOTIVE, IDEA, SPARK with atomic link creation.",
      inputSchema: createArtifactInputSchema.shape,
      outputSchema: createArtifactOutputSchema.shape,
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
      },
    },
    async (args: any) => {
      try {
        const result = await handleCreateArtifact(args, cwd);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
          structuredContent: result,
        };
      } catch (error: any) {
        return formatMcpToolError(error, "modie_create_artifact", args, stderr);
      }
    },
  );

  // 4. Tool 4: modie_mutate_governance
  server.registerTool(
    "modie_mutate_governance",
    {
      description:
        "Batch link or unlink frontmatter relationships and archive obsolete rules/ADRs.",
      inputSchema: mutateGovernanceInputSchema.shape,
      outputSchema: mutateGovernanceOutputSchema.shape,
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: true,
      },
    },
    async (args: any) => {
      try {
        const result = await handleMutateGovernance(args, cwd);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
          structuredContent: result,
        };
      } catch (error: any) {
        return formatMcpToolError(
          error,
          "modie_mutate_governance",
          args,
          stderr,
        );
      }
    },
  );

  // 6. Resources Registration
  // Active Ready Tasks Resource
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
      const tasks = await queryTaskQueue({ cwd, readyOnly: true });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(tasks, null, 2),
          },
        ],
      };
    },
  );

  // All Tasks Resource
  server.registerResource(
    "all-tasks",
    "modie://tasks",
    {
      title: "All Active Tasks",
      description:
        "All active tasks in the repository with DAG readiness status",
      mimeType: "application/json",
    },
    async (uri) => {
      const tasks = await queryTaskQueue({ cwd });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(tasks, null, 2),
          },
        ],
      };
    },
  );

  // Current Task Dynamic Resource
  server.registerResource(
    "current-task",
    "modie://task/current",
    {
      title: "Active Task Branch State",
      description:
        "Ambient active task progress, checklist, and blast radius stream",
      mimeType: "application/json",
    },
    async (uri) => {
      const branch = await detectGitBranch(cwd);
      const taskId = branch ? parseTaskIdFromBranch(branch) : null;
      let status: any = null;
      if (taskId) {
        try {
          status = await getTaskStatus(taskId, { cwd });
        } catch {}
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ branch, taskId, status }, null, 2),
          },
        ],
      };
    },
  );

  // Active Governance Rules Resource
  server.registerResource(
    "active-rules",
    "modie://rules",
    {
      title: "Workspace Governance Rules",
      description:
        "Active architectural, interface, and workflow governance rules enforced across the repository",
      mimeType: "application/json",
    },
    async (uri) => {
      const discovered = await scanActiveArtifacts(cwd, "RULE");
      const rules = await Promise.all(
        discovered
          .filter((r) => !r.isArchived)
          .map(async (r) => {
            try {
              const details = await getArtifactDetails(r.tag, { cwd });
              return {
                tag: details.tag,
                title: details.title,
                relativePath: details.relativePath,
                links: details.links,
                body: details.body,
              };
            } catch {
              return {
                tag: r.tag,
                title: r.title,
                relativePath: r.filepath,
              };
            }
          }),
      );

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(rules, null, 2),
          },
        ],
      };
    },
  );

  // Agent Instructions Resource
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
      let text = "";
      const candidates = [
        join(cwd, ".agents", "plugins", "modie", "instructions.md"),
        join(
          import.meta.dir,
          "..",
          "..",
          "..",
          ".agents",
          "plugins",
          "modie",
          "instructions.md",
        ),
      ];

      for (const path of candidates) {
        try {
          text = await readFile(path, "utf8");
          if (text) break;
        } catch {
          // try next candidate
        }
      }

      if (!text) {
        text =
          "# Modie Agent Instructions & Authoring Best Practices\n\n" +
          "## 1. Ephemeral Task Decoupling (Critical Anti-Pattern)\n\n" +
          "Never reference ephemeral `TASK-XX` IDs in test headers (`[TASK-XX]`) or code comments (`@verifies TASK-XX`). Tasks are ephemeral and deleted upon completion. Instead, author and cite durable `RULE-` and `ADR-` artifacts.\n\n" +
          "## 2. Contract-Based Acceptance Criteria\n\n" +
          "Define deliverables in terms of component roles, behavioral contracts, or testable capabilities rather than concrete filesystem paths.\n\n" +
          "## 3. Front-Loaded Planned Governance\n\n" +
          "Declare planned rules and ADRs upfront during task creation (`--plan-rule`, `--plan-adr`). All planned governance items must be generated before task completion.";
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

  return server;
}
