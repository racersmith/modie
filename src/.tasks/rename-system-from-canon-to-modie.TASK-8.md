---
depends_on:
  - TASK-7

links:
  - ADR-1
  - ADR-4
  - RULE-1
  - RULE-18
---

# Context

Rebrand and rename the architecture governance engine from canon to modie across package naming, CLI binary, documentation, and references.

# Acceptance Criteria

- [ ] Update package.json name and CLI binary name to modie
- [ ] Update CLI entrypoint bin scripts and global help text
- [ ] Update core documentation MOTIVE files and references from canon to modie
- [ ] Ensure all test suites typechecks and CLI commands pass under modie
