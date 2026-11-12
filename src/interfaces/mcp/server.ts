/**
 * Model Context Protocol (MCP) server implementation for Modie.
 * Registers 12 singular-purpose agent tools with flat Zod input/output schemas,
 * declared behavioral annotations, stateless parameters with Git branch fallback,
 * and token economy progressive disclosure (RULE-25, RULE-26, RULE-27).
 */

import {
  McpServer,
  type McpServerOptions,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  MODIE_VERSION,
  type IVcsAdapter,
  type WorkspaceContext,
} from "../../core/index.ts";
import { formatMcpToolError } from "./errors.ts";
import { createDynamicWorkspaceManager } from "./roots.ts";
import {
  handleArchiveArtifact,
  handleCheckCriteria,
  handleCompleteTask,
  handleCreateAdr,
  handleCreateMotive,
  handleCreateRule,
  handleCreateTask,
  handleDirectoryContext,
  handleLinkArtifacts,
  handleReadArtifact,
  handleSparkAdd,
  handleStartTask,
  handleTaskContext,
} from "./handlers.ts";
import { loadMcpInstructions } from "./instructions.ts";
import { registerAllResources } from "./resources.ts";
import {
  archiveArtifactOutputSchema,
  archiveArtifactSchema,
  checkCriteriaOutputSchema,
  checkCriteriaSchema,
  completeTaskOutputSchema,
  completeTaskSchema,
  createAdrSchema,
  createArtifactOutputSchema,
  createMotiveOutputSchema,
  createMotiveSchema,
  createRuleSchema,
  createTaskSchema,
  directoryContextSchema,
  linkArtifactsOutputSchema,
  linkArtifactsSchema,
  readArtifactSchema,
  sparkAddMcpSchema,
  sparkAddOutputSchema,
  startTaskSchema,
  taskContextSchema,
} from "./schemas.ts";

export interface ModieMcpServerOptions {
  /**
   * Root working directory for workspace operations (defaults to process.cwd()).
   */
  cwd?: string;

  /**
   * Optional custom VCS adapter.
   */
  vcs?: IVcsAdapter;

  /**
   * Explicit workspace context container.
   */
  workspace?: WorkspaceContext;

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
 * Creates and initializes a Modie MCP server with the 12 singular agent tools
 * and ambient governance resources.
 */
export function createModieMcpServer(
  options: ModieMcpServerOptions = {},
): McpServer {
  const envCwd = process.env.MODIE_CWD?.trim();
  const cwd = options.cwd || (envCwd ? envCwd : process.cwd());
  const stderr =
    options.stderr ?? ((msg: string) => process.stderr.write(msg + "\n"));

  const instructions =
    options.serverOptions?.instructions ?? loadMcpInstructions();

  const server = new McpServer(
    {
      name: "modie",
      version: MODIE_VERSION,
    },
    {
      ...options.serverOptions,
      instructions,
    },
  );

  const dynamicManager = createDynamicWorkspaceManager(server, {
    initialCwd: cwd,
    explicitWorkspace: options.workspace,
    vcs: options.vcs,
    hasExplicitEnvCwd: Boolean(envCwd),
    stderr,
  });
  const workspace = dynamicManager.workspace;

  // ==========================================================================
  // Cluster 1: Spatial & Artifact Exploration Tools (Plaintext/Markdown)
  // ==========================================================================

  // 1. directory_context
  server.registerTool(
    "directory_context",
    {
      description:
        "Inspect architectural context for a directory scope: upward motives, governing rules, and child directory motives. Accepts path and mode ('summary' | 'detailed').",
      inputSchema: directoryContextSchema.shape,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
      },
    },
    (async (args: any): Promise<any> => {
      try {
        await dynamicManager.ensureWorkspace();
        const text = await handleDirectoryContext(args, workspace);
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error: any) {
        return formatMcpToolError(error, "directory_context", args, stderr);
      }
    }) as any,
  );

  // 2. read_artifact
  server.registerTool(
    "read_artifact",
    {
      description:
        "Inspect any governance artifact (RULE, ADR, TASK) by tag. Returns unescaped Markdown with an appendix.",
      inputSchema: readArtifactSchema.shape,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
      },
    },
    (async (args: any): Promise<any> => {
      try {
        await dynamicManager.ensureWorkspace();
        const text = await handleReadArtifact(args, workspace);
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error: any) {
        return formatMcpToolError(error, "read_artifact", args, stderr);
      }
    }) as any,
  );

  // 3. task_context
  server.registerTool(
    "task_context",
    {
      description:
        "High-signal Mission Brief in Markdown: active branch, scope, blast radius constraint, acceptance criteria, and governing rule invariants.",
      inputSchema: taskContextSchema.shape,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
      },
    },
    (async (args: any): Promise<any> => {
      try {
        await dynamicManager.ensureWorkspace();
        const text = await handleTaskContext(args, workspace);
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error: any) {
        return formatMcpToolError(error, "task_context", args, stderr);
      }
    }) as any,
  );

  // ==========================================================================
  // Cluster 2: Task Lifecycle State Machine Tools
  // ==========================================================================

  // 4. start_task
  server.registerTool(
    "start_task",
    {
      description:
        "Check out or create task branch, verify dependencies, and return active Mission Brief in Markdown.",
      inputSchema: startTaskSchema.shape,
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
        destructiveHint: false,
      },
    },
    (async (args: any): Promise<any> => {
      try {
        await dynamicManager.ensureWorkspace();
        const text = await handleStartTask(args, workspace);
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error: any) {
        return formatMcpToolError(error, "start_task", args, stderr);
      }
    }) as any,
  );

  // 5. check_criteria
  server.registerTool(
    "check_criteria",
    {
      description:
        "Atomically mark 1-based acceptance criteria complete or incomplete. Returns updated progress.",
      inputSchema: checkCriteriaSchema.shape,
      outputSchema: checkCriteriaOutputSchema.shape,
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
        destructiveHint: false,
      },
    },
    (async (args: any): Promise<any> => {
      try {
        await dynamicManager.ensureWorkspace();
        const result = await handleCheckCriteria(args, workspace);
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
        return formatMcpToolError(error, "check_criteria", args, stderr);
      }
    }) as any,
  );

  // 6. complete_task
  server.registerTool(
    "complete_task",
    {
      description:
        "Execute atomic two-phase commit completion ceremony, verify criteria, merge to trunk, and delete task branch.",
      inputSchema: completeTaskSchema.shape,
      outputSchema: completeTaskOutputSchema.shape,
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: true,
      },
    },
    (async (args: any): Promise<any> => {
      try {
        await dynamicManager.ensureWorkspace();
        const result = await handleCompleteTask(args, workspace);
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
        return formatMcpToolError(error, "complete_task", args, stderr);
      }
    }) as any,
  );

  // ==========================================================================
  // Cluster 3: Dedicated Artifact Authoring Tools
  // ==========================================================================

  // 7. create_rule
  server.registerTool(
    "create_rule",
    {
      description:
        "Author a RULE. LITMUS TEST: Enduring, falsifiable invariant verifiable in code/tests. Never for temporary tasks or subjective styles.",
      inputSchema: createRuleSchema.shape,
      outputSchema: createArtifactOutputSchema.shape,
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
      },
    },
    (async (args: any): Promise<any> => {
      try {
        await dynamicManager.ensureWorkspace();
        const result = await handleCreateRule(args, workspace);
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
        return formatMcpToolError(error, "create_rule", args, stderr);
      }
    }) as any,
  );

  // 8. create_adr
  server.registerTool(
    "create_adr",
    {
      description:
        "Author an ADR. LITMUS TEST: Decision must actively constrain future code. Never author an ADR for deletions, refactors, or sunsets (use archive_artifact or an ephemeral task).",
      inputSchema: createAdrSchema.shape,
      outputSchema: createArtifactOutputSchema.shape,
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
      },
    },
    (async (args: any): Promise<any> => {
      try {
        await dynamicManager.ensureWorkspace();
        const result = await handleCreateAdr(args, workspace);
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
        return formatMcpToolError(error, "create_adr", args, stderr);
      }
    }) as any,
  );

  // 9. create_task
  server.registerTool(
    "create_task",
    {
      description:
        "Author a TASK. LITMUS TEST: Converged execution contract with binary criteria ending with User Review. If still inchoate or exploring, use spark_add.",
      inputSchema: createTaskSchema.shape,
      outputSchema: createArtifactOutputSchema.shape,
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
      },
    },
    (async (args: any): Promise<any> => {
      try {
        await dynamicManager.ensureWorkspace();
        const result = await handleCreateTask(args, workspace);
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
        return formatMcpToolError(error, "create_task", args, stderr);
      }
    }) as any,
  );

  // 10. create_motive
  server.registerTool(
    "create_motive",
    {
      description:
        "Author a MOTIVE. LITMUS TEST: Enduring architectural reason and domain boundary for this directory node. Never for setup steps or file inventories.",
      inputSchema: createMotiveSchema.shape,
      outputSchema: createMotiveOutputSchema.shape,
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
      },
    },
    (async (args: any): Promise<any> => {
      try {
        await dynamicManager.ensureWorkspace();
        const result = await handleCreateMotive(args, workspace);
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
        return formatMcpToolError(error, "create_motive", args, stderr);
      }
    }) as any,
  );

  // ==========================================================================
  // Cluster 4: Graph Mutation Tools
  // ==========================================================================

  // 11. link_artifacts
  server.registerTool(
    "link_artifacts",
    {
      description:
        "Establish directional frontmatter relationships (links, depends_on) between artifacts.",
      inputSchema: linkArtifactsSchema.shape,
      outputSchema: linkArtifactsOutputSchema.shape,
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
        destructiveHint: false,
      },
    },
    (async (args: any): Promise<any> => {
      try {
        await dynamicManager.ensureWorkspace();
        const result = await handleLinkArtifacts(args, workspace);
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
        return formatMcpToolError(error, "link_artifacts", args, stderr);
      }
    }) as any,
  );

  // 12. archive_artifact
  server.registerTool(
    "archive_artifact",
    {
      description:
        "Archive an obsolete RULE or ADR artifact, marking it archived and auditing inbound references.",
      inputSchema: archiveArtifactSchema.shape,
      outputSchema: archiveArtifactOutputSchema.shape,
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: true,
      },
    },
    (async (args: any): Promise<any> => {
      try {
        await dynamicManager.ensureWorkspace();
        const result = await handleArchiveArtifact(args, workspace);
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
        return formatMcpToolError(error, "archive_artifact", args, stderr);
      }
    }) as any,
  );

  // 13. spark_add
  server.registerTool(
    "spark_add",
    {
      description:
        "Capture a SPARK. LITMUS TEST: Raw, inchoate idea or out-of-scope finding requiring no formal design, branch, or criteria.",
      inputSchema: sparkAddMcpSchema.shape,
      outputSchema: sparkAddOutputSchema.shape,
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
      },
    },
    (async (args: any): Promise<any> => {
      try {
        await dynamicManager.ensureWorkspace();
        const result = await handleSparkAdd(args, workspace);
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
        return formatMcpToolError(error, "spark_add", args, stderr);
      }
    }) as any,
  );

  // ==========================================================================
  // Ambient Resources (RULE-25, RULE-26)
  // ==========================================================================
  registerAllResources(server, { cwd, workspace, instructions });

  return server;
}
