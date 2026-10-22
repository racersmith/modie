/**
 * Declarative CLI command definition for `modie mcp [options]`.
 * Launches the Model Context Protocol (MCP) server over standard input/output (stdio).
 */

import { z } from "zod";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createModieMcpServer } from "../../../mcp/server.ts";
import {
  createCommandHandler,
  defineCommand,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export const mcpSchema = z.object({});

export type McpInput = z.infer<typeof mcpSchema>;

export interface McpFlags {
  help?: boolean;
}

/**
 * Declarative definition for the `modie mcp` command.
 */
export const mcpCommand: CliCommandDefinition<
  McpFlags,
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
    const server = createModieMcpServer({
      cwd: context.cwd,
      stderr: context.stderr,
    });
    const transport = new StdioServerTransport();
    await server.connect(transport);
    return new Promise<void>(() => {});
  },
});

/**
 * CLI command handler for `modie mcp`.
 */
export const handleMcp: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(mcpCommand);

/**
 * Prints usage instructions for `modie mcp`.
 */
export function printMcpHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(mcpCommand));
}
