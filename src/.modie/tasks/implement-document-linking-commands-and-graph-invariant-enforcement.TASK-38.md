---
depends_on: []

links:
  - ADR-5
  - RULE-7
  - RULE-13
  - RULE-15
  - RULE-16
  - RULE-17
  - RULE-18
  - RULE-19
  - RULE-25
  - RULE-27
  - RULE-30
---

# Context

Provide first-class document linking and unlinking capabilities via modie link and modie unlink (along with MCP tools), naturally validating and enforcing DAG invariants from ADR-5 (subtype compatibility matrix, ancestral scope, sibling subtree prohibitions, and acyclic task dependency graph validation).

# Planned Governance

## Rules
- [ ] Document Link Mutation and Graph Invariant Enforcement

# Acceptance Criteria

- [ ] Implement core graph and link validation engine enforcing subtype compatibility, spatial ancestry/subtree scoping, and cycle detection for task dependencies per ADR-5, RULE-13, RULE-15, RULE-16, RULE-17, RULE-18, and RULE-19
- [ ] Implement core link mutation service that safely adds or removes links/dependencies in frontmatter blocks without modifying document bodies or corrupting YAML structure
- [ ] Support automatic relationship inference based on artifact subtype matrix (mapping task-to-task relationships to depends_on and governance references to links) with optional explicit overrides
- [ ] Implement CLI link and unlink commands with clear error reporting to stderr on constraint violations and structured success output
- [ ] Expose link_artifact and unlink_artifact MCP tools returning structured results and informative validation error messages
- [ ] Add unit and integration tests covering valid link mutations, subtype rejections, circular dependency detection, and spatial subtree constraint enforcement
