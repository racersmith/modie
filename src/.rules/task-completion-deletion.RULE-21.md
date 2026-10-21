---
links:
  - ADR-6
---

A completed `TASK` artifact must be deleted from the working tree upon commit. Completed tasks must not be retained on disk via filename suffixes or archive directories; task completion state must be resolved via version control history.
