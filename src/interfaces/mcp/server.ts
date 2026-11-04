/**
 * Model Context Protocol (MCP) server implementation for Modie.
 * Registers 4 consolidated, goal-oriented agent tools with flat Zod input/output schemas,
 * declared behavioral annotations, stateless parameters with Git branch fallback,
 * and token economy progressive disclosure (RULE-25, RULE-26, RULE-27).
 */

import {
  McpServer,
  type McpServerOptions,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { MODIE_VERSION } from "../../core/index.ts";
import { loadMcpInstructions } from "./instructions.ts";
import {
  handleCompileContext,
  handleCreateArtifact,
  handleMutateGovernance,
  handleTaskLifecycle,
} from "./handlers.ts";
import { formatMcpToolError } from "./errors.ts";
import {
  compileContextInputSchema,
  createArtifactInputSchema,
  createArtifactOutputSchema,
  mutateGovernanceInputSchema,
  mutateGovernanceOutputSchema,
  taskLifecycleInputSchema,
  taskLifecycleOutputSchema,
} from "./schemas.ts";
import { registerAllResources } from "./resources.ts";
import { registerAllPrompts } from "./prompts.ts";

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

  // 1. Tool 1: modie_compile_context
  server.registerTool(
    "modie_compile_context",
    {
      description:
        "Compile spatial architectural context, governing rules, and signposts for a target.",
      inputSchema: compileContextInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
      },
    },
    (async (args: any): Promise<any> => {
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
    }) as any,
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
    (async (args: any): Promise<any> => {
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
    }) as any,
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
    (async (args: any): Promise<any> => {
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
    }) as any,
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
    (async (args: any): Promise<any> => {
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
    }) as any,
  );

  // 5. Scoped Resource Templates and Static/Dynamic Resources (TASK-49, RULE-25, RULE-26)
  registerAllResources(server, { cwd, instructions });

  // 6. Native MCP Workflow Prompts (TASK-49)
  registerAllPrompts(server);

  return server;
}
