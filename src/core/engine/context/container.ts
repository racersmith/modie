/**
 * Modie Core Workspace Context Container.
 * Provides explicit, immutable context bundling root directory, VCS adapter,
 * repository configuration, and instance-scoped artifact definition registry.
 * Complies with RULE-25, RULE-28, RULE-34, ADR-1, ADR-2, ADR-4, and ADR-9.
 */

import { normalize, resolve } from "node:path";
import type { IVcsAdapter } from "../../platform/vcs/types.ts";
import { defaultVcsAdapter } from "../../platform/vcs/git-cli-adapter.ts";
import { loadModieConfig } from "../../platform/config/loader.ts";
import { createDefaultDefinitionRegistry } from "../../domain/registry.ts";
import type {
  CreateWorkspaceContextOptions,
  WorkspaceContext,
} from "./types.ts";
import {
  createWorkspaceContextSync,
  isWorkspaceContext,
  resolveDefaultRegistry,
  resolveWorkspaceContext,
  setDefaultRegistryFactory,
} from "./resolver.ts";

// Initialize default registry factory with standard core subtype definitions (RULE, ADR, TASK)
setDefaultRegistryFactory(createDefaultDefinitionRegistry);

export type { CreateWorkspaceContextOptions, WorkspaceContext };
export {
  createWorkspaceContextSync,
  isWorkspaceContext,
  resolveDefaultRegistry,
  resolveWorkspaceContext,
  setDefaultRegistryFactory,
};

/**
 * Creates an asynchronous WorkspaceContext, loading ModieConfig from the workspace root.
 */
export async function createWorkspaceContext(
  options: CreateWorkspaceContextOptions = {},
): Promise<WorkspaceContext> {
  const root = normalize(resolve(options.root ?? options.cwd ?? process.cwd()));
  const vcs = options.vcs ?? defaultVcsAdapter;
  const config = options.config ?? (await loadModieConfig(root, vcs));
  const registry = options.registry ?? resolveDefaultRegistry();

  return {
    root,
    get cwd() {
      return root;
    },
    vcs,
    config,
    registry,
  };
}

