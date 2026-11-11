/**
 * Dynamic MCP Client Workspace Resolution and Roots Tracking.
 * Complies with RULE-37 and ADR-12: dynamically inherits the client's active workspace.
 */

import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RootsListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  createWorkspaceContextSync,
  type WorkspaceContext,
} from "../../core/index.ts";
import type { IVcsAdapter } from "../../core/platform/vcs/types.ts";

export interface DynamicWorkspaceManager {
  workspace: WorkspaceContext;
  ensureWorkspace: () => Promise<WorkspaceContext>;
}

export function createDynamicWorkspaceManager(
  server: McpServer,
  options: {
    initialCwd: string;
    explicitWorkspace?: WorkspaceContext;
    vcs?: IVcsAdapter;
    hasExplicitEnvCwd?: boolean;
    stderr?: (msg: string) => void;
  },
): DynamicWorkspaceManager {
  let currentWorkspace =
    options.explicitWorkspace ??
    createWorkspaceContextSync({ root: options.initialCwd, vcs: options.vcs });

  const dynamicWorkspace: WorkspaceContext = {
    get root() {
      return currentWorkspace.root;
    },
    get cwd() {
      return currentWorkspace.cwd;
    },
    get vcs() {
      return currentWorkspace.vcs;
    },
    get config() {
      return currentWorkspace.config;
    },
    get registry() {
      return currentWorkspace.registry;
    },
  };

  let rootsResolved = false;

  const updateFromRoots = async () => {
    if (options.explicitWorkspace || options.hasExplicitEnvCwd) return;
    try {
      const result = await server.server.listRoots();
      if (result.roots && result.roots.length > 0) {
        const rootUri = result.roots[0]?.uri;
        if (rootUri && rootUri.startsWith("file://")) {
          const rootPath = fileURLToPath(rootUri);
          currentWorkspace = createWorkspaceContextSync({
            root: rootPath,
            vcs: options.vcs,
          });
          rootsResolved = true;
        }
      }
    } catch {
      // Client does not support roots/list; retain fallback workspace
    }
  };

  const originalOnInitialized = server.server.oninitialized;
  server.server.oninitialized = async () => {
    originalOnInitialized?.();
    await updateFromRoots();
  };

  server.server.setNotificationHandler(
    RootsListChangedNotificationSchema,
    async () => {
      await updateFromRoots();
    },
  );

  return {
    workspace: dynamicWorkspace,
    ensureWorkspace: async () => {
      if (
        !rootsResolved &&
        !options.explicitWorkspace &&
        !options.hasExplicitEnvCwd
      ) {
        await updateFromRoots();
      }
      return dynamicWorkspace;
    },
  };
}

