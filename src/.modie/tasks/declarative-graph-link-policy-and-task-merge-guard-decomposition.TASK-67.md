---
depends_on:
  - TASK-64

links:
  - RULE-7
  - RULE-13
  - RULE-14
  - RULE-15
  - RULE-16
  - RULE-18
  - RULE-19
  - RULE-28
  - RULE-33
---

# Context

Per the maintainability review (§3.1, §4.3, §4.4, §5), two major validation and lifecycle hotspots in linking and task management require architectural refactoring:

1. **Declarative Link Policy vs Hardcoded Subtype Branches (`validateLinkTarget` CC 39, 174 lines)**:
   - `validateLinkTarget` in `src/core/linking/validator.ts` switches on source and target subtypes twice across syntax and resolution phases, containing 17 literal subtype checks (`RULE`, `ADR`, `TASK`) and hand-crafted error branches.
   - Replace literal branches with a declarative `LinkPolicyTable` specifying allowed target subtypes, ancestry directionality (`ancestor`, `descendant`, `same-or-ancestor`), and cycle constraints per relationship:
     ```ts
     const LINK_POLICY = {
       RULE: { links: { ADR: "ancestor" } },
       ADR:  { links: { ADR: "ancestor", RULE: "descendant" } },
       TASK: { links: { ADR: "ancestor", RULE: "ancestor" }, depends_on: { TASK: "acyclic" } },
     };
     ```
   - Structure the policy table so it can be incorporated directly into `ArtifactDefinition` (honoring the open-closed principle in preparation for Phase D), evaluated by a single pipeline checking `target subtype -> scope relation -> cycle`.

2. **Task Branch Merge Guard Decomposition (`mergeTaskBranch` CC 36, 188 lines)**:
   - `mergeTaskBranch` in `src/core/task/branching.ts` currently uses exceptions as control flow, checking error message strings (`error.message.includes(...)`) inside a `try/catch` to determine whether a task is complete. Rewording any error message breaks merge logic silently.
   - Decompose `mergeTaskBranch` into explicit, queryable pre-merge guard functions:
     `assertSourceBranchExists`, `assertTaskCompleted`, `resolveMergeTarget`, `assertNoActiveSubtasks`, `assertNoCollisions`.
   - Introduce typed domain error classes (`TaskIncompleteError`, `ActiveSubtaskPendingError`, `ArtifactCollisionError`) so callers can distinguish failures without string parsing.

3. **Core Link Mutation Result Shaping Duplication**:
   - `src/core/linking/mutation.ts` (lines 241–257) duplicates result payload formatting across `linkArtifact` and `unlinkArtifact`. Extract a shared `applyLinkMutation(source, target, rel, action)` helper to eliminate structural duplication.

# Acceptance Criteria

- [x] Define a declarative `LinkPolicyTable` specifying allowed target subtypes, ancestry directionality (`ancestor` vs `descendant`), and cycle requirements per subtype, architected for inclusion on `ArtifactDefinition`.
- [x] Refactor `validateLinkTarget` to evaluate links against the declarative policy table, reducing cyclomatic complexity from 39 to <= 10.
- [x] Replace error message string inspection in `mergeTaskBranch` with explicit pre-merge guard functions and typed domain error classes (`TaskIncompleteError`, `ActiveSubtaskPendingError`, `ArtifactCollisionError`).
- [x] Decompose `mergeTaskBranch` into linear lifecycle stages, reducing cyclomatic complexity from 36 to <= 10.
- [x] Deduplicate link/unlink mutation result shaping in `src/core/linking/mutation.ts` via a shared `applyLinkMutation` helper.
- [x] Verify link validation, task branch merge behavior, and error recovery against all link and task lifecycle test suites.
- [ ] User Review
