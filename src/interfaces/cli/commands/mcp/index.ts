/**
 * Declarative CLI command definition for `modie mcp [options]`.
 * Launches the Model Context Protocol (MCP) server over standard input/output (stdio).
 */

import { z } from "zod";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createModieMcpServer } from "../../../mcp/server.ts";
import {
  defineCommand,
  type CliCommandDefinition,
} from "../../framework/index.ts";

export const mcpSchema = z.object({});

export type McpInput = z.infer<typeof mcpSchema>;

/**
 * Declarative definition for the `modie mcp` command.
 */
export const mcpCommand: CliCommandDefinition<
  Record<string, any>,
  void,
  typeof mcpSchema
> = defineCommand({
  id: "mcp",
  name: "mcp",
  usage: "modie mcp [options]",
  description:
    "Launch Model Context Protocol (MCP) server over standard input/output (stdio).",
  agentGuidance:
    "Launches the Modie MCP server listening on stdio transport for agent integrations.",
  helpUsage: "modie mcp --help",
  schema: mcpSchema,
  flags: {},
  execute: async (_input, context) => {
    const envCwd = process.env.MODIE_CWD?.trim();
    const server = createModieMcpServer({
      cwd: envCwd ? envCwd : context.cwd,
      stderr: context.stderr,
    });
    const transport = new StdioServerTransport();

    const cleanup = () => {
      process.exit(0);
    };

    transport.onclose = cleanup;
    process.stdin.on("close", cleanup);
    process.stdin.on("end", cleanup);
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    await server.connect(transport);
    return new Promise<void>(() => {});
  },
});

