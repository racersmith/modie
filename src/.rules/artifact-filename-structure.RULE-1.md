---
links:
  - ADR-1
  - ADR-2
  - ADR-6
  - ADR-9
---

All indexable Canon artifact filenames must conform to the tokenized grammar:
`[slug].[SUBTYPE]-[ID](.ARCHIVED)?.md`

Where:

- `slug` is kebab-case.
- `SUBTYPE` is one of `RULE`, `ADR`, or `TASK`.
- `ID` is an unpadded integer (e.g. `1`, `42`) or a branch/author-namespaced identifier (e.g. `2-1`, `J101`) adhering to [ADR-1], [ADR-6], and [ADR-9].
- The optional `.ARCHIVED` marker indicates deprecation without modifying file front-matter (used for `RULE` and `ADR`).
