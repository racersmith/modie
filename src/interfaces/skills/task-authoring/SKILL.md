---
name: task-authoring
description: Best practices, guidelines, and rules for authoring, sequencing, and executing Modie task artifacts.
---

# Task Authoring & Lifecycle Guide

This skill guides AI agents and engineers in authoring high-quality, resilient `TASK` artifacts within Modie-governed repositories.

## 1. Core Invariants & Rules

Every task must strictly adhere to the following governance rules:

* **Path Decoupling ([RULE-30](file:///home/josh/Documents/version_control/modie/src/.rules/task-specification-path-invariance.RULE-30.md))**:
  Task specifications and acceptance criteria must define deliverables in terms of **component roles, behavioral contracts, or testable capabilities** rather than concrete filesystem paths.
* **Acceptance Criteria Format ([RULE-22](file:///home/josh/Documents/version_control/modie/src/.rules/task-acceptance-criteria.RULE-22.md))**:
  Deliverables must be declared as a Markdown checklist (`- [ ]`) under an `# Acceptance Criteria` section. A task must not be marked complete or deleted until all items are satisfied (`- [x]`).
* **Blast Radius ([RULE-6](file:///home/josh/Documents/version_control/modie/src/.rules/task-blast-radius.RULE-6.md))**:
  A task must represent a single, cohesive, atomic unit of work with bounded scope.
* **Link Targets ([RULE-15](file:///home/josh/Documents/version_control/modie/src/.rules/task-link-targets.RULE-15.md))**:
  Task frontmatter `links` must exclusively reference `ADR-` and `RULE-` artifacts (never `TASK-`, `MOTIVE-`, or `GIST-`).
* **Dependencies ([RULE-18](file:///home/josh/Documents/version_control/modie/src/.rules/task-execution-dependencies.RULE-18.md))**:
  Task prerequisites must be declared in frontmatter `depends_on` referencing prerequisite `TASK-` IDs.
* **Two-Phase Completion ([ADR-6](file:///home/josh/Documents/version_control/modie/src/.adrs/ephemeral-task-lifecycle.ADR-6.md), [RULE-21](file:///home/josh/Documents/version_control/modie/src/.rules/task-completion-deletion.RULE-21.md))**:
  Tasks are ephemeral. Once verified complete in Git, the task file is deleted from disk to eliminate context pollution.

---

## 2. Best Practices for Formulating Acceptance Criteria

### Avoid Concrete File Path Rot (RULE-30)

When refactorings, directory restructurings, or renames occur between task planning and task execution, hardcoded file paths become stale and misleading.

| ❌ Fragile (Path-Coupled) | ✅ Resilient (Role- & Contract-Based) |
|---|---|
| `- [ ] Implement createAdr core service in src/core/adr-creation.ts` | `- [ ] Implement createAdr core service in the ADR domain module enforcing RULE-14 link targets and RULE-17 descendant scope` |
| `- [ ] Add template renderer in src/core/primitives/adr/template.ts` | `- [ ] Implement ADR markdown template renderer generating standard sections (Context, Alternatives, Decision) per ADR-4` |
| `- [ ] Create test in src/interfaces/cli/commands/adr/adr-create.test.ts` | `- [ ] Add CLI integration tests verifying argument parsing, link validation, and RULE-27 stream separation` |

### Criteria Design Checklist

1. **Observable**: Each item should describe a distinct, verifiable outcome (test passes, interface contract satisfied, command outputs valid JSON).
2. **Atomic**: Break multi-step deliverables into 3 to 6 focused items.
3. **Punctuation-Safe**: When using the CLI to create tasks, use repeated `-a` / `--criterion` flags to preserve item text verbatim without unintended comma-splitting:
   ```bash
   modie task create "Title" \
     -c "Context statement" \
     -l ADR-4 -l RULE-30 \
     -a "First criterion statement" \
     -a "Second criterion statement"
   ```

---

## 3. Managing Task Execution Programmatically

* **Inspect queue**:
  ```bash
  modie task list
  ```
* **Inspect deep status**:
  ```bash
  modie task status TASK-XX
  ```
* **Advance progress**:
  ```bash
  modie task check TASK-XX --item 1
  ```
* **Verify completion**:
  Once all checklist items are satisfied (`modie task status TASK-XX` shows 100%), verify tests and typechecks before completing the task.
