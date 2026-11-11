---
summary: Retire the legacy scanActiveTasks wrapper and DiscoveredTask type in active-scanner.ts, updating all engine callers to use scanActiveArtifacts directly.
depends_on:
  - TASK-85-2

links:
  - RULE-38
  - ADR-1
---

# Context

active-scanner.ts provides scanActiveTasks as an explicitly documented backward compatibility wrapper around scanActiveArtifacts. This sub-task retires the wrapper and DiscoveredTask interface, updating all engine callers to use scanActiveArtifacts directly.

# Acceptance Criteria

- [x] Engine services updated to call scanActiveArtifacts with TASK subtype directly
- [x] scanActiveTasks wrapper and DiscoveredTask interface removed from active-scanner.ts and traversal/types.ts
- [x] All checks pass via bun run verify
- [x] User Review
