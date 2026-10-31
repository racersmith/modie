---
depends_on:
  - TASK-52

links:
  - ADR-4
  - RULE-25
  - RULE-27
---

# Context

Add first-class alias resolution and boolean negation (--no-*) to the CLI adapter so command Zod schemas remain clean and canonical without duplicate alias properties, pass validated schema inputs to command render and renderJson handlers, and drop redundant manual *Flags interfaces.

# Acceptance Criteria

- [ ] Extend CLI flag adapter to resolve configured flag aliases and --no-* boolean negation flags to canonical schema keys prior to validation
- [ ] Pass validated schema input payloads directly to command render and renderJson functions
- [ ] Prune duplicate alias fields from command schemas and migrate command render handlers to consume typed input
- [ ] Eliminate redundant manual *Flags interfaces across commands in favor of schema inference
- [ ] Verify flag alias mapping, boolean negation, and rendered command outputs in CLI framework test suite
- [ ] User Review
