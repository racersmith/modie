# [ccc3] Clickable IDE links for artifact tags
What if we created a VS Code / Antigravity IDE extension that turns Modie artifact tags (`RULE-1`, `ADR-4`, `TASK-34`) into clickable document links across all source and markdown files?

# [b61a] MCP prompts for best-practice agent guidance
Add MCP prompts to guide agents through best-practice usage of Modie.

# [1f76] Sub-tasks for granular scoping and context compilation
Could we leverage sub-tasks to allow for improved task scoping and context compilation?

For example, for a new feature that touches `core/` and `interfaces/`, the parent task would live in `src/` and have sub-tasks in `core/` and `interfaces/` respectively. Then when compiling context, we have a link from the child tasks to the parent and other children so work can be scoped more granularly with improved context.

# [b1d5] Configurable ignored directory names
Should we have the ignored directory names be defined in the Modie config file?

# [2bc4] Natural scoping via .gitignore
Should we naturally use the `.gitignore` for scoping?

# [43cb] Colocated fixture artifact creation
Should we put the creation of fixture artifacts within their respective directories rather than compiling them all in `fixture-workspace`?

# [77f9] Review tag application in test assertions
I think we need to review how we apply tags in tests so that they can be more valuable.

Having a string of 8 different tags in `it([ABC-1], [ABC-2], ...)` does not do the job of best linking what test relates to what rule. You have to spend time understanding the rules and the test to see what `expect` statements are for what tags.

# [5c66] Exclude list in config for false-positive tag scanning
Should we have an ignore or exclude list in the Modie config file so files like the root `README.md` can utilize artifact tags without raising false positives?

# [4b96] Bun builtin YAML parser for artifact frontmatter
Could we leverage Bun's builtin [YAML](https://bun.com/docs/runtime/yaml.md) parsing tool for Modie artifact frontmatter?

# [37f0] Content-addressed criteria short hashes
What if task acceptance criteria had content-addressed short hashes (e.g. `[a42d]`) rendered dynamically in `task_context` and accepted by `check_criteria(["a42d"])` to prevent index drift if criteria items are inserted or reordered mid-flight?

# [e441] Domain-specific MCP server partitioning
Break the single monolithic Modie MCP server into smaller, domain-specific MCP servers (e.g. task, research, document).

As part of the Antigravity plugin system, this would be easy to package and distribute modularly.

# [c1f9] Recommend artifact placement based on deepest common ancestor
Allow for recommended placement of artifacts based on references and the deepest common ancestor of those references.

This would allow for a fairly loose structure of artifacts at the root, but as the codebase grows, a narrower scope can be automatically identified.

# [8a7a] Restrict ADR links to internal Modie artifacts
Restrict ADR links to only within other Modie artifacts. ADRs should drive RULES which then define code.

For additional context on the rule, the agent can read the related ADR when necessary. The current method ends up with a proliferation of ADR links within the codebase that don't add much value and only pollute the context window.

# [864f] Directed application for repository-wide rules
How could we handle rules that more or less relate to large swaths of the codebase (e.g. not putting plaintext tags in tests)?

This would aim to make the application of a tag more directed and intentional so it does not add noise across unrelated tests.

# [657f] Include parent task in subtask context
When getting the context of a subtask (`task_context`), include the parent task's mission brief and objectives in the context.

# [b9a6] Expose active sparks via modie://sparks ambient MCP resource
Provide a zero-token read interface (modie://sparks) on the Modie MCP server so agents and pure-MCP clients can inspect the active sparks ledger on-demand without adding tool prompt bloat.
