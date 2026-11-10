/**
 * Modie Core Workspace Context Resolver and Type Guards.
 * Provides pure context resolution, type checking, and synchronous context fallback.
 * Decoupled from concrete subtype definitions to prevent circular dependencies.
 * Complies with RULE-25, RULE-28, RULE-34, ADR-1, ADR-2, ADR-4, and ADR-9.
 */

import { normalize, resolve } from "node:path";
import type { IVcsAdapter } from "../vcs/types.ts";
import { defaultVcsAdapter } from "../vcs/git-cli-adapter.ts";
import {
  createDefinitionRegistry,
  type DefinitionRegistry,
} from "../domain/index.ts";
import type {
  CreateWorkspaceContextOptions,
  WorkspaceContext,
} from "./types.ts";

let defaultRegistryFactory: (() => DefinitionRegistry) | undefined;

/**
 * Sets the default factory used to construct a DefinitionRegistry populated with standard subtypes.
 */
export function setDefaultRegistryFactory(
  factory: () => DefinitionRegistry,
): void {
  defaultRegistryFactory = factory;
}

/**
 * Resolves the default DefinitionRegistry using the registered factory or an empty fallback.
 */
export function resolveDefaultRegistry(): DefinitionRegistry {
  return defaultRegistryFactory
    ? defaultRegistryFactory()
    : createDefinitionRegistry();
}

/**
 * Type guard checking if an unknown value is a valid WorkspaceContext.
 */
export function isWorkspaceContext(obj: unknown): obj is WorkspaceContext {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "root" in obj &&
    "vcs" in obj &&
    "registry" in obj &&
    typeof (obj as { root: unknown }).root === "string"
  );
}

/**
 * Creates a synchronous WorkspaceContext without disk config loading.
 */
export function createWorkspaceContextSync(
  options: CreateWorkspaceContextOptions = {},
): WorkspaceContext {
  const root = normalize(resolve(options.root ?? options.cwd ?? process.cwd()));
  const vcs = options.vcs ?? defaultVcsAdapter;
  const config = options.config ?? {};
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

/**
 * Resolves a WorkspaceContext from an existing context, options container, or fallback values.
 */
export function resolveWorkspaceContext(
  contextOrOptions?:
    | WorkspaceContext
    | (CreateWorkspaceContextOptions & {
        workspace?: WorkspaceContext;
      })
    | string,
  fallbackVcs?: IVcsAdapter,
): WorkspaceContext {
  if (!contextOrOptions) {
    return createWorkspaceContextSync({ vcs: fallbackVcs });
  }
  if (typeof contextOrOptions === "string") {
    return createWorkspaceContextSync({
      root: contextOrOptions,
      vcs: fallbackVcs,
    });
  }
  if (isWorkspaceContext(contextOrOptions)) {
    return contextOrOptions;
  }
  if ("workspace" in contextOrOptions && contextOrOptions.workspace) {
    return contextOrOptions.workspace;
  }
  return createWorkspaceContextSync({
    root: contextOrOptions.root ?? contextOrOptions.cwd,
    vcs: contextOrOptions.vcs ?? fallbackVcs,
    config: contextOrOptions.config,
    registry: contextOrOptions.registry,
  });
}
