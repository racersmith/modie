---
depends_on: []

links:
  - RULE-12
  - RULE-23
  - RULE-30
  - RULE-34
  - RULE-35
  - ADR-7
---

# Context

Review the Core Common Primitives test suite (`src/core/common/common.test.ts`) for test modernization opportunities under `FixtureWorkspace` and ensure complete compliance with zero false-positive citations.

### Guidance for Executing Agent:
1. **Fixture Workspace Modernization (RULE-34):**
   - Review temporary directory and filesystem handling in `src/core/common/common.test.ts`.
   - Migrate to `createFixtureWorkspace` and typed helpers (`workspace.createTask`, `workspace.createRule`, `workspace.createAdr`, `workspace.writeFile`, `workspace.readFile`, `workspace.mkdir`, `workspace.remove`, `workspace.resolve`, `workspace.cleanup`) imported from `../testing/index.ts`.
   - Eliminate manual `mkdtemp`, `rm`, `tmpdir`, and raw disk mutations.
2. **Zero False-Positive Citations (RULE-35):**
   - Inspect all test fixture data, mock parameters, template literals, and equality assertions for hardcoded governance tags (e.g., literal `"RULE-1"`, `"ADR-1"`, `"TASK-1"`, `"RULE-25"`).
   - Parameterize test tags using `makeTestTag(subtype, id)` from `../testing/index.ts` to prevent the static reference scanner from matching test data lines as citations.
   - Maintain legitimate test verification annotations (`@verifies RULE-XX, ADR-YY` and `[RULE-XX][ADR-YY]` test titles) per ADR-7 and RULE-23.
3. **Verification:**
   - Run `bun test src/core/common/common.test.ts` to confirm 100% test pass rate with hermetic workspace isolation.
   - Run `bun run src/interfaces/cli/bin.ts references <TAG>` on any cited rules to verify this test file produces zero false-positive citations.
4. **Lifecycle & Governance Invariants:**
   - Never reference ephemeral task IDs (`TASK-43-7`) in code comments or test headers (ADR-6, RULE-21).
   - Execute the standard two-phase commit ceremony upon completion (RULE-32).

# Acceptance Criteria

- [ ] Review the target test suite and refactor temporary directory and test fixture handling to use createFixtureWorkspace and typed workspace helpers per RULE-34
- [ ] Eliminate hardcoded governance tag literals in fixture data and test assertions by parameterizing with makeTestTag per RULE-35
- [ ] Verify all tests in the suite pass cleanly under bun test with full test isolation
- [ ] Verify modie references queries on cited governance rules yield zero false-positive citations from this test file
