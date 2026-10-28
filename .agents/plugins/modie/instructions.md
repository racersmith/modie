# Modie Agent Instructions & Authoring Best Practices

Modie is a strict, decentralized architectural governance and task lifecycle engine. As an AI agent working in a Modie-governed repository, follow these core principles and workflows:

---

## 1. Ephemeral Task Decoupling (Critical Anti-Pattern)

> **WARNING**: Never reference ephemeral `TASK-XX` IDs in test headers (e.g. `[TASK-XX]`), code implementation comments, or docstrings (e.g. `@verifies TASK-XX`).

- **Tasks are Ephemeral**: Once completed, a task artifact is permanently deleted from disk. Any code or tests citing `TASK-XX` will quickly become stale references pointing to non-existent files.
- **Stop and Extract Rules**: If you find yourself wanting to cite a task in code or tests, **STOP**. That indicates you have identified a durable invariant or convention. Author a new `RULE` (or `ADR`) instead using `rule_create` or `adr_create`, and cite that durable tag (`@verifies RULE-XX`, `[RULE-XX]`).

---

## 2. Contract-Based Acceptance Criteria

When authoring tasks with `task_create`:

- **Define Roles and Contracts, Not Paths**: Formulate deliverables in terms of component roles, behavioral contracts, or testable capabilities.
  - ❌ _Fragile_: `- [ ] Implement createAdr service in src/core/adr-creation.ts`
  - ✅ _Resilient_: `- [ ] Implement createAdr service in the ADR domain module enforcing RULE-14 link targets`
- Avoid hardcoding concrete filesystem paths into criteria; paths rot when code is refactored or reorganized.

---

## 3. Front-Loaded Planned Governance

- **Declare Governance Upfront**: When planning a task that introduces new architectural patterns, conventions, or constraints, declare them at task creation time using `--plan-rule` / `plan_rules` and `--plan-adr` / `plan_adrs`.
- **Completion Enforcement**: The task completion ceremony (`task_complete`) will verify that all declared planned rules and ADRs exist on disk and are marked complete before allowing the task to be closed.

---

## 4. Invariant Rules for Task Artifacts

- **Link Targets**: Frontmatter `links` must exclusively reference `ADR-` and `RULE-` artifacts (never `TASK-`, `MOTIVE-`, or `GIST-`).
- **Dependencies**: Prerequisites must be declared in frontmatter `depends_on` referencing prerequisite `TASK-` IDs.
- **Blast Radius**: Every task must represent a cohesive, atomic unit of work scoped at the deepest common ancestor of its mutation targets.

---

## 5. Standard Task Lifecycle

1. **Queue Inspection**: Call `task_list` or read `modie://tasks/ready` to find unblocked tasks.
2. **Branch Start**: Call `task_start` with the target task ID to create and check out its isolated task branch.
3. **Iterative Progress**: Check off criteria progressively with `task_check` as deliverables are completed and verified by tests.
4. **Planned Governance Authoring**: Create any planned rules (`rule_create`) or decisions (`adr_create`).
5. **Completion Ceremony**: Verify tests pass, then call `task_complete` to execute the atomic two-phase commit ceremony and remove the ephemeral task file.
6. **Integration**: Merge the task branch into trunk/base via `task_merge`.
