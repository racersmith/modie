---
depends_on:
  - TASK-64

links:
  - RULE-23
  - RULE-31
  - RULE-35
---

# Context

Per the maintainability review (§4.7), `findArtifactReferences` in `src/core/query/references.ts` is the longest single function in the repository at 404 lines (cyclomatic complexity 25).

It currently combines three distinct phases with two scan backends inside one monolithic block:
- Outbound declared link calculation from parsed frontmatter.
- Shell execution of `git grep` and fallback recursive filesystem walking (`fs.walk`).
- Citation categorization and filtering that mutates five outer closure arrays simultaneously.
- Dead conditional logic (`isCode ? "code" : "code"` at lines 361–367).

This monolithic design makes reference inspection difficult to maintain, test in isolation, or extend with new search sources.

Refactor the pipeline into modular, single-responsibility components:
1. Extract a pure function `buildLinksTo(details)` for computing outbound declared links.
2. Define a clean `CitationSource` interface with `GitGrepSource` and `FsWalkSource` implementations that yield normalized match tokens (`{ relPath, line, snippet }`).
3. Extract a pure classifier `classifyCitation(match, targetTag, cache): FoundInItem | null` with dedicated unit test coverage.
4. Remove the dead conditional logic (`isCode ? "code" : "code"`).
5. Reassemble `findArtifactReferences` as a high-level pipeline orchestrator under 100 lines of code.

# Acceptance Criteria

- [x] Extract pure `buildLinksTo(details)` for computing outbound declared links.
- [x] Define a `CitationSource` abstraction with `GitGrepSource` and `FsWalkSource` implementations returning normalized file match tokens.
- [x] Extract pure citation classifier `classifyCitation(match, targetTag, cache)` with isolated unit tests.
- [x] Remove dead conditional logic (`isCode ? "code" : "code"`).
- [x] Reassemble `findArtifactReferences` as a pipeline orchestrating source extraction and classification, reducing length to < 100 lines.
- [x] Verify citation discovery and archival invariance tests pass with zero regressions.
- [x] User Review
