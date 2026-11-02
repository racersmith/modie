---
depends_on:
  - TASK-64

links:
  - RULE-23
  - RULE-31
  - RULE-35
---

# Context

Decompose the monolithic 404-line findArtifactReferences function in src/core/query/references.ts into a modular inspection pipeline. Extract pure outbound link calculation (buildLinksTo), define a CitationSource abstraction for Git-native and filesystem traversal search backends, and extract a pure citation classifier (classifyCitation).

# Acceptance Criteria

- [ ] Extract pure buildLinksTo(details) for computing outbound declared links
- [ ] Define a CitationSource abstraction with GitGrepSource and FsWalkSource implementations returning normalized file match tokens
- [ ] Extract pure citation classifier classifyCitation(match, targetTag, cache) with isolated unit tests
- [ ] Reassemble findArtifactReferences as a pipeline orchestrating source extraction and classification, reducing length to < 100 lines
- [ ] Verify citation discovery and archival invariance tests pass without regression
- [ ] User Review
