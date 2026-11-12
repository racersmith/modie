---
summary: Prune out-of-scope foreign citations in interface layers and enhance scope audit reporting to support the dual Elevate vs Prune resolution model.

depends_on: []

links:
  - RULE-6
  - RULE-8
  - RULE-12
  - RULE-16
  - RULE-17
  - ADR-10
---

# Context

Address under-scoped artifact false positives by pruning foreign citations in interface layers and enhancing scope audit to surface the dual resolution model (Elevate vs Prune).

# Acceptance Criteria

- [x] CLI help text and interface tests decouple foreign citations to core-only engine rules (RULE-38, RULE-31, RULE-36, RULE-2, RULE-9)
- [x] Artifact placement query service and scope audit report detailed out-of-scope citations for under-scoped artifacts
- [x] Architectural placement design doc records the dual resolution policy (Move to DCA vs Prune foreign citations)
- [x] Automated tests verify out-of-scope citation reporting
- [x] User Review
