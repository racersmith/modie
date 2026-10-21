---
depends_on: []

links:
  - ADR-1
  - ADR-4
  - ADR-6
---

# Context

To support reliable task creation across distributed branches and ensure Canon's architectural governance model is strictly respected, we need to resolve structural and specification prerequisites before implementation:

1. **Multi-Branch Task ID Strategy (ADR/RULE)**:
   TASK-1 requires that "Creating tasks on separate git branches does not result in ID overlap." While ADR-6 suggests optional developer or agent prefixes (e.g. `TASK-J101`, `TASK-A102`), Canon currently lacks a formal decision or rule governing how branch or author namespaces are derived and tokenized by automated tools.

2. **RULE-1 Grammar & Zero-Padding Harmonization**:
   RULE-1 currently specifies a "4-digit zero-padded integer", whereas ADR-1 explicitly rejects zero-padding and existing artifacts throughout the repository utilize unpadded integers (`ADR-1`, `RULE-1`, `TASK-1`). RULE-1 must be updated to align with ADR-1 and accommodate branch-aware tokens.

3. **Universal Artifact Rules Scope Alignment**:
   Universal Canon artifact rules (RULE-1, 6, 7, 8, 12, 15, 18, 21, 22) currently reside inside `src/core/.rules/`. Under RULE-12 (least-scope placement) and RULE-7 (ancestral reference constraints), these rules govern artifacts across all of `src` (including `src/interfaces` and root `src/.tasks/`). Consolidating them at `src/.rules/` ensures all interfaces, tasks, and submodules can inherit and reference them legally.

# Acceptance Criteria

- [ ] Multi-branch task ID allocation strategy is formally decided and documented in an ADR or ADR-6 amendment.
- [ ] RULE-1 is updated to resolve the 4-digit zero-padding conflict with ADR-1 and define valid branch-prefixed ID formats.
- [ ] Universal artifact governance rules are relocated to `src/.rules/` so direct ancestry references from `src/.tasks/` and `src/interfaces/` satisfy RULE-7 and RULE-12.
- [ ] Root repository territory motive (`/MOTIVE.md`) is established to complete the upward context compilation root.
