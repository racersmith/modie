---
links:
  - ADR-2
  - ADR-4
  - ADR-6
  - ADR-8
  - ADR-10
  - RULE-20
  - RULE-32
---

# Context

GIST artifacts summarize what implemented files and directories currently do so AI agents and engineers can navigate a codebase from an aggregate view instead of reading full source files (ADR-8). A GIST that no longer matches its source is worse than no GIST, because an agent will trust it and skip reading the underlying implementation. Modie must therefore detect stale GISTs deterministically, flag them when read, and drive their refresh.

The freshness system must satisfy several strict architectural constraints:
1. **Zero-Read Verification:** Freshness checks across hundreds of files must be sub-millisecond fast on every aggregate read without parsing markdown bodies or opening file ASTs.
2. **Semantic Damping (Bounded Propagation):** Routine source edits, formatting, or internal refactors that do not alter architectural meaning must not cascade update noise through ancestor directory GISTs.
3. **Pristine Prose & Metadata Decoupling:** GIST markdown files must consist purely of natural language prose without frontmatter or bookkeeping so that identical prose always produces an identical content hash.
4. **Filename & Path Stability:** GIST filenames must not churn or rename on every code edit, avoiding IDE tab disruption, broken links, and noisy `git status` diffs.
5. **Git Merge Safety:** Concurrent task branches modifying files in the same directory or sibling subtrees must not suffer Git textual merge conflicts or `rename/rename` collisions.
6. **Git History Resilience:** The mechanism must survive squash merges, rebases, and shallow CI clones (`--depth=1`) without relying on commit history or fragile timestamps.

# Alternatives Considered

1. **Source hash in GIST frontmatter without content normalization.** Simple to read, but updating the source hash rewrites the GIST file on disk. If the GIST content hash is computed over the whole file, every re-stamp changes the file's content hash, forcing every ancestor directory GIST to falsely report stale and re-stamp even when the prose did not change. Furthermore, checking freshness requires opening and parsing YAML frontmatter from every GIST file on disk, destroying aggregate read performance.
2. **Commit hash reference (last commit touching the file).** Associates GISTs with defined commit points, but commits cannot contain their own hashes, squash/rebase/amend orphan the referenced commit, last-touch queries fail in shallow clones, and it flags the exact same set of edits as a content hash.
3. **Recursive Git tree hash per directory.** Provides a native Merkle structure, but any change deep in the subtree invalidates every ancestor directory tree hash, defeating the goal of high-level summaries that only change when architectural meaning changes.
4. **In-process SHA-1/256 of raw unnormalized file bytes.** Diverges across operating systems when line-ending conversions (`core.autocrlf`, `core.eol`) or `.gitattributes` filters apply (e.g. Windows CRLF vs Linux LF), causing identical files to be falsely marked stale across different developer environments.
5. **Filename-stamped hashes (`<filename>.GIST.<hash>.md`).** Encoding the source hash in the filename decouples metadata from prose and enables zero-read staleness checks via directory listing. However, it causes constant file rename churn in `git status` on routine edits, breaks IDE tabs and persistent file links, and triggers difficult Git `rename/rename` conflicts when multiple branches modify children of the same directory GIST (`GIST.<hash>.md`).
6. **Centralized monolithic hash manifest (`.modie/gists.json`).** A single shared manifest file merged across branches; ADR-6 rejected the same pattern for task completion due to guaranteed merge conflicts.
7. **Per-directory JSON sidecar (`hash.json`).** Moving hashes to a per-directory JSON file preserves static filenames, but JSON syntax (commas, braces, adjacent keys) and top-level directory hash keys create Git textual merge conflicts whenever concurrent branches modify files in the same directory.
8. **Modification-time (mtime) comparison.** Timestamps are not preserved by Git checkout, clone, or rebase, producing false-stale and false-fresh results.

# Decision

We adopt a **Semantic Merkle Tree with Line-Delimited GIST Ledgers**, combining Git-compatible blob hashing with dynamic on-demand hierarchical synthesis.

## 1. Naming & Storage
All GIST artifacts and metadata are completely encapsulated within `<dir>/.modie/gists/`, leaving `<dir>/.modie/MOTIVE.md` as the sole intent file at the `.modie/` root (ADR-10, RULE-20):
- **Directory GIST:** `<dir>/.modie/gists/GIST.md`
- **File GIST:** `<dir>/.modie/gists/<filename>.GIST.md`, where `<filename>` is the full source filename including extension.
- **Local Ledger:** `<dir>/.modie/gists/.gists`

GIST markdown files contain only natural-language prose and **zero frontmatter**. Filenames remain permanent and never churn on source edits.

## 2. Line-Delimited GIST Ledger Format
Each directory encapsulates its freshness state in a sorted, line-delimited ledger at `<dir>/.modie/gists/.gists`. Using a line-oriented format (identical to `.gitignore` and `.gitattributes`) allows Git's 3-way merge to resolve independent file additions and updates cleanly without textual merge conflicts.

```text
# Modie GIST Ledger
DIR_INPUT   7d8f9a2e10

# Local Source Files: <filename> <source_hash> <baseline_hash>
active-scanner.ts    3f8a02c914    3f8a02c914
watermark.ts         ff44aa1100    e2b10a9f5c
```

- `DIR_INPUT`: The stamped hash of the child inputs that `<dir>/.modie/gists/GIST.md` was authored against.
- Local file records: Sorted alphabetically by source filename, storing:
  1. `<source_hash>`: The Git blob hash of the source file currently verified on disk.
  2. `<baseline_hash>`: The Git blob hash of the source file **at the moment the GIST prose was last authored/reviewed**.

## 3. Hash Definitions & Roles
All hashes use Git-compatible blob object hashing (`hash("blob " + length + "\0" + payload)`), computed in-process for speed or via `git hash-object`. Line endings are normalized (`\r\n` $\rightarrow$ `\n`) before hashing to guarantee deterministic hashes across Windows, macOS, and Linux.

- **`source_hash` (Freshness Sentinel):** The Git blob hash of the source file. Used for the instant binary check: `hash(file) === source_hash` $\rightarrow$ `fresh` vs `stale`.
- **`baseline_hash` (Diff Anchor):** The source file's Git blob hash when the GIST prose was last genuinely authored or rewritten. Enables cumulative diffs (`git diff <baseline_hash> -- <file>`) to prevent compounding drift across multiple minor edits.
- **`DIR_INPUT` (Directory Seal):** The hash of the canonical list of child GIST contents evaluated on-demand. Proves whether any child summary has changed since `GIST.md` was authored.

Notably, **no GIST prose hashes are stored in the ledger**. The `.GIST.md` files on disk are the sole ground truth. This eliminates cache desynchronization if a developer edits a markdown file directly, simplifies the ledger, and allows semantic damping to operate naturally from the filesystem.

## 4. The Directory Input Vector (On-Demand Hierarchical Synthesis)
The source material for a directory GIST consists of:
1. The on-demand content of all direct file GISTs in that directory (`<dir>/.modie/gists/<filename>.GIST.md`).
2. The on-demand content of all immediate child directory GISTs (`<child_dir>/.modie/gists/GIST.md`).

Because GIST files are ultra-concise (max 2 sentences, ~200 bytes each), reading and hashing 15–20 child files takes under 0.2 milliseconds in memory.

Modie constructs a canonical, byte-sorted (`LC_ALL=C`) input string with LF newlines:
```text
DIR   pipeline/     4a3b2c1d
DIR   resolver/     8e9f0a1b
DIR   vcs/          f7e6d5c4
FILE  index.ts      e1d2c3b4
FILE  types.ts      b2c3d4e5
```
Where each hash entry is the on-demand content hash of that child's GIST file. The Directory Input Hash is `hash(canonical_input_string)`.

Because directory summaries derive strictly from the *prose* of their children (rather than raw source code), when a leaf file's source code is updated but its summary prose is untouched, its file GIST on disk does not change. Its on-demand hash remains invariant, so the directory GIST is **immediately verified fresh**. Propagation halts instantly at the leaf.

## 5. Deferred Parent Invalidation (Zero Cross-Directory Merge Conflicts)
Parent directories **do not store child directory hashes in their `.gists` file**. 

Instead, Modie resolves child directory hashes dynamically on read from `<child_dir>/.modie/gists/GIST.md`. 
- When `src/core/resolver/` updates its GIST, no files in `src/core/` are modified on disk.
- Concurrent branches modifying sibling subtrees (e.g. `src/core/resolver/` on Branch A, `src/core/vcs/` on Branch B) touch completely disjoint files, resulting in **zero Git merge conflicts**.
- When merged, Modie evaluates `src/core/.modie/gists/GIST.md` as "directory stale" on read because its computed Directory Input Hash differs from the stamped `DIR_INPUT`.

## 6. Verification on Read (Sub-Millisecond Zero-Read)
Aggregate reads verify GIST freshness rapidly:
1. **Leaf File Check:** Compare current source file hash with `<source_hash>` recorded in `.gists`. The GIST markdown file is not opened.
2. **Directory Check:** Compute the Directory Input Hash from the on-demand contents of immediate child `.GIST.md` files, comparing with `DIR_INPUT` in `.gists`.

Each GIST is reported in exactly one state:
- **fresh:** Stamped hash matches current computed hash.
- **stale:** Source code or directory child summaries have changed.
- **missing:** An eligible source or directory has no GIST.
- **orphaned:** A recorded source file no longer exists on disk.
- **directory stale:** One or more child GIST contents have changed.

## 7. Agent Refresh Workflow & Compounding Diff Resolution
Staleness is resolved by an AI agent, enforced at the task completion ceremony (RULE-32):
- **Compounding Diff Guard:** When a file GIST is stale, the agent is shown the **cumulative diff against the baseline anchor**:
  ```bash
  git diff <baseline_hash> -- <filename>
  ```
  This guarantees that multiple sequential "trivial" edits cannot mask a cumulative architectural drift.
- **Trivial Refactor Shortcut:** Agents can flag routine formatting or minor edits via CLI (`modie gist touch <path> --trivial`) or MCP tool. Modie also applies a programmatic threshold (e.g. whitespace/comments only or < 15 lines changed): `<source_hash>` advances to the new blob while `<baseline_hash>` remains anchored, skipping agent review turns.
- **Prose Rewrite:** If the agent rewrites `<filename>.GIST.md`, both `<source_hash>` and `<baseline_hash>` advance to the current source blob hash.
- **Directory GIST Refresh:** The agent is prompted **only with the 2-sentence summaries of its immediate children** (direct file GISTs and child directory GISTs), never raw source code. The prompt context is under 300 tokens regardless of subtree size. If the directory summary remains accurate, Modie updates `DIR_INPUT` in `.gists`, and the parent directory is never invalidated.

## 8. Automated Orphan Reconciliation (Rename Detection)
When a source file is renamed (`git mv`), Modie leverages content-addressing to resolve the move with zero token cost:
1. Modie identifies an orphaned entry in `.gists` whose `<source_hash>` exactly matches the hash of a newly added, unindexed source file in the project.
2. Modie automatically moves and renames `<old_filename>.GIST.md` to `<new_filename>.GIST.md` and updates the entry in `.gists`.
3. Zero agent prompt or review turn is needed. Remaining un-matched orphans are purged during the task completion ceremony.

# Consequences

- GIST filenames remain permanent, predictable, and compliant with ADR-2, ADR-10, and RULE-20.
- `git status` diffs remain completely free of file rename noise during routine development.
- Checking freshness across hundreds of files is sub-millisecond fast via single-ledger reads per directory.
- Redundant prose caching is eliminated; `.GIST.md` files on disk are the single source of truth.
- Cumulative drift is prevented by anchoring diffs to `<baseline_hash>`.
- Routine file renames are detected and reconciled automatically via hash matching.
- Merging concurrent task branches touching different files or subdirectories produces zero merge conflicts.

