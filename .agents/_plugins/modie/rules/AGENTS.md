# Modie

Modie is a distributed document-driven development tool used to maintain architectural governance alongside code.

## Artifacts & Tag Disambiguation

- Tagged artifacts: `TASK-<id>`, `RULE-<id>`, `ADR-<id>`
- Untagged documents: `MOTIVE`

## Agent Guidelines

- To check backlog readiness or active tasks, query the MCP resources `modie://tasks/ready` or `modie://tasks/all`.
- To read a specific tagged artifact use the mcp's `read_artifact(<TAG>)` tool.
- Read more detailed governance and lifecycle workflows from `modie://instructions`.
