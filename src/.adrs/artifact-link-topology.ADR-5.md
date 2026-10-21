---
links:
  - ADR-4
  - RULE-7
  - RULE-10
  - RULE-12
  - RULE-13
  - RULE-14
  - RULE-15
  - RULE-16
  - RULE-17
  - RULE-18
  - RULE-19
---

# Context

As artifacts reference one another across the codebase to establish traceability (e.g. which rules enforce an ADR, or which decisions a task satisfies), unrestricted cross-linking threatens the integrity of Canon's tree-as-DAG model. If documents can link to arbitrary sibling directories or across incompatible lifecycle boundaries, upward compilation suffers from context graph explosion, and permanent documentation suffers from link rot caused by ephemeral references.

# Alternatives Considered

- **Unrestricted Cross-Linking:** Allows any document to link to any other document anywhere in the repository. Breaks upward traversal isolation, risks cyclic references, and allows permanent records to link to ephemeral tasks.
- **Strictly Colocated Links Only:** Requires linked documents to be siblings in the exact same directory. Eliminates hierarchy and prevents tasks and rules from referencing foundational, high-level ADRs or parent rules.
- **Semantic Link Attributes (`satisfies:`, `justified_by:`, `blocks:`):** Introduces schema complexity into frontmatter that increases authoring friction and requires complex parser rules.

# Decision

We adopt a unified flat `links:` list for architectural context and a dedicated `depends_on:` list for task execution sequencing, governed by three validation invariants:

1. **Subtype Compatibility Matrix for `links:`:**
   - `ADR` can link to `ADR` (ancestor decisions or supersession) and `RULE` (invariants established by this decision).
   - `RULE` can link to `ADR` (architectural justification). Rules do not link to other rules; rule inheritance and composition are naturally modeled by the directory tree hierarchy.
   - `TASK` can link to `ADR` and `RULE` (architectural governance and invariants).
   - Permanent artifacts (`ADR`, `RULE`) must never link to ephemeral artifacts (`TASK`).
   - `MOTIVE` and `GIST` never declare links.

2. **DAG Spatial Directional Constraints for `links:`:**
   - **Upward or Local (`ancestor_or_self`):** `TASK` $\rightarrow$ `RULE`/`ADR`, `RULE` $\rightarrow$ `ADR`, and `ADR` $\rightarrow$ `ADR`.
   - **Local or Downward Subtree (`descendant_or_self`):** `ADR` $\rightarrow$ `RULE` (documenting the rules spawned by a decision).
   - **Sideways References Prohibited:** Linking to an unrelated sibling subtree is rejected by the graph validator to preserve bounded, token-efficient upward context compilation.

3. **Task Execution Dependencies (`depends_on:`):**
   - While `links:` defines architectural context and is strictly bounded by filesystem ancestry to prevent prompt inflation, task workflow sequencing is declared via `depends_on:`.
   - `depends_on:` exclusively references other `TASK` artifacts.
   - `depends_on:` is exempt from filesystem directory ancestry constraints to allow cross-package or cross-module workflows (e.g., an MCP task waiting on a Core task).
   - The workflow engine asserts that the resulting task execution graph is a Directed Acyclic Graph (DAG) with no circular dependencies.
