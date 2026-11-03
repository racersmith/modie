---
depends_on:
  - TASK-64

links:
  - RULE-2
  - RULE-6
  - RULE-8
  - RULE-20
  - RULE-29
---

# Context

Per the maintainability review (§3.4, §4.1, §4.2, §5), two high-complexity query pipelines in `src/core/query/` and several duplicated directory traversal routines need modular decomposition:

1. **Context Compilation Hotspot (`compileContext` CC 36, 247 lines)**:
   - Target identification in `src/core/query/context.ts` (lines 188–290) is currently a 4-level nested if/else structure that repeats the 5-line task context compilation 4 times and artifact context compilation twice.
   - Decompose into an early-return candidate matcher:
     `resolveContextTarget(input, cwd): ContextTarget` evaluating `tryTask() ?? tryArtifact() ?? tryBareTaskId() ?? resolvePath()`.
   - Restructure `compileContext` into a clean, linear collection pipeline: `collectMotives`, `collectRules`, `collectAdrs`, `collectGists`.

2. **Artifact Tag Resolution Hotspot (`resolveArtifactByTag` CC 34, 200 lines)**:
   - `resolveArtifactByTag` in `src/core/query/artifact-query.ts` currently embeds three distinct lookup strategies inline (path on disk -> workspace scan -> git history), manually constructing `ResolvedArtifact` objects and duplicating ADR summary extraction.
   - Refactor into an explicit strategy chain:
     `const strategies = [byExistingPath, byWorkspaceScan, ...(opts.history ? [byHistory] : [])];`
     with a unified `toResolvedArtifact(hit, ctx)` mapper.

3. **Misplaced ADR Parsing & Traversal Duplications**:
   - `extractAdrSummary` is ADR-specific but currently misplaced in generic `src/core/query/markdown-parser.ts`. Move and unify ADR summary extraction into a reusable helper.
   - Ancestral scope traversal is duplicated between `computeAncestralScopes` (`src/core/query/scope.ts`) and `buildAncestralScopes` (`src/core/query/context.ts`). Unify into a single ancestral scope traversal with an optional filter.
   - A 32-line structural clone exists between `src/core/gist/paths.ts` and `src/core/motive/paths.ts` (along with duplicated `extractCwd`). Extract a shared `walkAncestorsForFile` helper.

# Acceptance Criteria

- [ ] Extract `resolveContextTarget` with early-return candidate matching (`tryTask() ?? tryArtifact() ?? tryBareTaskId() ?? resolvePath()`), reducing `compileContext` cyclomatic complexity to <= 10.
- [ ] Restructure `compileContext` into a linear collection pipeline (`collectMotives`, `collectRules`, `collectAdrs`, `collectGists`).
- [ ] Decompose `resolveArtifactByTag` into a strategy chain (`byExistingPath`, `byWorkspaceScan`, `byHistory`), reducing cyclomatic complexity to <= 10.
- [ ] Unify ADR summary extraction into a reusable helper decoupled from generic markdown parsing.
- [ ] Unify `computeAncestralScopes` and `buildAncestralScopes` into a single shared ancestral traversal utility with filtering options.
- [ ] Deduplicate ancestral file discovery between `gist/paths.ts` and `motive/paths.ts` via a shared `walkAncestorsForFile` helper.
- [ ] Verify context compilation and artifact tag resolution contracts across all test suites with zero regressions.
- [ ] User Review
