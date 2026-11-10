/**
 * Types and interfaces for the Modie explicit workspace context container.
 * Complies with RULE-25, RULE-28, RULE-34, ADR-1, ADR-2, ADR-4, and ADR-9.
 */

import type { ModieConfig } from "../../platform/config/types.ts";
import type { IVcsAdapter } from "../../platform/vcs/types.ts";

/**
 * Structural definition registry interface decoupled from concrete subtype definitions.
 */
export interface DefinitionRegistry {
  register(definition: any): void;
  registerSubtype(subtype: string): void;
  get<TOptions = any, TArtifact = any>(subtype: any): any;
  has(subtype: any): boolean;
  isRegistered(subtype: any): boolean;
  getAll(): any[];
  clear(): void;
}

/**
 * Explicit, immutable workspace context container for Modie domain pipelines.
 */
export interface WorkspaceContext {
  readonly root: string;
  readonly cwd: string;
  readonly vcs: IVcsAdapter;
  readonly config: ModieConfig;
  readonly registry: DefinitionRegistry;
}

export interface CreateWorkspaceContextOptions {
  root?: string;
  cwd?: string;
  vcs?: IVcsAdapter;
  config?: ModieConfig;
  registry?: DefinitionRegistry;
}

