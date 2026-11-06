---
depends_on:
  - TASK-77

links:
  - RULE-1
  - RULE-11
  - RULE-23
  - RULE-35
---

# Context

To maintain architectural integrity permanently and prevent regressions as the codebase evolves:

1. **Formal Governance Rule**:
   - Author a formal Modie governance rule (`Architecture Layering and Complexity Guard`) codifying:
     - Zero circular dependencies across core modules (both 2-cycles and deep multi-hop dependency chains).
     - Maximum function cyclomatic complexity threshold of CC ≤ 15 for all non-composition functions.

2. **Automated Architecture Test Suite**:
   - Implement an automated architecture test suite that executes AST complexity analysis (`check:complexity`) and circularity detection (`check:circular`) against `src/core`, ensuring that Modie permanently enforces its own architectural invariants.

3. **CI Pipeline Integration**:
   - Establish CI quality gates in GitHub Actions workflows and package scripts ensuring that any circular dependency, complexity threshold violation (CC > 15), or test failure blocks integration on pull requests and commits.

# Acceptance Criteria

- [ ] Author formal Modie governance rule `Architecture Layering and Complexity Guard` specifying zero circular dependencies and maximum function cyclomatic complexity CC <= 15.
- [ ] Add an automated architecture test asserting zero circular dependencies and that no function exceeds cyclomatic complexity threshold (CC <= 15) per `Architecture Layering and Complexity Guard`.
- [ ] Establish CI workflow and scripts enforcing complexity, circularity, and test gates on every build and pull request.
- [ ] Verify complete test suite passes with zero false positive citations or regressions.
- [ ] User Review

