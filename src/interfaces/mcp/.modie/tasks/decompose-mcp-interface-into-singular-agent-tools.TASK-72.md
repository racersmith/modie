---
links:
  - RULE-6
  - RULE-21
  - RULE-22
  - RULE-25
  - RULE-26
  - RULE-27
  - RULE-28
  - RULE-30
  - RULE-32
  - RULE-35
---

# Context

Per the MCP interface design review (`scratch/mcp-design.md`), the 4 "consolidated mega-tools" (`modie_compile_context`, `modie_task_lifecycle`, `modie_create_artifact`, `modie_mutate_governance`) suffer from severe cognitive and ergonomic failure modes for LLMs:

1. **Union Object & Action Discriminator Traps**: `modie_task_lifecycle` bundles 6 distinct actions under an `action` enum, forcing all parameters to be optional in the schema and making it impossible for JSON schema validation to enforce that `check_items` is required for `check`.
2. **Polymorphic Dictionaries**: `modie_create_artifact` forces agents to supply freeform `sections: Record<string, string>` dictionaries, guessing whether a rule expects `"Invariant"` or `"assertion"`.
3. **Impedance Mismatch with Agent Reflexes**: `modie_compile_context(target)` clashes with natural agent commands (`ls`, `cat`, `git`).
4. **Token Inefficiency**: Wrapping markdown documents in escaped JSON string properties (`body: "# Invariant\n\n..."`) duplicates content and bloats token consumption.

Decompose the MCP interface into **11 Singular-Purpose Agent Tools** (`ls_better`, `read_artifact`, `task_context`, `start_task`, `check_criteria`, `complete_task`, `create_rule`, `create_adr`, `create_task`, `link_artifacts`, `archive_artifact`), implement a shared **Frontmatter-to-Markdown presentation engine** with a semantic `## Appendix`, prune bloated static and micro-resources down to strictly 3 parameterless ambient resources (`modie://task`, `modie://tasks/ready`, `modie://instructions`), and remove dead workflow prompts per YAGNI.

# Acceptance Criteria

- [x] Define flat Zod parameter schemas for the 11 singular-purpose agent tools (`ls_better`, `read_artifact`, `task_context`, `start_task`, `check_criteria`, `complete_task`, `create_rule`, `create_adr`, `create_task`, `link_artifacts`, `archive_artifact`), completely retiring the 4 legacy polymorphic mega-tool schemas and freeform `sections` dictionaries.
- [x] Implement Frontmatter-to-Markdown field handlers (`depends_on`, `links`, `supersedes`, `referencedBy`) that transform frontmatter metadata into an agent-readable `## Appendix: Relationships & Governance` section, resolving rule tags to titles and single-line invariant statements.
- [x] Implement `read_artifact` returning unescaped Markdown with file location comments, inbound citations, and the rendered frontmatter appendix.
- [x] Implement `task_context` and `start_task` returning an unescaped Markdown Mission Brief featuring the elevated blast radius constraint (`RULE-6`), numbered acceptance criteria checklist, and governing rule invariants.
- [x] Implement `ls_better` returning clean plaintext tab-separated listings (`<file|dir/>\t<gist>\n`) with Unix `ls -F` trailing slashes for directories, saving ~80% in tokens over JSON envelopes.
- [x] Implement deterministic state transition handlers for `check_criteria` (toggling 1-based indices and returning updated checklist progress) and `complete_task` (verifying all criteria, executing two-phase commit ceremony, merging to trunk, and deleting task branch).
- [x] Implement dedicated, strongly typed authoring handlers (`create_rule`, `create_adr`, `create_task`) with explicit domain properties, and graph mutation handlers (`link_artifacts`, `archive_artifact`).
- [x] Prune bloated static resources, template resources, and micro-resources down to strictly 3 parameterless ambient resources (`modie://task` in Markdown, `modie://tasks/ready` in JSON, `modie://instructions` in Markdown).
- [x] Retire dead MCP workflow prompts (`prompts.ts`) from the MCP server per YAGNI.
- [x] Update `instructions.md` and handshake instructions to document the 11 singular tools and 3 ambient resources.
- [x] Verify all 11 tools, output formats, and ambient resources against automated test suites with 0 test failures and zero regressions.
- [ ] User Review
