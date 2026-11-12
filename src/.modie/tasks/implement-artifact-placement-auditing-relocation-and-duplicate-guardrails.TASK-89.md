---
summary: Implement artifact placement auditing, least-scope relocation, and cross-scope duplicate prevention using deepest common ancestor graph analysis.

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

Originating from .modie/ideas/recommend-artifact-placement-based-on-deepest-common-ancestor.IDEA.md. Implements two-way breathing architectural placement: demoting over-scoped artifacts to their least necessary scope to eliminate task context bloat, and elevating under-scoped artifacts to common ancestors to prevent duplicate artifact creation across sibling subtrees.

# Acceptance Criteria

- [x] Core engine provides an artifact placement query service that evaluates code citations, test suites, and governance links to calculate the deepest common ancestor (DCA) and classify placement as optimal, over-scoped, under-scoped, or inchoate
- [x] Core engine provides an artifact relocation service that moves artifacts between directory scopes, scaffolding missing container motives, and validating graph invariants
- [x] Artifact creation pipeline executes global workspace collision and similarity checks across all scopes, blocking duplicate artifact creation when an equivalent concept exists in a sibling scope
- [x] Declarative CLI provides a scope audit command reporting placement status to stderr and machine JSON to stdout, with an --apply flag to execute recommended relocations
- [x] Declarative CLI provides a scope move command supporting explicit target scopes and auto-calculated optimal placement with invariant validation
- [x] Automated test suites verify placement classification, relocation mechanics, invariant validation, and duplicate collision prevention under isolated workspaces
- [x] User Review
