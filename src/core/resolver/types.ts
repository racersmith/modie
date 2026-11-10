/**
 * Types and interfaces for the artifact ID watermark resolver.
 * Complies with RULE-1, ADR-1, ADR-2, ADR-6, and ADR-9.
 */

import type { DiscoveredArtifact, IndexableSubtype } from "../domain/index.ts";
import type { WorkspaceContext } from "../context/types.ts";
import type { IVcsAdapter } from "../vcs/types.ts";

export type { DiscoveredArtifact, IndexableSubtype };

export interface DiscoveredTask {
  id: string;
  slug: string;
  filename: string;
  filepath: string;
  status: "active" | "deleted";
}

export type { AllocationStrategy, WatermarkDetails } from "../domain/types.ts";
import type { AllocationStrategy, WatermarkDetails } from "../domain/types.ts";


export interface WatermarkResolutionOptions {
  /**
   * Artifact subtype for watermark allocation (RULE, ADR, or TASK).
   * Defaults to "TASK".
   */
  subtype?: IndexableSubtype;

  /**
   * Root directory of the repository/workspace to scan.
   */
  cwd?: string;

  /**
   * Git branch name override (useful for explicit branch context).
   * If omitted, resolved automatically via git.
   */
  branch?: string;

  /**
   * Explicit task prefix tag (e.g. "J" for TASK-J1).
   * Overrides vcs/repository configuration if provided.
   */
  prefix?: string;

  /**
   * Force trunk monotonic allocation even when on a task or feature branch.
   */
  forceTrunk?: boolean;

  /**
   * Optional VCS adapter.
   */
  vcs?: IVcsAdapter;

  /**
   * Explicit workspace context container.
   */
  workspace?: WorkspaceContext;
}


