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

  it("should gracefully retain initial workspace and log diagnostic once when client roots/list fails", async () => {
    const server = new McpServer({ name: "test-server", version: "1.0.0" });
    const initialDir = "/home/test/fallback";
    const stderrLogs: string[] = [];

    (server.server as any).listRoots = async () => {
      throw new Error("Client does not support roots/list");
    };

    const manager = createDynamicWorkspaceManager(server, {
      initialCwd: initialDir,
      stderr: (msg) => stderrLogs.push(msg),
    });

    const resolved1 = await manager.ensureWorkspace();
    const resolved2 = await manager.ensureWorkspace();
    expect(resolved1.root).toBe(initialDir);
    expect(resolved2.root).toBe(initialDir);
    expect(manager.workspace.root).toBe(initialDir);
    expect(stderrLogs).toHaveLength(1);
    expect(stderrLogs[0]).toContain("roots/list fallback");
    expect(stderrLogs[0]).toContain("Client does not support roots/list");
  });

  it("should log diagnostic when client returns empty roots list", async () => {
    const server = new McpServer({ name: "test-server", version: "1.0.0" });
    const initialDir = "/home/test/fallback-empty";
    const stderrLogs: string[] = [];

    (server.server as any).listRoots = async () => ({ roots: [] });

    const manager = createDynamicWorkspaceManager(server, {
      initialCwd: initialDir,
      stderr: (msg) => stderrLogs.push(msg),
    });

    await manager.ensureWorkspace();
    expect(stderrLogs).toHaveLength(1);
    expect(stderrLogs[0]).toContain("no file:// workspace roots");
  });

  it("should resolve per-call workspace overrides without mutating server-wide workspace state", async () => {
    const server = new McpServer({ name: "test-server", version: "1.0.0" });
    const defaultDir = "/home/test/default-repo";
    const windowADir = "/home/test/window-a";
    const windowBDir = "/home/test/window-b";

    (server.server as any).listRoots = async () => {
      throw new Error("unsupported");
    };

    const manager = createDynamicWorkspaceManager(server, {
      initialCwd: defaultDir,
    });

    const ctxA = await manager.resolveCallWorkspace(windowADir);
    const ctxB = await manager.resolveCallWorkspace(windowBDir);
    const ctxDefault = await manager.resolveCallWorkspace();

    expect(ctxA.root).toBe(windowADir);
    expect(ctxB.root).toBe(windowBDir);
    expect(ctxDefault.root).toBe(defaultDir);
    expect(manager.workspace.root).toBe(defaultDir);
  });
});
