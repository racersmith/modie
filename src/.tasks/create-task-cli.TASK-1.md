---
depends_on:
  - TASK-2
  - TASK-3
  - TASK-4
  - TASK-5
  - TASK-6

links:
  - ADR-1
  - ADR-6
  - RULE-22
  - RULE-21
  - RULE-6
  - ADR-4
---

# Context

As a user/agent from the CLI I want to be able to create a new task that takes at a minimum the task title and a new markdown file is automatically created following the correct file naming structure defined in [ADR-1].

As an agent this should allow for complete task definition from a single CLI call.

As a human this should allow for simple creation with a good starting template for the task.

# Acceptance Criteria

- [ ] New task files can be created using the CLI with a task title
- [ ] Task IDs increment correctly with each new task on the same branch.
- [ ] Creating tasks on separate git branches does not result in ID overlap.
- [ ] Task IDs increment correctly when a completed task is delted.
