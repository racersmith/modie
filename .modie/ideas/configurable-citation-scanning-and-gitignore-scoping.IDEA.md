# Configurable Citation Scanning & Gitignore Scoping

> Consolidated from sparks `[5c66]` (*Exclude list in config for false-positive tag scanning*), `[b1d5]` (*Configurable ignored directory names*), and `[2bc4]` (*Natural scoping via .gitignore*).

## Problem & Motivation

Today, Modie's workspace traversal (`src/core/engine/traversal/active-scanner.ts`) and citation discovery (`src/core/engine/query/citation-source.ts`) rely on a hardcoded `DEFAULT_IGNORED_DIRECTORIES` set (`.git`, `node_modules`, `dist`, `build`, etc.) and scan all other text files in the repository.

This creates three related limitations:

1. **False-Positive Tag Matches in Documentation & Incubation Files (`[5c66]`):**
   Prose files like the root `README.md`, `AGENTS.md`, or `.modie/ideas/*.IDEA.md` naturally use concrete artifact tags as illustrative examples. Even though `citation-classifier.ts` buckets `.md` files under `foundIn.documentation` (so they do not block archival), they still inflate `foundIn.total` in `modie references` and require authors to tiptoe around literal tags in docs.
2. **Hardcoded Directory Ignore Lists (`[b1d5]`):**
   Projects with custom output, vendor, fixture, or generated directories (e.g. `coverage/`, `.vercel/`, `vendor/`, `scratch/`) cannot configure Modie to skip them without editing Modie's source code.
3. **Duplicating `.gitignore` Semantics (`[2bc4]`):**
   In `GitGrepSource`, `git grep` already respects `.gitignore` for untracked files when `--exclude-standard` is passed, whereas `FsWalkSource` and `scanActiveArtifacts` walk the filesystem manually using only `DEFAULT_IGNORED_DIRECTORIES`.

---

## Proposed Design

### 1. First-Class `.gitignore` Respect in Git Repositories (`[2bc4]`)

- **In `GitGrepSource` (`src/core/engine/query/citation-source.ts`):**
  Ensure `git grep --untracked --exclude-standard` is used so git-ignored paths are never scanned.
- **In `FsWalkSource` and `scanActiveArtifacts`:**
  Respect `.gitignore` patterns natively (or keep `DEFAULT_IGNORED_DIRECTORIES` purely as the fast baseline before `.gitignore` / config filtering) so build outputs, local scratch folders, and ignored worktrees are automatically skipped everywhere.

### 2. Configurable Exclusions in `.modie/config.json` (`[b1d5]` & `[5c66]`)

Extend `ModieConfig` in `src/core/platform/config/types.ts`:

```json
{
  "git": {
    "trunk": "dev",
    "protectedBranches": ["main"]
  },
  "ignore": {
    "directories": ["scratch", "vendor"],
    "citations": ["README.md", "AGENTS.md", ".modie/ideas/**"]
  }
}
```

- **`ignore.directories` (`[b1d5]`):**
  Merged with `DEFAULT_IGNORED_DIRECTORIES` and skipped during both artifact discovery (`scanActiveArtifacts`) and citation scanning (`CitationSource`).
- **`ignore.citations` (`[5c66]`):**
  Glob/path list of files or directories excluded from `findArtifactReferences` (or omitted unless `--include-docs` is passed). This allows `README.md`, `AGENTS.md`, and `.modie/ideas/**` to freely reference example tags without polluting `modie references` queries.
