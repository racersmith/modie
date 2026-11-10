/**
 * Declarative link and dependency governance policy matrix.
 * Enforces subtype compatibility, spatial ancestry/subtree scoping,
 * and DAG cycle constraints per ADR-5, ADR-13, RULE-7, RULE-13, RULE-14, RULE-15,
 * RULE-16, RULE-17, RULE-18, RULE-19, and RULE-38.
 */

import type {
  LinkPolicyTable,
  SubtypeLinkPolicy,
} from "./types.ts";

/**
 * Canonical system link policy table for default Modie artifact subtypes.
 * Complies with ADR-5, RULE-7, RULE-13, RULE-14, RULE-15, RULE-16, RULE-17,
 * RULE-18, and RULE-19.
 */
export const LINK_POLICY: LinkPolicyTable = {
  RULE: {
    links: {
      ADR: "ancestor",
    },
  },
  ADR: {
    links: {
      ADR: "ancestor",
      RULE: "descendant",
    },
  },
  TASK: {
    links: {
      ADR: "ancestor",
      RULE: "ancestor",
    },
    depends_on: {
      TASK: "acyclic",
    },
  },
};

/**
 * Resolves the link policy for an artifact subtype, prioritizing any custom policy
 * attached to the caller or artifact definition, falling back to the canonical `LINK_POLICY`.
 */
export function resolveSubtypeLinkPolicy(
  subtype: string,
  customPolicy?: SubtypeLinkPolicy,
): SubtypeLinkPolicy | undefined {
  if (customPolicy) {
    return customPolicy;
  }
  return LINK_POLICY[subtype.toUpperCase()];
}

