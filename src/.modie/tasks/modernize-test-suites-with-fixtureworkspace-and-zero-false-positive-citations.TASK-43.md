---
depends_on:
  - TASK-43-1
  - TASK-43-2
  - TASK-43-3
  - TASK-43-4
  - TASK-43-5
  - TASK-43-6
  - TASK-43-7
  - TASK-43-8
  - TASK-43-9
  - TASK-43-10
  - TASK-43-11
  - TASK-43-12

links:
  - RULE-12
  - RULE-18
  - RULE-21
  - RULE-23
  - RULE-28
  - RULE-30
  - RULE-34
  - RULE-35
  - ADR-6
  - ADR-7
  - ADR-9
---

# Context

Parent modernization task coordinating the refactoring of 12 test suites across the repository to adopt hermetic FixtureWorkspace testing infrastructure (RULE-34) and eliminate false-positive governance citations (RULE-35). Subtasks are decomposed to least scope directories per RULE-12.

# Acceptance Criteria

- [x] Complete core task creation test suite modernization (TASK-43-1)
- [x] Complete core task primitive test suite modernization (TASK-43-2)
- [ ] Complete core rule primitive test suite modernization (TASK-43-3)
- [ ] Complete core watermark resolver test suite modernization (TASK-43-4)
- [ ] Complete core artifact query test suite modernization (TASK-43-5)
- [ ] Complete core pipeline test suite modernization (TASK-43-6)
- [ ] Complete core common primitives test suite modernization (TASK-43-7)
- [ ] Complete CLI find command test suite modernization (TASK-43-8)
- [ ] Complete CLI show command test suite modernization (TASK-43-9)
- [ ] Complete CLI task create command test suite modernization (TASK-43-10)
- [ ] Complete CLI task lifecycle command test suite modernization (TASK-43-11)
- [ ] Complete CLI root entrypoint test suite modernization (TASK-43-12)
- [ ] Verify all test suites pass with zero false positives across active governance queries
