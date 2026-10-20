---
links:
  - ADR-1
  - ADR-2
---

All indexable Canon artifact filenames must conform to the tokenized grammar:
`[slug].[SUBTYPE]-[ID](.ARCHIVED)?.md`

Where:

- `slug` is kebab-case.
- `SUBTYPE` is one of `RULE`, `ADR`, or `TASK`.
- `ID` is a 4-digit zero-padded integer.
- The optional `.ARCHIVED` marker indicates deprecation without modifying file front-matter.
