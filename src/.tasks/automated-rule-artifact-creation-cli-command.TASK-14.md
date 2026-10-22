---
depends_on:
  - TASK-13

links:
  - ADR-1
  - ADR-2
  - ADR-3
  - RULE-1
  - RULE-3
  - RULE-8
  - RULE-11
  - RULE-13
  - RULE-16
  - RULE-25
  - RULE-27
  - RULE-29
---

# Context

Provide automated creation of RULE artifacts via modie rule create <title> ensuring monotonic ID assignment, language-agnostic template structure per RULE-3, atomicity per RULE-11, and valid ADR links per RULE-13 and RULE-16.

# Acceptance Criteria

- [x] Implement createRule core service in src/core/rule-creation.ts with frontmatter validation enforcing RULE-13 (only ADR links) and RULE-16 (ancestral ADR scope)
- [x] Implement rule template renderer in src/core/primitives/rule/ producing standard markdown with single invariant assertion per RULE-3 and RULE-11
- [x] Implement CLI command modie rule create <title> with --scope, --link, --context, --flat, and --json options per RULE-25 and RULE-27
- [x] Wire rule create subcommand into CLI router and help output
- [x] Add unit and integration tests verifying rule creation, ID progression, frontmatter link validation, and CLI stream separation
