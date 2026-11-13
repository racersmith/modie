# Targeted Rule Citations & Meta-Rule Scoping

> Consolidated from sparks `[77f9]` (*Review tag application in test assertions*) and `[864f]` (*Directed application for repository-wide rules*).

## Problem & Motivation

In Modie's test suite today, it is common to see multi-tag prefixes stamped onto `describe` and `it` blocks:

```typescript
// @verifies RULE-A, RULE-B, RULE-C, RULE-D, RULE-E
it("[RULE-A][RULE-B][RULE-C][RULE-D][RULE-E] should create a task with machine path to stdout", async () => {
  // ...
});
```

This creates two compounding problems:

1. **Low-Signal Verification Links (`[77f9]`):**
   When a single `it(...)` block cites 5–8 different rules, `modie references` cannot tell a developer or agent *which* `expect()` statement verifies *which* invariant. You have to read all 6 rules and reverse-engineer the test body to understand what is actually being tested.
2. **The Hidden DCA Feedback Loop for Meta-Rules (`[864f]`):**
   Why did tests across `cli/`, `mcp/`, and `engine/` end up stamping fixture-hygiene rules (such as isolated temporary workspaces or synthetic test tag helpers) onto every feature test?
   Because `evaluateArtifactPlacement` in `src/core/engine/query/placement.ts` computes the **Deepest Common Ancestor (DCA)** from citing files (requiring $\ge 3$ citations). If a repository-wide meta-rule is only cited in its dedicated unit test inside `src/core/platform/testing/`, `modie scope audit` flags the rule as `OVER_SCOPED` at `src/` and recommends demoting it to `src/core/platform/testing/`—where `src/interfaces/` tasks would no longer inherit it!
   To prevent `scope audit` from demoting repository-wide rules, authors were forced to sprinkle compliance tags across unrelated tests in every subtree just to keep the DCA anchored at `src/`.

---

## Core Distinction: Verification vs. Enforcement vs. Compliance

To eliminate tag noise while keeping `modie scope audit` accurate, Modie should distinguish three relationships between code/tests and a `RULE`:

| Relationship | Meaning | Example | Should it cite the rule? |
| :--- | :--- | :--- | :--- |
| **Verification** (`@verifies`) | A test assertion that actively attempts to falsify the rule's invariant. | Testing that `runCli` writes JSON to `stdout` and status to `stderr`. | **Yes** — at the specific `it(...)` or `expect(...)` line. |
| **Enforcement** (`@enforces`) | Production or harness code that implements the guardrail or primitive enforcing the rule. | `FixtureWorkspace` isolating `.modie/` state, or a static test scanning `*.test.ts` for literal tags. | **Yes** — in the enforcing module/helper. |
| **Compliance** *(Implicit)* | Everyday code or feature tests that merely *obey* the rule while testing something else. | A CLI test calling `createFixtureWorkspace()` to test `modie link`. | **No** — obeying a rule is not verifying it. |

---

## Proposed Design

### 1. Assertion-Level & Single-Invariant Test Citations

Instead of stacking 6 tags on a `describe` or `it` header:

- **One primary rule per `it(...)` block** when the test is dedicated to a single invariant:
  ```typescript
  it("[RULE-X] writes exclusively machine-parseable path to stdout", async () => {
    expect(stdout).toBe(".modie/tasks/example.md");
  });
  ```
- **Inline `// @verifies` comments directly above `expect(...)` blocks** when an integration test exercises multiple invariants in sequence:
  ```typescript
  it("creates a task and separates output streams", async () => {
    const { exitCode, stdout, stderr } = await captureCli([...]);
    expect(exitCode).toBe(0);

    // @verifies RULE-X (stdout stream separation)
    expect(stdout).toContain(".modie/tasks/");
    expect(stdout).not.toContain("✓");

    // @verifies RULE-Y (monotonic ID allocation)
    expect(stderr).toContain("✓ Created task");
  });
  ```
- Because `citation-source.ts` and `citation-classifier.ts` already classify `// @verifies` on any line inside `*.test.ts` and capture the exact line number, `modie references` will point directly to the assertion line rather than a generic test header.

### 2. Decoupling Meta-Rule Governance Scope from Citation DCA

Repository-wide rules (e.g., *"All engine and CLI tests must use isolated FixtureWorkspace instances"* or *"Test fixtures must not contain literal governance tags"*) govern the entire `src/` tree, even though they are enforced and verified in one central place (`src/core/platform/testing/` or a single static meta-test).

We can support this cleanly in one of two ways (or both):

1. **Frontmatter Scope Pinning (`scope: pinned` or `audit: pinned`):**
   - Allow a rule's YAML frontmatter to declare `scope: pinned` (or `pinned: true`).
   - In `auditArtifactPlacement` (`src/core/engine/query/placement.ts`), if a rule has `pinned: true` (and has zero `UNDER_SCOPED` out-of-bounds violations), classify it as `OPTIMAL` at its declared directory without recommending demotion to a deeper subtree.
2. **Static Meta-Tests Instead of Per-File Compliance Stamps:**
   - Replace scattered compliance tags across 40 test files with a single deterministic meta-test (e.g., in `src/core/platform/testing/hygiene.test.ts` or `modie check`) that scans `src/**/*.test.ts` to verify that no test mutates host `.modie/` state or hardcodes literal tags.
   - Only that meta-test and the `FixtureWorkspace` implementation cite the meta-rule, cutting hundreds of noisy tag occurrences across the test suite.

### 3. Updating Agent Instructions (`modie://instructions`)

Add a concise guideline to `src/interfaces/mcp/instructions.md`:
- **Cite only what the test falsifies:** Never add `[RULE-X]` to a test just because the test uses a helper governed by `RULE-X`. Only cite rules whose invariant would cause the test's `expect()` assertions to fail if broken.
- **Prefer assertion-level `@verifies` over multi-tag headers:** When a test checks more than two rules, place `// @verifies RULE-X` immediately above the relevant `expect()` group.
