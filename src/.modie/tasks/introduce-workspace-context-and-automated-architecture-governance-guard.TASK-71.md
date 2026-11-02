---
depends_on:
  - TASK-70

links:
  - RULE-8
  - RULE-34
---

# Context

Introduce a unified WorkspaceContext interface encapsulating workspace root, VCS adapter, configuration, and artifact definitions to eliminate 110 implicit process.cwd() defaults and mutable global state (registeredSubtypes) in domain logic. Add an automated architecture test asserting zero module cycles and that no function exceeds the cyclomatic complexity threshold (CC <= 15) per the maintainability review.

# Acceptance Criteria

- [ ] Introduce WorkspaceContext interface (cwd, vcs, config, registry) initialized at interface boundaries and passed explicitly into domain services
- [ ] Eliminate mutable module-level state in registeredSubtypes in favor of instance-scoped registry on WorkspaceContext
- [ ] Add an automated architecture test asserting zero circular dependencies and that no function exceeds cyclomatic complexity threshold (CC <= 15)
- [ ] Verify complete test suite with zero false positive citations or regressions
- [ ] User Review
