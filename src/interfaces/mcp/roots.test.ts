/**
 * Dynamic MCP Roots and Workspace Resolution Test Suite.
 * @verifies RULE-37
 */

import { describe, expect, it } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createDynamicWorkspaceManager } from "./roots.ts";
import { createWorkspaceContextSync } from "../../core/index.ts";

describe("[RULE-37] Dynamic MCP Workspace Roots Tracking", () => {
  it("should dynamically resolve workspace root from client roots/list", async () => {
    const server = new McpServer({ name: "test-server", version: "1.0.0" });
    const initialDir = "/home/test/initial";
    const remoteWorkspaceDir = "/home/test/remote-repo";

    // Mock server.server.listRoots
    (server.server as any).listRoots = async () => ({
      roots: [{ uri: `file://${remoteWorkspaceDir}`, name: "remote-repo" }],
    });

    const manager = createDynamicWorkspaceManager(server, {
      initialCwd: initialDir,
    });

    expect(manager.workspace.root).toBe(initialDir);

    const resolved = await manager.ensureWorkspace();
    expect(resolved.root).toBe(remoteWorkspaceDir);
    expect(manager.workspace.root).toBe(remoteWorkspaceDir);
    expect(manager.workspace.cwd).toBe(remoteWorkspaceDir);
  });

  it("should respect explicit workspace and not override with client roots", async () => {
    const server = new McpServer({ name: "test-server", version: "1.0.0" });
    const explicitDir = "/home/test/explicit";
    const explicitWorkspace = createWorkspaceContextSync({ root: explicitDir });

    (server.server as any).listRoots = async () => ({
      roots: [{ uri: "file:///home/test/other-repo", name: "other-repo" }],
    });

    const manager = createDynamicWorkspaceManager(server, {
      initialCwd: "/home/test/initial",
      explicitWorkspace,
    });

    const resolved = await manager.ensureWorkspace();
    expect(resolved.root).toBe(explicitDir);
    expect(manager.workspace.root).toBe(explicitDir);
  });

  it("should respect explicit environment CWD and not override with client roots", async () => {
    const server = new McpServer({ name: "test-server", version: "1.0.0" });
    const envDir = "/home/test/env-override";

    (server.server as any).listRoots = async () => ({
      roots: [{ uri: "file:///home/test/client-repo", name: "client-repo" }],
    });

    const manager = createDynamicWorkspaceManager(server, {
      initialCwd: envDir,
      hasExplicitEnvCwd: true,
    });

    const resolved = await manager.ensureWorkspace();
    expect(resolved.root).toBe(envDir);
    expect(manager.workspace.root).toBe(envDir);
  });

  it("should gracefully retain initial workspace when client roots/list fails", async () => {
    const server = new McpServer({ name: "test-server", version: "1.0.0" });
    const initialDir = "/home/test/fallback";

    (server.server as any).listRoots = async () => {
      throw new Error("Client does not support roots/list");
    };

    const manager = createDynamicWorkspaceManager(server, {
      initialCwd: initialDir,
    });

    const resolved = await manager.ensureWorkspace();
    expect(resolved.root).toBe(initialDir);
    expect(manager.workspace.root).toBe(initialDir);
  });
});

