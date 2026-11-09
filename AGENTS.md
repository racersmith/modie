# Modie Repository Guidelines

## Verification & Testing

Always use the streamlined verification runner to prevent context window bloat:

- **Run all checks**: `bun run verify` (runs typecheck, parallel test suite with dots, complexity, and circular dependency checks in ~3.7s).
- **Run targeted checks**: `bun run verify test`, `bun run verify types`, `bun run verify complexity`, `bun run verify circular`.
- **Targeted debugging**: Only run `bun test <file>` or `bun run verify --verbose` when diagnosing a specific failing test.

## Architectural Governance & Ephemeral Tasks

- Modie manages tasks, rules, and decisions via MCP tools (`start_task`, `check_criteria`, `complete_task`, `create_rule`, `create_adr`).
- **Ephemeral Task Decoupling**: Never cite ephemeral `TASK-XX` identifiers in code comments, test names, or docstrings. Cite durable artifacts only (`@verifies RULE-XX`, `[ADR-XX]`).
- **Blast Radius**: Modifications for a task must remain strictly confined to the task's declared scope directory.
