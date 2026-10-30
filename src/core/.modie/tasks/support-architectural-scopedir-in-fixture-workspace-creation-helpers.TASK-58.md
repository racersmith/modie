---
depends_on: []

links:
  - RULE-8
  - RULE-12
---

# Context

Core creation domain services (createRule, createAdr, createTask) accept a logical scopeDir option (e.g. 'src/interfaces/cli'), but FixtureWorkspace helper methods currently expect subDir pointing to the concrete .modie/<subtype> subfolder. This creates friction and divergence between test setups and production API options. Align FixtureWorkspace artifact creation helpers to accept scopeDir and resolve containers automatically.

# Acceptance Criteria

- [ ] Update CreateFixtureArtifactOptions, CreateRuleOptions, CreateAdrOptions, and CreateTaskOptions in FixtureWorkspace to accept scopeDir
- [ ] Automatically resolve target container subdirectories via resolveArtifactDirectories when scopeDir is provided
- [ ] Maintain backwards compatibility for explicit subDir overrides
- [ ] Verify artifact placement across root and nested scopes in fixture workspace test suite
- [ ] User Review
