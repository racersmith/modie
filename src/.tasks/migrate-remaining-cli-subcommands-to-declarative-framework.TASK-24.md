---
depends_on: []

links:
  - RULE-25
  - RULE-27
  - RULE-28
---

# Context

TASK-19 introduced CliCommandDefinition and createCommandHandler for rule create, adr create, task create, task list, task check, and task status. The remaining CLI subcommands (find, show, task start, task complete, task merge) still use legacy manual parsing and error handling. Migrate them to the declarative framework to ensure uniform argument parsing, automatic help generation, and strict RULE-27 stream separation.

# Acceptance Criteria

- [ ] Migrate find and show root commands to declarative CliCommandDefinition schemas
- [ ] Migrate task start to declarative CliCommandDefinition schema
- [ ] Migrate task complete and task merge to declarative CliCommandDefinition schemas
- [ ] Verify all migrated subcommands enforce RULE-27 stream separation and pass all test suites
