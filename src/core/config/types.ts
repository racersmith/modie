/**
 * Configuration types and interfaces for Modie.
 * Complies with ADR-9, ADR-10, and RULE-28.
 */

export interface ModieGitConfig {
  /**
   * Primary trunk development branch (e.g. "dev" or "main").
   * Default: "dev" (if branch exists), else "main".
   */
  trunk?: string;

  /**
   * Protected branches where direct task starting and task merging are guarded.
   * Default: ["main", "master"].
   */
  protectedBranches?: string[];

  /**
   * Prefix override for task/artifact IDs (e.g. from `modie.prefix`).
   */
  prefix?: string;
}

export interface ModieConfig {
  git?: ModieGitConfig;
  trunk?: string;
  protectedBranches?: string[];
  prefix?: string;
}

export interface ResolvedModieConfig {
  trunk: string;
  protectedBranches: string[];
  prefix?: string;
  configPath?: string;
}
