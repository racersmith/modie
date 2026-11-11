/**
 * Types and interfaces for document linking, frontmatter link mutation,
 * and DAG invariant validation.
 * Complies with RULE-7, RULE-13, RULE-14, RULE-15, RULE-16, and RULE-17
 * RULE-18, RULE-19, RULE-25, and RULE-36.
 */

import type { ResolvedArtifact } from "../../domain/index.ts";
import type { WorkspaceContext } from "../context/types.ts";
import type {
  ArtifactLinkRelationship,
  SubtypeLinkPolicy,
} from "../../domain/graph/types.ts";

export interface ValidateLinkOptions {
  /**
   * Workspace root directory (defaults to process.cwd()).
   */
  cwd?: string;

  /**
   * Explicit workspace context container.
   */
  workspace?: WorkspaceContext;

  /**
   * Optional explicit relationship override ("links" or "depends_on").
   * When omitted, automatically inferred from source and target subtypes per RULE-13.
   */
  relationship?: ArtifactLinkRelationship;

  /**
   * Optional link policy override for the source artifact.
   */
  policy?: SubtypeLinkPolicy;
}

export interface ValidatedLinkContext {
  source: ResolvedArtifact;
  target: ResolvedArtifact;
  relationship: ArtifactLinkRelationship;
  sourceScopeDir: string;
  targetScopeDir: string;
}

export interface MutateArtifactLinkOptions extends ValidateLinkOptions {
  /**
   * Source artifact tag (e.g. "RULE-16", "ADR-5"), slug, or file path.
   */
  source: string;

  /**
   * Target artifact tag (e.g. "ADR-5", "RULE-13"), slug, or file path.
   */
  target: string;
}

export interface LinkMutationResult {
  /**
   * Mutation action performed ("link" or "unlink").
   */
  action: "link" | "unlink";

  /**
   * Frontmatter relationship field mutated ("links" or "depends_on").
   */
  relationship: ArtifactLinkRelationship;

  /**
   * Whether the source file on disk was modified (false if link was already present or already absent).
   */
  changed: boolean;

  /**
   * Resolved source artifact metadata.
   */
  source: ResolvedArtifact;

  /**
   * Resolved target artifact metadata.
   */
  target: ResolvedArtifact;

  /**
   * Updated frontmatter `links` array on the source artifact.
   */
  links: string[];

  /**
   * Updated frontmatter `depends_on` array on the source artifact (if present or TASK).
   */
  depends_on?: string[];

  /**
   * Absolute filepath of the mutated source artifact.
   */
  filepath: string;

  /**
   * Relative filepath of the mutated source artifact from workspace root.
   */
  relativePath: string;
}
