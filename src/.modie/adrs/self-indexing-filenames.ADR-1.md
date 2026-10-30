---
links:
  - RULE-1
  - ADR-4
---

# Context

We need tooling (and standard Unix shells/globbers) to rapidly locate, filter, and state-check Modie artifacts without opening file bodies or parsing ASTs.

# Alternatives Considered

- **Directory Nesting (`.rules/active/ABC-XXX/content.md`):** Deep nesting makes colocation awkward and breaks flat directory scanning.
- **Pure Front-Matter State (`status: archived` inside YAML):** Requires opening and parsing every file on disk just to filter active rules, destroying CLI perf.
- **UUIDs (`abc-123.md`):** Zero semantic discoverability via standard shell tools.
- **Zero Padding:** Using a zero padded ID `ABC-0012` requries more space and offers limited usefullness depending on file name structure ie. `ABC-0012.[slug].md` vs `[slug].ABC-012.md`

# Decision

We adopt an expressive flat naming format: `[slug].[SUBTYPE]-[ID][.ARCHIVED].md`.
This ensures:

1. Sibling colocation alongside code.
2. Fast glob filtering by subtype (`*.ABC-*`) or ID lookup (`*.ABC-123.md`).
3. Zero-read archive segregation by matching or excluding `.ARCHIVED.`.
4. No padding to numbered IDs.
