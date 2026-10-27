---
depends_on: []

links:
  - RULE-25
  - RULE-31
  - RULE-34
---

# Context

Modernize CLI archive test suites (archive.test.ts, adr-archive.test.ts, rule-archive.test.ts) to eliminate legacy 'TEST-N' string IDs and hardcoded literal tags in assertions. Use programmatic makeTestTag helper and typed workspace artifact creation methods (createRule, createAdr) to prevent test fixture tags from interfering with dogfooding citation queries per RULE-25, RULE-31, and RULE-34.

# Acceptance Criteria

- [x] Modernize archive.test.ts to use makeTestTag and typed workspace creation helpers (createRule, createAdr)
- [x] Modernize adr-archive.test.ts to use makeTestTag and typed workspace creation helpers (createRule, createAdr)
- [x] Modernize rule-archive.test.ts to use makeTestTag and typed workspace creation helpers (createRule, createAdr)
- [x] Verify all test suites pass with zero regressions and zero false-positive citations in references query
