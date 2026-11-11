---
summary: Replace shadow definitions of CreateTaskOptions, CreateRuleOptions, and CreateAdrOptions in fixture-workspace.ts with domain definitions.
depends_on:
  - TASK-85-1

links:
  - RULE-38
---

# Context

fixture-workspace.ts defines shadow interfaces for CreateTaskOptions, CreateRuleOptions, and CreateAdrOptions that duplicate domain types. This sub-task consolidates these option types so fixture-workspace directly extends domain type definitions.

# Acceptance Criteria

- [ ] fixture-workspace.ts imports and reuses domain CreateTaskOptions, CreateRuleOptions, and CreateAdrOptions
- [ ] Duplicate shadow interface declarations removed from fixture-workspace.ts
- [ ] All tests pass via bun run verify test
- [ ] User Review
