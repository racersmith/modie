---
summary: Break down 600-850 line task service modules and refactor high-CC functions across task, query, and interface layers to prepare for CC <= 15 CI gates.
depends_on:
  - TASK-75

links:
  - RULE-8
  - RULE-28
  - RULE-34
---

# Context

Analysis via `check:complexity` indicates 10 functions across `src/` exceeding CC > 20, and several large modules in `src/core/task/` handling multiple mixed responsibilities (`branching.ts` at 838L, `query.ts` at 767L, `completion.ts` at 580L).

Extract focused single-responsibility modules:
- `src/core/task/ordering.ts`: natural ID sorting and comparison algorithms.
- `src/core/task/branch-guard.ts`: tree collision detection and branch validation.
- `src/core/task/readiness.ts`: task readiness calculation and status state machine.

Decompose complex control flow in `parsePlannedGovernanceSection`, `formatCompiledContextMarkdown`, `createArtifact`, and interface renderers to ensure every non-composition function meets CC <= 15.

# Acceptance Criteria

- [ ] Extract ordering.ts, branch-guard.ts, and readiness.ts from large src/core/task/ modules
- [ ] Decompose top high-risk branching functions in src/core/ and src/interfaces/ to CC <= 15
- [ ] Verify bun check:complexity reports zero functions in High Risk tier (CC > 20)
- [ ] Verify all tests pass with bun test:parallel && bun check && bun check:circular
- [ ] User Review
