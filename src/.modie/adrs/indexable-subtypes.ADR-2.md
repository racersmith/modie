---
summary: Partition artifacts into ID-indexed subtypes (ADR, RULE, TASK) for cross-document referencing and unindexed discoverable subtypes (MOTIVE, GIST) resolved by directory structure.
links:
  - RULE-1
  - ADR-1
---

# Context

Not all of the files in modie need to have indexable file types. Whenever possible artifacts should not require the friction of indexable names to improve the developer experience. However, there are areas where the benefits of artifact reference far outweight the overhead.

# Alternatives Considered

- **No indexable subtypes**: Keeping all files as simple `MOTIVE.md`, `ADR-[slug].md`, `TASK-[slug].md` names requires that in situations where specific reference is benefitial, such as within code to reflect that a test is verifying a specific `RULE` means that we rely on file paths. This drastically increases the maintainince costs and leads to documentation rot.
- **All indexable subtypes:** Making all files indexable increases the friction of development as each file needs to be created using the CLI so IDs are correctly assigned. For files like `MOTIVE-[id].md` this increases developer friction without adding value. `MOTIVE` files are the most common to write and also by their design they influence all files within their structure and should not be directly referenced.

# Decision

## Indexable subtypes as per ADR-1:

- `ADR`
- `RULE`
- `TASK`

A `TASK` document may want to point to a specific `RULE` or `ADR` that it need to work on.
`ADR`s and `RULE`s will commonly point to eachother to ensure conformance.
`TASK`s need to refrence each other so that work can be logically ordered.

## Discoverable subtypes through directory structure:

- `MOTIVE`
- `GIST`

These files will be constructed by `[subtype].md` to allow for simple file creation.
