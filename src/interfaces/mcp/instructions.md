# Modie Agent Instructions & Authoring Best Practices

Modie is a decentralized architectural governance and task lifecycle engine. As an AI agent operating in a Modie-governed repository, you must observe the following core invariants, protocols, and workflows:

---

## 1. Ephemeral Task Decoupling

> **CRITICAL RULE**:
> Never cite ephemeral `TASK-XX` identifiers in unit test titles (e.g. `[TASK-XX]`), code comments, or docstrings (e.g. `@verifies TASK-XX`).

- **Tasks are Ephemeral**: Once completed, a task artifact is permanently deleted from the repository. Any test or code comment referencing a `TASK-XX` tag becomes a stale citation pointing to a non-existent file.
- **Durable Citations Only**: Code and test suites must cite exclusively durable governance artifacts: `@verifies RULE-XX`, `[RULE-XX]`, or `[ADR-XX]`.
- **Extract Durable Invariants**: If you find yourself wanting to cite a task in code or tests, **STOP**. That indicates you have identified a durable invariant or architectural convention. Author a new `RULE` or `ADR` using `create_rule` or `create_adr` and cite that durable tag instead.

---

## 2. Strict Blast Radius Confinement

- Every task is scoped to a specific architectural directory (e.g., `src/interfaces/mcp`).
- **Downward Confinement**: All code modifications, new files, and tests for that task must reside strictly at or below that declared scope directory.
- Modifying sibling or ancestor directories violates the task's blast radius (`RULE-6`). If changes are needed in shared or ancestral directories, author a dedicated task scoped at that common ancestor.

---

## 3. Contract-Based Acceptance Criteria

When planning and authoring tasks:
- **Define Deliverables by Contract, Not Path**: Formulate acceptance criteria in terms of component roles, behavioral contracts, and testable outcomes.
  - ❌ *Fragile*: `- [ ] Implement error helper in src/interfaces/mcp/errors.ts`
  - ✅ *Resilient*: `- [ ] Implement structured error handler constructing model-recoverable error envelopes in MCP interface`
- Concrete filesystem paths in criteria rot when code is refactored; behavioral contracts remain durable.
- Always include a `User Review` criterion as the final verification checkpoint before task completion.

---

## 4. Front-Loaded Planned Governance

- Declare candidate rules and architectural decisions upfront during task creation.
- All declared planned governance artifacts must be authored and satisfied before the task completion ceremony will allow the task to be closed.

---

## 5. Spatial Graph Link Invariants

Modie enforces a strict hierarchical directed acyclic graph (DAG):
- **Rules (`RULE`)**: May only be justified by ADRs residing in the rule's directory or an ancestor directory up to the workspace root (`RULE-16`).
- **Decisions (`ADR`)**: May link to rules residing in the ADR's directory or descendant subtrees, or ancestor ADRs (`RULE-17`, `RULE-19`).
- **Tasks (`TASK`)**: May link to rules and ADRs residing in the task's directory or an ancestor directory (`RULE-7`, `RULE-18`).
- **Prohibition of Sideways Links**: Artifacts may never cite sibling directories.

---

## 6. The 11 Singular Modie MCP Agent Tools

Modie exposes 11 singular-purpose tools designed for high signal-to-noise and progressive disclosure:

### Spatial & Artifact Exploration
1. **`ls_better`**: Augmented directory listing returning clean plaintext tab-separated listings (`<file|dir/>\t<gist>\n`). Directories end with `/`. Provides instant file/directory GIST summaries without reading individual files.
2. **`read_artifact`**: Tag-aware document reader (`RULE-XX`, `ADR-XX`, `TASK-XX`). Returns unescaped Markdown with file location comments and an agent-readable `## Appendix: Relationships & Governance` resolving linked rules to their invariants and titles.
3. **`task_context`**: High-signal Mission Brief in Markdown: active branch, scope directory, elevated blast radius constraint, numbered acceptance criteria checklist, and governing rule invariants.

### Task Lifecycle State Machine
4. **`start_task`**: Checks out or creates the hierarchical task branch (`task/<id>-<slug>`), verifies dependencies, and returns the full active Mission Brief in Markdown.
5. **`check_criteria`**: Atomically marks 1-based acceptance criteria complete or incomplete (`items: [1, 2]`). Returns updated checklist progress and remaining items.
6. **`complete_task`**: Executes the atomic two-phase commit completion ceremony (`RULE-32`, `RULE-21`), verifies all criteria are checked, merges to trunk, and deletes the task branch.

### Dedicated Artifact Authoring
7. **`create_rule`**: Authors an architectural governance rule (`RULE-XXXX`) with a strongly typed invariant assertion claim and optional justifying ADR links (`RULE-16`).
8. **`create_adr`**: Authors an Architectural Decision Record (`ADR-XXXX`) with strongly typed context, decision, consequences, and links.
9. **`create_task`**: Authors a scoped task specification (`TASK-XXXX`) with contract-based acceptance criteria (must end with `User Review`), prerequisite dependencies, and governing links.

### Graph Mutation
10. **`link_artifacts`**: Establishes directional frontmatter relationships (`links`, `depends_on`) between artifacts after validating spatial ancestry and DAG constraints.
11. **`archive_artifact`**: Archives an obsolete RULE or ADR artifact (`RULE-31`), safely marking it archived and auditing inbound references.

---

## 7. Ambient MCP Resources

For zero-roundtrip context hydration:
- `modie://task`: Dynamic, unescaped Markdown Mission Brief for the active task branch.
- `modie://tasks/ready`: Real-time JSON queue of unblocked ready tasks.
- `modie://instructions`: Authoritative agent governance rules and protocols.
