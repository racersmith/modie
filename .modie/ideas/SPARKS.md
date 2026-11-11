# Sparks

- What if we created a VS Code / Antigravity IDE extension that turns Modie artifact tags (`RULE-1`, `ADR-4`, `TASK-34`) into clickable document links across all source and markdown files?

- Add MCP prompts to guide agents through best-practace usage of modie.

- Could we leverage sub-tasks to allow for improved task scoping and context compilation? ie. a new feature that touches `core/` and `interfaces/` the parent task would live in `src/` and have sub-tasks in `core/` and `interfaces/` resp. Then when compiling context we have a link from the child tasks to the parent and other children so work can be scoped more granularly with improved context.

- Should we have the ignored directory names be defined in the modie config file?

- Should we naturally use the `.gitignore` for scoping?

- Should we put the creation of fixture artifacts within their respective directories rather than compiling them all in fixture-workspace?

- I think we need to review how we apply tags in tests so that they can be more valuable. Having a string of 8 different tags in `it([ABC-1], [ABC-2],....)` does not do the job of best linking what test relates to what rule. You have to spend time understanding the rules and the test to see what `expect` statements are for what tags.

- Should we have an ignore or exclude list in the modie config file so files like the root README.md can utilize artifact tags without raising false positives?

- Could we leverage the bun's builtin [YAML](https://bun.com/docs/runtime/yaml.md) parsing tool for modie artifact frontmatter?

- What if task acceptance criteria had content-addressed short hashes (e.g. `[a42d]`) rendered dynamically in `task_context` and accepted by `check_criteria(["a42d"])` to prevent index drift if criteria items are inserted or reordered mid-flight?

- Break the single monolithic modie mcp into smaller, domain specific mcp servers. This as part of the antigravity plugin system would be easy to package for us. ie. task, research, document.

- Allow for recommend placement of artifacts based on references and the deepest common ancestor of those references.  This would allow for a fairly loose strucutre of artifacts at the root but as the codebase grows a narrow scope can be identified.

- Restrict ADR links to only within other modie artifacts.  ADRs should drive RULES which then define code.  For additional context on the rule, the agent can read the related ADR when necessary.  The current method ends up with a proliferation of ADR links within the codebase that don't add much value and only pollute the context window.

- How could we handle rules that more or less relate to large swaths of the codebase. ie. how we should not put plaintext tags in tests.  This would be to try and make the application of a tag more directed and intentional so it does not add noise.

- When getting the context of a subtask include the parent task in the context.