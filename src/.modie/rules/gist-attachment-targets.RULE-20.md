---
links:
  - ADR-10
---

A `GIST` artifact may only exist within the `.modie/` container of the directory it describes, either as a directory-level summary named `GIST.md` (`<dir>/.modie/GIST.md`) or as a file-level implementation proxy named `<filename>.GIST.md` (`<dir>/.modie/gists/<filename>.GIST.md`), where `<filename>` is the full name of the source file including its extension.
