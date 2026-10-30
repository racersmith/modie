---
links:
  - ADR-10
  - ADR-12
---

All multi-instance artifacts (`RULE`, `TASK`, `ADR`, `GIST`) must reside encapsulated within the unified `.modie/<subtype>` container directory (`<dir>/.modie/rules/`, `<dir>/.modie/tasks/`, `<dir>/.modie/adrs/`, `<dir>/.modie/gists/`).
The resolver must normalize the architectural scope of any artifact inside a container by stripping recognized container segments:

- `<dir>/.modie/rules/slug.RULE-XXXX.md` -> Scope: `<dir>`
- `<dir>/.modie/tasks/slug.TASK-XXXX.md` -> Scope: `<dir>`
- `<dir>/.modie/adrs/slug.ADR-XXXX.md` -> Scope: `<dir>`
- `<dir>/.modie/gists/slug.GIST.md` -> Scope: `<dir>`

Task mutation authority, downward blast radius, and rule inheritance must evaluate against the normalized `<dir>` scope.

Subtype directory naming follows the convention of the lowercase, plural of the subtype (`rules`, `adrs`, `tasks`, `gists`).
