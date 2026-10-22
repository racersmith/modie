---
depends_on: []

links:
  - RULE-25
  - RULE-27
  - RULE-30
---

# Context

Transition interface command definitions to use Zod schemas as the single source of truth for parameter parsing, typing, and validation across CLI and protocol interfaces, eliminating manual string parsing while preserving RULE-25 and RULE-27 compliance.

# Acceptance Criteria

- [x] Define a shared declarative action definition schema supporting Zod input schemas, CLI binding metadata, and domain execution handlers
- [x] Implement a CLI argument adapter that maps command-line tokens to Zod schema properties with type coercion and generates aligned help text
- [x] Migrate all registered interface commands to the Zod-backed action definition contract without altering external CLI behavior
- [x] Verify all CLI integration test suites pass with Zod schema validation and confirm syntax errors are emitted exclusively to stderr
