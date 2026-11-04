---
depends_on:
  - TASK-44

links:
  - RULE-25
  - RULE-26
---

# Context

Per the maintainability review (§5) and the Agent-First MCP Design (`scratch/mcp-design.md` §4–5), client agents require lazy, parameterized access to workspace context, and server-side resource registration needs boilerplate consolidation:

1. **MCP Resource Envelope Boilerplate**:
   - MCP resource registrations repeatedly construct boilerplate JSON envelopes:
     `{ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(...) }] }`.
   - Implement a reusable helper `jsonResource(name, uri, meta, loader)` to standardize resource payload creation and reduce repetitive code.

2. **Scoped Resource Templates**:
   - Register dynamic URI templates that allow clients to hydrate specific contextual slices on-demand without overhead:
     - `modie://artifact/{tag}`: composite artifact inspection (file path, frontmatter, links, references, body/gist).
     - `modie://context/{target}`: pre-compiled architectural cones for tasks and files.
     - `modie://catalog/{kind}`: catalog listings with compact GIST summaries.

3. **Standardized Workflow Prompts**:
   - Register native MCP Workflow Prompts guiding multi-step agent interactions:
     - `modie_task_execution`: structured lifecycle progression from start to checklist verification and merge.
     - `modie_rule_authoring`: guided authoring of atomic, implementation-agnostic rules with least-scope placement and justifying ADR validation.
     - `modie_adr_authoring`: guided deliberation of architectural decisions, context, tradeoffs, consequences, and rule derivation.
   *(Note: Architectural review prompt `modie_architectural_review` is deferred to a future task).*

# Acceptance Criteria

- [ ] Implement `jsonResource(name, uri, meta, loader)` helper to eliminate repetitive MCP resource envelope boilerplate.
- [ ] Register dynamic resource template `modie://artifact/{tag}` delivering composite artifact view (file path, frontmatter, links, referencedBy, body/gist).
- [ ] Register dynamic resource template `modie://context/{target}` delivering pre-compiled architectural cones.
- [ ] Register dynamic resource template `modie://catalog/{kind}` delivering catalog listings with compact GIST summaries.
- [ ] Register native MCP Workflow Prompts (`modie_task_execution`, `modie_rule_authoring`, `modie_adr_authoring`).
- [ ] Verify client resource template discovery, parameterized reads, and prompt retrieval in MCP test suite.
- [ ] User Review
