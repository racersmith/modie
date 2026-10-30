---
depends_on: []

links:
  - RULE-8
  - RULE-12
  - RULE-25
  - ADR-10
  - ADR-12
---

# Context

Formally retire the legacy ADR-3 container system (.rules/, .tasks/, .adrs/) and flat artifact colocation (--flat / useSubtypeContainer: false) across core directories, pipeline creation services, CLI commands, and test fixtures in accordance with ADR-10 and RULE-8.

# Acceptance Criteria

- [x] Update RULE-8 and author ADR to formally mandate unified .modie/<subtype>/ containment and retire legacy dot-containers and flat placement
- [x] Remove legacy container resolution (getLegacySubtypeContainerName) and useSubtypeContainer/flat flags from core directory and creation services
- [x] Purge --flat flag from rule, adr, and task CLI creation commands and framework definitions
- [x] Refactor all test suites and fixture workspace helpers to eliminate legacy container and flat placement dependencies
- [x] Verify complete test suite passes under strict unified containment architecture
