---
depends_on:
  - TASK-39-2

links:
  - RULE-1
  - RULE-4
  - RULE-8
  - RULE-13
  - RULE-16
  - RULE-25
  - RULE-30
  - RULE-31
  - RULE-34
  - ADR-1
  - ADR-2
  - ADR-4
  - ADR-7
  - ADR-9
---

# Context

Refactor Tier 3 core governance resolution, supersession, and archival test suites to adopt createFixtureWorkspace, typed rule/ADR creation helpers (createRule, createAdr), and programmatic test tags. Eliminates raw directory tree manipulation, raw frontmatter formatting, and hardcoded rule/ADR IDs during supersession and archival verification.

# Acceptance Criteria

- [ ] Migrate src/core/rule/rule-supersession.test.ts and src/core/adr/adr-supersession.test.ts to createFixtureWorkspace and typed supersession helpers
- [ ] Migrate src/core/rule/rule-creation.test.ts and src/core/adr/adr-creation.test.ts to createFixtureWorkspace, replacing manual filesystem scaffolding
- [ ] Migrate src/core/archival/archival.test.ts to createFixtureWorkspace with typed fixture links
- [ ] Migrate src/core/resolver/watermark.test.ts active scan and multibranch tests to hermetic fixture workspaces
- [ ] Verify all Tier 3 test suites pass with zero false-positive citations during reference queries
