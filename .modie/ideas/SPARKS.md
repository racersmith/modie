# [ccc3] Clickable IDE links for artifact tags
What if we created a VS Code / Antigravity IDE extension that turns Modie artifact tags (`RULE-1`, `ADR-4`, `TASK-34`) into clickable document links across all source and markdown files?

# [b61a] MCP prompts for best-practice agent guidance
Add MCP prompts to guide agents through best-practice usage of Modie.

# [43cb] Colocated fixture artifact creation
Should we put the creation of fixture artifacts within their respective directories rather than compiling them all in `fixture-workspace`?

# [4b96] Bun builtin YAML parser for artifact frontmatter
Could we leverage Bun's builtin [YAML](https://bun.com/docs/runtime/yaml.md) parsing tool for Modie artifact frontmatter?

# [37f0] Content-addressed criteria short hashes
What if task acceptance criteria had content-addressed short hashes (e.g. `[a42d]`) rendered dynamically in `task_context` and accepted by `check_criteria(["a42d"])` to prevent index drift if criteria items are inserted or reordered mid-flight?

# [e441] Domain-specific MCP server partitioning
Break the single monolithic Modie MCP server into smaller, domain-specific MCP servers (e.g. task, research, document).

As part of the Antigravity plugin system, this would be easy to package and distribute modularly.

# [b9a6] Expose active sparks via modie://sparks ambient MCP resource
Provide a zero-token read interface (modie://sparks) on the Modie MCP server so agents and pure-MCP clients can inspect the active sparks ledger on-demand without adding tool prompt bloat.

# [7802] Clean up file-less empty .modie container directories
When artifacts are relocated or tasks are completed and deleted, parent `.modie/<subtype>` and `.modie/` directories may be left file-less and empty. A dedicated `modie cleanup` command could scan the repository and safely prune empty container directories to reduce clutter without conflating cleanup with relocation.
