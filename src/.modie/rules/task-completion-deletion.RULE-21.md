---
links:
  - ADR-6
  - RULE-22
---

A completed `TASK` artifact must be deleted from the working tree upon commit. Completed tasks must not be retained on disk via filename suffixes or archive directories; task completion state must be resolved via version control history.

Prior to artifact deletion, the task's fully satisfied state—with all acceptance criteria verified and marked `[x]` per [RULE-22]—must be recorded in a Git commit. This ensures version control history retains immutable proof of completion, distinguishing completed tasks from abandoned ones.
