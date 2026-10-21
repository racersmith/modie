---
depends_on:
  - TASK-13

links:
  - ADR-1
  - ADR-2
  - ADR-3
  - ADR-4
  - RULE-1
  - RULE-4
  - RULE-8
  - RULE-14
  - RULE-17
  - RULE-25
  - RULE-27
  - RULE-29
---

# Context

Provide automated creation of ADR artifacts via modie adr create <title> ensuring monotonic ID assignment, standard architectural decision template structure (Context, Alternatives Considered, Decision) per ADR-4, and valid link references per RULE-14 and RULE-17.

# Acceptance Criteria

- [ ] Implement createAdr core service in src/core/adr-creation.ts with frontmatter validation enforcing RULE-14 (only ADR and RULE links) and RULE-17 (descendant rule scope)
- [ ] Implement ADR template renderer in src/core/primitives/adr/ with standard sections (Context, Alternatives Considered, Decision) per ADR-4
- [ ] Implement CLI command modie adr create <title> with --scope, --link, --context, --flat, and --json options per RULE-25 and RULE-27
- [ ] Wire adr create subcommand into CLI router and help output
- [ ] Add unit and integration tests verifying ADR creation, ID progression, link validation, and CLI stream separation
