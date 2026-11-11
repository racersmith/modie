---
summary: Modernize verification runner with oxlint and devDependencies to replace custom complexity script and add fast linting.

depends_on: []

links: []
---

# Context

Modernize the verification pipeline by adopting oxlint as a dev dependency to enforce cyclomatic complexity, file length limits (<500 healthy, 500-1000 caution, >1000 error), and general code linting. Move dpdm into devDependencies to eliminate bunx resolution overhead, and streamline scripts/verify.ts.

# Acceptance Criteria

- [x] Install off-the-shelf linting and dependency analysis dev dependencies
- [x] Configure linter with cyclomatic complexity and file length thresholds
- [x] Integrate linter into verification runner replacing custom ast analyzer
- [x] Clean existing lint warnings across codebase to achieve passing verification
- [x] Pass all verification checks under 5s execution threshold
- [x] User Review
