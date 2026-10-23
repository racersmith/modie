/**
 * Model Context Protocol (MCP) server implementation for Modie.
 * Automatically projects shared Zod command definitions into typed MCP tools,
 * provides read-only MCP resources for live workspace context,
 * and strictly enforces RULE-25 (interface-core decoupling) and RULE-26 (token economy).
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { McpServer, type McpServerOptions } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  getArtifactDetails,
  queryTaskQueue,
  scanActiveArtifacts,
} from "../../core/index.ts";
import { allCliCommands } from "../cli/commands/index.ts";
import type { CliCommandDefinition, CliExecutionContext } from "../cli/framework/types.ts";

export interface ModieMcpServerOptions {
  /**
   * Root working directory for workspace operations (defaults to process.cwd()).
   */
  cwd?: string;

  /**
   * Custom command registry override (defaults to allCliCommands).
   */
  commands?: CliCommandDefinition<any, any, any>[];

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
 * Strips unrequested raw content and formatting to enforce RULE-26 token economy.
 */
export function sanitizePayloadForRule26(
  commandId: string,
  args: Record<string, any>,
  result: any,
): any {
  if (result === undefined || result === null) {
    return { success: true };
  }

  if (commandId === "show" && typeof result === "object") {
    // Per RULE-26, omit unsolicited raw document contents unless explicitly requested
    if (!args.raw && "rawContent" in result) {
      const { rawContent, ...rest } = result;
      return rest;
    }
  }

  return result;
}

/**
 * Creates and initializes a Modie MCP server with automated tool registration
 * from shared declarative Zod action definitions and read-only governance resources.
 */
export function createModieMcpServer(
  options: ModieMcpServerOptions = {},
): McpServer {
  const cwd = options.cwd ?? process.env.MODIE_CWD ?? process.cwd();
  const stderr = options.stderr ?? ((msg: string) => process.stderr.write(msg + "\n"));

  const server = new McpServer(
    {
      name: "modie",
      version: "0.0.1",
    },
    options.serverOptions,
  );

  // 1. Automated Tool Registration
  const commands = options.commands ?? allCliCommands;

  for (const cmd of commands) {
    // Skip internal or transport-specific commands if any
    if (cmd.id === "mcp") continue;

    const toolName = cmd.id || cmd.name;
    const description = [
      cmd.description,
      cmd.agentGuidance ? `Guidance: ${cmd.agentGuidance}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const inputSchema = cmd.schema?.shape ?? {};

    const executeFn = cmd.execute;
    if (!executeFn) continue;

    server.registerTool(
      toolName,
      {
        description,
        inputSchema,
      },
      async (args: any) => {
        try {
          const context: CliExecutionContext = {
            args: [],
            positionals: [],
            flags: { ...args },
            stdout: () => {}, // Suppress stdout to avoid corrupting stdio transport
            stderr,
            cwd,
            io: { cwd, stderr },
          };

          const rawResult = await executeFn(args, context);
          const cleanResult = sanitizePayloadForRule26(toolName, args, rawResult);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(cleanResult, null, 2),
              },
            ],
          };
        } catch (error: any) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: error?.message ?? String(error),
              },
            ],
          };
        }
      },
    );
  }

  // 2. Read-Only Resource Registration (Criterion 4)
  // Ready Tasks Resource
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
      description: "All active tasks in the repository with DAG readiness status",
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
                id: details.id,
                slug: details.slug,
                relativePath: details.relativePath,
                links: details.links,
                body: details.body,
              };
            } catch {
              return {
                tag: r.tag,
                id: r.id,
                slug: r.slug,
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

  // Agent Instructions & Governance Best Practices Resource
  server.registerResource(
    "instructions",
    "modie://instructions",
    {
      title: "Agent Instructions & Governance Best Practices",
      description:
        "Comprehensive guidelines on ephemeral task decoupling, contract-based criteria (RULE-30), planned governance, and task lifecycle",
      mimeType: "text/markdown",
    },
    async (uri) => {
      let text = "";
      const candidates = [
        join(cwd, ".agents", "plugins", "modie", "instructions.md"),
        join(import.meta.dir, "..", "..", "..", ".agents", "plugins", "modie", "instructions.md"),
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
          "Never reference ephemeral `TASK-XX` IDs in test headers (`[TASK-XX]`) or code comments (`@verifies TASK-XX`). Tasks are ephemeral and deleted upon completion per ADR-6 and RULE-21. Instead, author and cite durable `RULE-` and `ADR-` artifacts.\n\n" +
          "## 2. Contract-Based Acceptance Criteria (RULE-30)\n\n" +
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
