---
depends_on:
  - TASK-64

links:
  - ADR-4
  - RULE-25
  - RULE-27
---

# Context

Per the maintainability review (§2.3, §3.5, §5), `src/interfaces/cli/framework/adapter.ts` currently has a cyclomatic complexity of 57 because the generic adapter hardcodes domain-specific knowledge:

- Hardcoded lists of task domain flags (`depends_on`, `plan_rules`, `criteria`, `keepFile`, `no-delete`, `id-or-path -> id`, `criterion`, `link`, `depend-on` as verbatim, plus a hardcoded `task check` usage string).
- Positional-to-property resolution is duplicated three separate times across `adapter.ts` (lines 98, 193, 328–349), with subtle inconsistencies (the inline copy lacks support for `tag-or-path` and `target-or-identifier`).
- Command definitions already declare their flag aliases and positional metadata via `defineCommand`. Maintaining redundant mappings in `adapter.ts` creates three separate sources of truth for the same flag mapping.
- Across 23 CLI command files, hand-written `*Flags` interfaces duplicate the schema contracts already defined in Zod, and 15 command files declare boilerplate `renderJson` handlers identical to the framework default (`JSON.stringify(result, null, 2)`).
- Help formatting in `cli.ts` duplicates table rendering logic between `printNamespaceHelp` and `printGlobalHelp`.

By making command definitions the single source of truth—leveraging the resolved `property` mapping already computed in `defineCommand`—`mapContextToSchemaInput` can iterate declared metadata directly. Validated schema payloads (`z.infer<TSchema>`) will be passed directly to command `render` and `renderJson` handlers, dropping manual `*Flags` interfaces and boilerplate renderers while reducing `adapter.ts` cyclomatic complexity from 57 to ≤ 10.

# Acceptance Criteria

- [x] Consolidate positional-to-property resolution in `adapter.ts` by leveraging `property` resolved during `defineCommand`, eliminating inconsistent inline mappings.
- [x] Extend CLI flag adapter to resolve configured flag aliases and `--no-*` boolean negation flags directly from declared command flag metadata without hardcoded domain lists.
- [x] Simplify `mapContextToSchemaInput` to iterate resolved command metadata, reducing cyclomatic complexity from 57 to <= 10.
- [x] Pass validated schema input payloads (`z.infer<TSchema>`) directly to command `render` and `renderJson` functions.
- [x] Eliminate redundant manual `*Flags` interfaces across commands in favor of Zod schema inference.
- [x] Remove boilerplate `renderJson` implementations across command definitions that duplicate the framework default (`JSON.stringify(result, null, 2)`).
- [x] Extract shared command table formatter `formatCommandTable(rows)` in `framework/help.ts` to deduplicate `printNamespaceHelp` and `printGlobalHelp`.
- [x] Verify flag alias mapping, boolean negation, positional resolution, and rendered outputs across CLI framework tests.
- [x] User Review
