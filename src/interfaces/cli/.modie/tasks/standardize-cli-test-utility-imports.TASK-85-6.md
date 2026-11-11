---
summary: Standardize test imports across CLI test files so fixture workspaces import directly from platform testing and test-utils only exposes CLI-specific utilities.
depends_on:
  - TASK-85-5

links:
  - RULE-25
  - RULE-27
---

# Context

CLI tests currently mix importing test fixture helpers from test-utils.ts and platform/testing. This sub-task cleans up test-utils.ts to only provide CLI runner helpers and updates CLI tests to import workspace fixtures consistently from core platform testing.

# Acceptance Criteria

- [ ] test-utils.ts cleaned up to expose only CLI-specific helpers such as runCli
- [ ] All CLI test files import test fixtures directly from core platform testing
- [ ] All checks pass via bun run verify
- [ ] User Review
