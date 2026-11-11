# Modie Architectural Governance

Modie maintains architectural governance and task lifecycle alongside code using a filesystem-as-DAG model.

## Universal Governance Invariants
- **Rule-Only Citations**: Code annotations and unit tests must exclusively cite falsifiable rules (`@verifies RULE-XX`, `[RULE-XX]`). Never cite ephemeral `TASK-XX` identifiers or `ADR-XX` decision records in code comments, test names, or docstrings. ADRs provide architectural rationale and are linked via artifact frontmatter (`links: [ADR-YY]`), not directly in code.
- **Strict Blast Radius**: All modifications, new files, and tests for a task must remain strictly confined to the task's declared scope directory or below.
- **Contract-Based Acceptance Criteria**: Define criteria by component roles and testable outcomes, never concrete filesystem paths. Always include `User Review` as the final criterion.

## Agent Context & Task Lifecycle
- **Zero-Roundtrip Context**: Read `modie://task` for the active task Mission Brief, or `modie://tasks/ready` to triage unblocked tasks.
- **Artifact Inspection**: Use `read_artifact(TAG)` to read any tagged document (`RULE-XX`, `ADR-XX`, `TASK-XX`).
- **Task Lifecycle**: Check out branches with `start_task`, track progress with `check_criteria`, and complete tasks with `complete_task`.
- **Authoritative Protocols**: Read `modie://instructions` for comprehensive governance rules and workflows.
