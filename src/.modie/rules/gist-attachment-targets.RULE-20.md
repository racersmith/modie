---
links:
  - ADR-10
  - ADR-11
---

All `GIST` artifacts and their freshness ledger must reside encapsulated within the `.modie/gists/` container directory of the directory they describe:

- The directory-level summary must be named `GIST.md` (`<dir>/.modie/gists/GIST.md`).
- File-level implementation proxies must be named `<filename>.GIST.md` (`<dir>/.modie/gists/<filename>.GIST.md`), where `<filename>` is the full name of the source file including its extension.
- The directory freshness ledger must be named `.gists` (`<dir>/.modie/gists/.gists`).

No GIST artifacts may exist directly in `<dir>/.modie/` or alongside source code.
