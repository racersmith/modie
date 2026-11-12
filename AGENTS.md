# Modie Repository Guidelines

## Verification & Testing

Always use the streamlined verification runner to prevent context window bloat:

- **Run all checks**: `bun run verify` (runs typecheck, parallel test suite with dots, oxlint with complexity and file length thresholds, circular dependencies, knip dead code, and plugin validation in ~4.2s).
- **Run targeted checks**: `bun run verify test`, `bun run verify types`, `bun run verify lint`, `bun run verify circular`, `bun run verify knip`.
- **Targeted debugging**: Only run `bun test <file>` or `bun run verify --verbose` when diagnosing a specific failing test.

## Modie Engine Architecture & Coding Standards

When contributing to the Modie codebase, adhere to these internal invariants:

- **Unidirectional Layering (RULE-38)**: Core modules follow strict unidirectional dependency flow: domain primitives (`src/core/domain`) must have zero external runtime dependencies and cannot import from `engine` or `platform`. The `engine` consumes `platform` features exclusively through abstractions.
- **CLI Stream Separation (RULE-27)**: Declarative CLI commands must write exclusively machine-parseable output (file paths, raw JSON) to `stdout`. All human formatting, status indicators, and summary tables must be written to `stderr`.
- **Fixture Isolation (RULE-34)**: Engine and CLI tests must execute against isolated temporary workspaces created via `FixtureWorkspace` or `withFixtureWorkspace`. Never manipulate the host repository's `.modie` state directly in tests.
- **Zero False-Positive Citations (RULE-35)**: Test fixtures and sample data must never contain literal governance tags (e.g. `RULE-1`) that pollute `modie references` queries. Use `formatArtifactTag` to construct synthetic tags dynamically.
- **Artifact Authoring Litmus Tests & Anti-Tombstone ADRs**: Before authoring governance artifacts, evaluate subtype litmus tests:
  - `SPARK`: Raw, inchoate idea or out-of-scope finding requiring no formal design, branch, or criteria (via `spark_add` or `.modie/ideas/SPARKS.md`).
  - `ADR`: Actively constrains how future code must be written. Tombstone ADRs (recording past deletions, retirements, or deprecations) are strictly prohibited and blocked by engine, CLI, and MCP guardrails.
  - `RULE`: Enduring, falsifiable invariant verifiable in code or tests.
  - `TASK`: Converged execution contract with binary criteria ending with `User Review`. If still inchoate, use `spark_add`.
  - `MOTIVE`: Enduring architectural reason for a directory node in the system DAG.
