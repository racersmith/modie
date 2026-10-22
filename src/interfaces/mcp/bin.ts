#!/usr/bin/env node
/**
 * Standalone executable entrypoint for the Modie Model Context Protocol (MCP) server.
 * Communicates via JSON-RPC over standard input/output (stdio) transport.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createModieMcpServer } from "./server.ts";

export async function runMcpServer(cwd: string = process.cwd()): Promise<void> {
  const server = createModieMcpServer({ cwd });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (
  import.meta.main ||
  process.argv[1]?.endsWith("mcp.js") ||
  process.argv[1]?.endsWith("bin.ts")
) {
  runMcpServer().catch((error) => {
    process.stderr.write(`Modie MCP Server Error: ${error?.message || error}\n`);
    process.exit(1);
  });
}
