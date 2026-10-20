---
links:
  - ADR-3
---

Multi-instance artifacts (`RULE`, `TASK`, `ADR`) may reside either flat within a target directory `<dir>/` or inside a recognized subtype container (`<dir>/.rules/`, `<dir>/.tasks/`, `<dir>/.adrs/`).

The resolver must normalize the architectural scope of any artifact inside a subtype container by stripping the recognized container segment:

- `<dir>/.rules/slug.RULE-XXXX.md` -> Scope: `<dir>`
- `<dir>/slug.RULE-XXXX.md` -> Scope: `<dir>`
- `<dir>/.tasks/slug.TASK-XXXX.md` -> Scope: `<dir>`
- `<dir>/slug.TASK-XXXX.md` -> Scope: `<dir>`

Task mutation authority, downward blast radius, and rule inheritance must evaluate against the normalized `<dir>` scope regardless of whether physical grouping containers are present.

Directory naming should follow the convention of the lowercase, plural of the subtype.
