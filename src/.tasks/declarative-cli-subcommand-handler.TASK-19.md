---
depends_on: []

links:
  - RULE-25
  - RULE-27
---

# Context

Unify CLI command argument parsing, help output generation, JSON payload formatting, and strict stream separation into a declarative command registration harness.

# Acceptance Criteria

- [x] Define a type-safe CliCommandDefinition interface specifying positional arguments, flags, help metadata, and execution handler
- [x] Implement a declarative command execution wrapper that enforces RULE-27 stream separation, JSON output, and standardized error formatting
- [x] Refactor existing create, list, check, and status subcommands to use declarative command definitions
- [x] Add integration tests verifying help generation, flag parsing, and exit code handling across declared commands
