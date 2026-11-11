---
summary: Eliminate deprecated context field alias in favor of contextSection across AdrArtifact, CreateAdrOptions, CreateRuleOptions, and CreateTaskOptions.
depends_on:
  - TASK-85-4

links:
  - RULE-38
  - ADR-4
---

# Context

context is currently maintained as a deprecated backward-compatible alias for contextSection across ADR, Rule, and Task domains. This sub-task drops the deprecated alias and standardizes creation pipelines and tests on contextSection.

# Acceptance Criteria

- [ ] Deprecated context alias removed from domain ADR, Rule, and Task types and templates
- [ ] Pipeline creation functions cleaned up to expect contextSection strictly
- [ ] Legacy alias test cases updated across pipeline tests
- [ ] All checks pass via bun run verify
- [ ] User Review
