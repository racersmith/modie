---
summary: Relocate and restructure the Antigravity plugin under integrations/antigravity, configure MCP server execution from compiled output with CWD independence, and establish the symlinked dogfooding workflow.
depends_on: []

links:
  - ADR-12
  - RULE-37
---

# Context

Author the first-class Antigravity plugin bundle in integrations/antigravity/ following the architecture defined in ADR-12 and RULE-37. Replace manual copying to ~/.gemini/config/plugins with a symlinked workflow, update MCP server definition to execute against compiled distribution outputs without hardcoded MODIE_CWD, and integrate plugin validation into workspace build scripts.

# Acceptance Criteria

- [ ] Relocate and author Antigravity plugin manifest, README, and governance rules under dedicated integrations/antigravity directory
- [ ] Configure plugin MCP server definition to execute from compiled distribution output without static host paths or forced working directory
- [ ] Integrate plugin validation script into workspace build configuration
- [ ] Establish symlinked global plugin development workflow and remove obsolete unmanaged plugin artifacts
- [ ] User Review
