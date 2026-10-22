---
depends_on: []

links:
  - ADR-1
  - ADR-2
  - RULE-1
  - RULE-25
  - RULE-27
---

# Context

Refactor the CLI interface architecture to improve maintainability: group command handlers into modular directories under src/interfaces/cli/commands/, adopt node:util.parseArgs for zero-dependency flag parsing while maintaining RULE-27 stream separation, introduce a declarative command router, and split the 1,400+ line cli.test.ts into command-scoped test suites.

# Acceptance Criteria

- [x] Organize CLI command handlers into dedicated subdirectories under src/interfaces/cli/commands/ (task, rule, find, show)
- [x] Adopt node:util.parseArgs for structured, zero-dependency flag and option parsing adhering strictly to RULE-27
- [x] Refactor CLI dispatcher in cli.ts to use a declarative command registry or router
- [x] Extract shared test fixtures and split cli.test.ts into command-scoped test files
- [x] Verify all CLI commands, edge cases, subprocess executions, typecheck, and build pass with zero regression
