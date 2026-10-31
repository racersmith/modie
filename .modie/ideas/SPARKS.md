# Sparks

- What if we created a VS Code / Antigravity IDE extension that turns Modie artifact tags (`RULE-1`, `ADR-4`, `TASK-34`) into clickable document links across all source and markdown files?

- Add MCP prompts to guide agents through best-practace usage of modie.

- Could we leverage sub-tasks to allow for improved task scoping and context compilation? ie. a new feature that touches `core/` and `interfaces/` the parent task would live in `src/` and have sub-tasks in `core/` and `interfaces/` resp. Then when compiling context we have a link from the child tasks to the parent and other children so work can be scoped more granularly with improved context.

- Should we have the `GIST`able file extentions be defined in the modie config file?

- Should we have the ignored directory names be defined in the modie config file?

- Should we naturally use the `.gitignore` for scoping?

- Should we put the creation of fixture artifacts within their respective directories rather than compiling them all in fixture-workspace?

- I think we need to review how we apply tags in tests so that they can be more valuable. Having a string of 8 different tags in `it([ABC-1], [ABC-2],....)` does not do the job of best linking what test relates to what rule. You have to spend time understanding the rules and the test to see what `expect` statements are for what tags.

- Should we have an ignore or exclude list in the modie config file so files like the root README.md can utilize artifact tags without raising false positives?
