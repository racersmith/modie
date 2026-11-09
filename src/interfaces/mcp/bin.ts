#!/usr/bin/env node
/**
 * Standalone executable entrypoint for the Modie Model Context Protocol (MCP) server.
 * Communicates via JSON-RPC over standard input/output (stdio) transport.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createModieMcpServer } from "./server.ts";

export async function runMcpServer(cwd?: string): Promise<void> {
  const envCwd = process.env.MODIE_CWD?.trim();
  const resolvedCwd = cwd || (envCwd ? envCwd : process.cwd());
  const server = createModieMcpServer({ cwd: resolvedCwd });
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
}

if (
  import.meta.main ||
  process.argv[1]?.endsWith("mcp.js") ||
  process.argv[1]?.endsWith("bin.ts")
) {
  runMcpServer().catch((error) => {
    process.stderr.write(
      `Modie MCP Server Error: ${error?.message || error}\n`,
    );
    process.exit(1);
  });
}
