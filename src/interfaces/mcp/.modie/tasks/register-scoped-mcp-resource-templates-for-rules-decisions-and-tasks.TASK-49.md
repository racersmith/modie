---
depends_on:
  - TASK-44

links:
  - RULE-25
  - RULE-26
---

# Context

Register distinct, scoped MCP Resource Templates (`modie://artifact/{tag}`, `modie://context/{target}`, `modie://scope/{path}`, `modie://catalog/{kind}`, `modie://templates/{subtype}`) and native Workflow Prompts (`modie_task_execution`, `modie_architectural_review`, `modie_governance_authoring`) per `scratch/mcp-design.md`, providing on-demand lazy context loading and guided workflows with zero static preamble token overhead.

# Acceptance Criteria

- [ ] Register dynamic resource template `modie://artifact/{tag}` delivering composite artifact view (file path, frontmatter, links, referencedBy, body/gist)
- [ ] Register dynamic resource template `modie://context/{target}` delivering pre-compiled architectural cones
- [ ] Register dynamic resource template `modie://scope/{path}` delivering spatial scope and container hierarchy
- [ ] Register dynamic resource template `modie://catalog/{kind}` delivering catalog listings with compact GIST summaries
- [ ] Register dynamic resource template `modie://templates/{subtype}` delivering raw scaffolding template skeletons
- [ ] Register dynamic resource `modie://task/current` delivering active task branch checklist, progress, and blast radius stream
- [ ] Register native MCP Workflow Prompts (`modie_task_execution`, `modie_architectural_review`, `modie_governance_authoring`)
- [ ] Verify client resource template discovery, parameterized reads, and prompt retrieval in test suite
- [ ] User Review
