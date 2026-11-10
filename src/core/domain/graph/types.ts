/**
 * Modie Core Domain Layer: Graph primitives and linking types.
 * Defines graph relationships, link ancestry scopes, and declarative link policies (ADR-5, ADR-13, RULE-38).
 */

export type ArtifactLinkRelationship = "links" | "depends_on";

export type FrontmatterListField =
  | ArtifactLinkRelationship
  | "supersedes"
  | "superseded_by";

/**
 * Permitted ancestry directionality and graph topology constraint for a link target.
 * - "ancestor": Target artifact must reside in source's directory or an ancestor directory.
 * - "descendant": Target artifact must reside in source's directory or a descendant subtree.
 * - "same-or-ancestor": Alias for ancestor-or-self directory constraint.
 * - "acyclic": Target is exempt from directory ancestry but must maintain a DAG without circular cycles.
 * - "any": Unrestricted spatial scope.
 */
export type LinkAncestryScope =
  | "ancestor"
  | "descendant"
  | "same-or-ancestor"
  | "acyclic"
  | "any";

/**
 * Declarative link policy for a single artifact subtype, mapping frontmatter relationship
 * fields ("links", "depends_on") to allowed target subtypes and ancestry/topology constraints.
 */
export type SubtypeLinkPolicy = {
  [relationship in ArtifactLinkRelationship]?: {
    [targetSubtype: string]: LinkAncestryScope;
  };
};

/**
 * Declarative system-wide link policy table keyed by uppercase artifact subtype ("RULE", "ADR", "TASK").
 */
export type LinkPolicyTable = Record<string, SubtypeLinkPolicy>;

