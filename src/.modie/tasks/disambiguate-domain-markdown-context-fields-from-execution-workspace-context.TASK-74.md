---
summary: Disambiguate domain markdown problem context options from runtime WorkspaceContext execution parameters.
depends_on: []

links:
  - RULE-8
  - RULE-34
---

# Context

Currently, option interfaces across `src/core/` (`CreateAdrOptions`, `CreateTaskOptions`, `CreateRuleOptions`, `CreateMotiveOptions`) define `context?: string` for markdown `# Context` body sections. This collides with `BaseCreateArtifactOptions.context?: WorkspaceContext`, forcing union types (`string | WorkspaceContext`), parallel properties (`workspace?: WorkspaceContext`), and runtime type sniffing.

Rename the domain markdown section options to `contextSection?: string` (retaining backward-compatible aliasing), reserve `workspace?: WorkspaceContext` exclusively for execution environment in `BaseCreateArtifactOptions`, and remove runtime context-sniffing branches in `resolveWorkspaceContext`.

# Acceptance Criteria

- [x] Rename document context fields to contextSection across ADR, Task, Rule, and Motive creation options while maintaining backward compatibility aliases
- [x] Standardize BaseCreateArtifactOptions to accept workspace parameter without ambiguous union types on context
- [x] Eliminate runtime string-or-object context sniffing in resolveWorkspaceContext
- [x] Verify all tests pass with bun test:parallel && bun check && bun check:circular
- [x] User Review
