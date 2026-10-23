---
links:
  - ADR-10
---

Multi-instance artifacts (`RULE`, `TASK`, `ADR`, `GIST`) may reside either flat within a target directory `<dir>/` or encapsulated within a unified `.modie/<subtype>` container directory (`<dir>/.modie/rules/`, `<dir>/.modie/tasks/`, `<dir>/.modie/adrs/`, `<dir>/.modie/gists/`). For backwards compatibility, legacy subtype-partitioned dot directories (`<dir>/.rules/`, `<dir>/.tasks/`, `<dir>/.adrs/`) remain recognized.

The resolver must normalize the architectural scope of any artifact inside a container by stripping recognized container segments:

- `<dir>/.modie/rules/slug.RULE-XXXX.md` -> Scope: `<dir>`
- `<dir>/.modie/tasks/slug.TASK-XXXX.md` -> Scope: `<dir>`
- `<dir>/.modie/adrs/slug.ADR-XXXX.md` -> Scope: `<dir>`
- `<dir>/.rules/slug.RULE-XXXX.md` -> Scope: `<dir>` (legacy)
- `<dir>/.tasks/slug.TASK-XXXX.md` -> Scope: `<dir>` (legacy)
- `<dir>/.adrs/slug.ADR-XXXX.md` -> Scope: `<dir>` (legacy)
- `<dir>/slug.RULE-XXXX.md` -> Scope: `<dir>` (flat)

Task mutation authority, downward blast radius, and rule inheritance must evaluate against the normalized `<dir>` scope regardless of whether physical grouping containers are present.

Subtype directory naming follows the convention of the lowercase, plural of the subtype (`rules`, `adrs`, `tasks`, `gists`).
