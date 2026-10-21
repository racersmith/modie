---
depends_on:
  - TASK-13

links:
  - ADR-1
  - ADR-2
  - RULE-1
  - RULE-25
  - RULE-26
  - RULE-27
  - RULE-29
---

# Context

Resolve and inspect any indexable artifact (`RULE`, `ADR`, or `TASK`, whether active or archived) by its canonical tag (`[SUBTYPE]-[ID]`) per ADR-1, ADR-2, RULE-1, and RULE-29.

Provide CLI commands `modie find <tag>` to output the resolved file path for editor/script integration, and `modie show <tag>` to inspect document metadata, frontmatter links/dependencies, and content in both human-readable overview format (stderr) and agent-optimized JSON/raw format (stdout) per RULE-25, RULE-26, and RULE-27.

# Acceptance Criteria

- [ ] Implement core artifact resolver query service in `src/core/` to locate indexable artifacts (`RULE`, `ADR`, `TASK`, active or archived) by tag `[SUBTYPE]-[ID]`
- [ ] Implement core artifact inspection service returning parsed structure, frontmatter links, dependencies, and document body
- [ ] Implement CLI command `modie find <tag>` outputting the resolved file path to stdout per RULE-27 (with `--json` option)
- [ ] Implement CLI command `modie show <tag>` outputting human-readable document summary to stderr, with agent-optimized `--json` and `--raw` modes to stdout
- [ ] Add unit and integration tests verifying tag resolution for all indexable subtypes, active/archived state detection, error handling, and CLI stream separation
