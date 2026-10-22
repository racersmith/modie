---
depends_on: []

links:
  - RULE-1
  - RULE-28
  - ADR-1
  - ADR-2
  - ADR-9
---

# Context

scanActiveArtifacts only inspects the local working tree, allowing concurrent branches creating monotonic artifacts (RULE, ADR, custom subtypes) to allocate identical IDs without detection. Enhance resolveWatermark to scan active artifacts across other git branches and add a pre-merge collision guard in task merge that blocks merging if any introduced indexable artifact collides with existing artifacts on the target branch.

# Acceptance Criteria

- [ ] Enhance artifact discovery to inspect active artifact files across other git branches using git tree queries
- [ ] Update resolveWatermark to incorporate active IDs from other branches during ID allocation
- [ ] Implement pre-merge collision detection in mergeTaskBranch verifying that newly introduced artifacts do not collide with target branch artifacts
- [ ] Add unit and integration tests covering multi-branch ID allocation and collision prevention during task merge
