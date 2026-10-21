---
# depends_on:
#   - TASK-XX

links:
  - ADR-1
  - ADR-6
  - RULE-22
---

# Context

As a user/agent from the CLI I want to be able to create a new task that takes at a minimum the task title and a new markdown file is automatically created following the correct file naming structure defined in [ADR-1].

As an agent this should allow for complete task definition from a single CLI call.

As a human this should allow for simple creation with a good starting template for the task.

# Acceptance Criteria

- [ ] New task files can be created using the CLI with a task title
- [ ] Task IDs increment correctly
- [ ] Creating tasks on separate git branches does not result in ID overlap.
