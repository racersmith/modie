# Architecture Linter & Blast-Radius Verification

## Problem & Motivation

Modie's core promise is **verifiable architectural governance**:
- Rules are falsifiable invariants cited by tests and code (`@verifies`, `[RULE-X]`).
- Code and tests must never cite ephemeral `TASK` tags or `ADR` decision records.
- Tasks have a strict downward blast radius (`<scopeDir>/**`) and cannot mutate sibling or ancestor files.

Currently, `modie scope audit` verifies *where* cited rules and ADRs should live (Deepest Common Ancestor placement), and `modie archive` verifies that active links are removed before archiving. However, three key invariants are still enforced only by agent instructions rather than automated verification in `bun run verify`:

1. **Zombie `TASK` or `ADR` Citations in Code/Tests:** An agent or human can accidentally leave `// @verifies TASK-89` or `it("[ADR-5] ...")` in a `.ts` file, creating a broken citation as soon as the task is completed and deleted.
2. **Unverified Rules (Folklore Drift):** A new `RULE` can be created and merged with **zero** inbound test or code citations, silently decaying into unverified prose.
3. **Unchecked Task Blast Radius (`RULE-6`):** During task execution on `task/<id>-<slug>`, nothing mechanically prevents `complete_task` / `modie task complete` from committing changes to files outside the task's declared `scopeDir`.

---

## Proposed Design

Because `findArtifactReferences`, `scanActiveArtifacts`, and the Git VCS adapter (`IVcsAdapter`) already exist in `src/core/`, all three checks can run in **<100ms** as part of `modie scope audit` (or a dedicated `modie check` command wired into `bun run verify`).

### 1. Forbidden Ephemeral & Rationale Citations Check

Scan source and test files (`src/**`) via a single `git grep -E "\b(TASK|ADR)-[0-9]+"` pass (excluding synthetic tag tests or ignored paths):

- **Flag any `TASK-<id>` citation in code or tests:** Tasks are ephemeral and deleted upon completion; code/tests must cite the durable `RULE` instead.
- **Flag any `@verifies ADR-<id>` or `[ADR-<id>]` in test titles:** ADRs are architectural rationale linked from `RULE` frontmatter (`links: [ADR-Y]`), not falsifiable test targets.
- **Flag dangling `RULE-<id>` citations:** Any `RULE-<id>` cited in code or tests that does not resolve to an active (non-archived) rule on disk is reported as a broken reference.

### 2. Unverified Rule Detection

During `modie scope audit` (or `modie check`):

- Inspect `foundIn.tests.length + foundIn.code.length` for every active `RULE`.
- If a rule has **0** test/code citations, surface a clear `UNVERIFIED` status (distinct from `INCHOATE`, which has $1\text{–}2$ citations):
  - In `modie task complete` / `complete_task`: block completion if a task created or linked a `RULE` that still has zero test/code citations.
  - In `bun run verify`: fail (or warn) when any active rule on trunk lacks verification citations.

### 3. Mechanical Blast-Radius Guard on Task Completion

In `completeTask` (`src/core/engine/lifecycle/completion.ts`):

- When completing a task on branch `task/<id>-<slug>`, query modified files against the base branch (`git diff --name-only <baseBranch>...HEAD` plus uncommitted working tree changes).
- Resolve each modified file path relative to the task's governing `scopeDir`.
- **Exemptions:** Allow `.modie/ideas/SPARKS.md` (the agent cognitive safety valve) and bidirectional `superseded_by` updates on ancestor artifacts when explicitly superseding.
- If any other modified file resides outside `scopeDir` (e.g. a task scoped to `src/interfaces/mcp` modified `src/core/engine/index.ts`), reject `complete_task` with an actionable recovery message:
  - Revert the out-of-scope file modification and capture the finding via `spark_add`, **or**
  - Relocate/decompose the task to cover the common ancestor scope (`--force` to override when intentional).

