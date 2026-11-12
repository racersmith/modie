# Recommend Artifact Placement Based on Deepest Common Ancestor

## Problem & Motivation

In a filesystem-as-DAG architectural governance model like Modie, artifacts are designed to follow **Least Scope Placement (RULE-12)**:
> *"An artifact (`RULE`, `ADR`, `TASK`) must reside at the deepest common ancestor directory of the codebase elements it governs, influences, or modifies. Placing artifacts higher than their minimum necessary scope is prohibited to prevent token bloat and context pollution across sibling subtrees during upward compilation."*

However, during active development, engineers and AI agents experience two opposing pressures:

1. **The Root Vault Anti-Pattern (Over-Scoping):** When authoring a new `RULE` or `ADR`, the author rarely knows the final boundary of every future subsystem that will cite it. The path of least resistance is to place the artifact in the repository root (`.modie/`) or top-level source root (`src/.modie/`). Over time, this bloats the context window during upward ancestral context compilation ($A = [R, \dots, P]$ per RULE-9), causing "lost-in-the-middle" attentional degradation for leaf tasks.
2. **The Sibling Blindspot & Inadvertent Duplication (Under-Scoping):** To protect LLM token economy and maintain clean module boundaries, upward compilation intentionally hides sibling and descendant subtrees (RULE-2, RULE-9, RULE-19). But this creates a dangerous blindspot: an author working in `src/interfaces/cli` has zero visibility into a specialized rule placed down in `src/core/engine/.modie/rules/`. When a similar need emerges in `cli`, the author assumes no governance exists and mints a redundant, parallel artifact (`RULE-42`) that duplicates or fragments existing governance in `RULE-27`.

### The Solution: A Two-Way Breathing Model

Modie's governance model should not be static. Artifacts should naturally breathe in two directions:

```
               ▲  ELEVATION (Generalization / Anti-Duplication)
               │  When an under-scoped rule is needed in sibling subtrees,
               │  pull it UP to their Deepest Common Ancestor (DCA).
               │
    WORKSPACE ROOT (.) ◄─────────────────────────► LEAF SUBTREES
               │
               │  DEMOTION (Specialization / Least-Scope Placement)
               │  When references show a root rule is only cited in one module,
               ▼  push it DOWN to the Deepest Common Ancestor (DCA).
```

### The Superpower of Modie's Identifier Architecture

Unlike traditional systems where moving a file breaks relative imports, issue trackers, and links, Modie has an unfair architectural advantage:

* **Self-Indexing, Monotonic Identifiers:** Artifact identities are globally unique and monotonic (`RULE-38`, `ADR-10`).
* **Content-Agnostic Tag Resolution:** References query artifacts dynamically across all `.modie/` subtrees (RULE-29).
* **Decoupled Verification Citations:** Code annotations (`// @verifies RULE-38`) and test names (`[RULE-38]`) cite the falsifiable tag, never the file path (RULE-23, RULE-35).

**Relocating an artifact between directory scopes requires zero changes to code, zero test renames, and zero link updates.**

---

## Topological Foundation & The Natural Graph

```
                   Workspace Root (.)
                   └── src/ (.modie/)
                       ├── core/ (.modie/) ◄─── Recommended Scope for RULE-38
                       │   ├── domain/           (Deepest Common Ancestor of all 68 citations)
                       │   ├── engine/
                       │   └── platform/
                       └── interfaces/ (.modie/)
                           ├── cli/ (.modie/) ◄─── Optimal Scope for RULE-27
                           └── mcp/ (.modie/) ◄─── Optimal Scope for RULE-26
```

### 1. Determining the Natural Graph for `RULE` Artifacts

Rules directly govern code and tests. Per RULE-23, source files and test suites explicitly cite the rules they implement and verify:

$$\text{Targets}(RULE_X) = \text{Paths}(\text{Source Citations}) \cup \text{Paths}(\text{Test Verifications}) \cup \text{Paths}(\text{Active Tasks Linking } RULE_X)$$

$$\text{RecommendedScope}(RULE_X) = \text{findDeepestCommonAncestor}(\text{Targets}(RULE_X))$$

* **Over-Scoped:** $\text{RecommendedScope} \subset \text{CurrentScope}$ (strictly deeper). The rule is unnecessarily high, polluting sibling contexts.
* **Optimal:** $\text{RecommendedScope} == \text{CurrentScope}$. The rule is at least-scope placement.
* **Under-Scoped:** One or more citations reside outside $\text{CurrentScope}$. The rule lacks downward authority over those files (RULE-6).

### 2. Determining the Natural Graph for `ADR` Artifacts

Per RULE-16 and RULE-17, ADRs do not directly govern code files; they justify rules and constrain architectural topology:
* **RULE-16:** A `RULE` referencing an `ADR` must target an `ADR` in the rule's directory or an ancestor directory ($ADR \ge RULE$).
* **RULE-17:** An `ADR` referencing a `RULE` must target a `RULE` in the ADR's directory or a descendant directory ($ADR \le RULE$).

$$\text{Targets}(ADR_Y) = \text{Paths}(\text{Active RULEs where } links \ni ADR_Y) \cup \text{Paths}(\text{Active ADRs where } links \ni ADR_Y)$$

$$\text{RecommendedScope}(ADR_Y) = \text{findDeepestCommonAncestor}(\text{Targets}(ADR_Y))$$

---

## Placement Classification Matrix

| Status | Condition | Implication & Action |
| :--- | :--- | :--- |
| **`OPTIMAL`** | $\text{DCA} == \text{CurrentScope}$ | Perfectly located at its least necessary scope. Zero action needed. |
| **`OVER_SCOPED`** | $\text{DCA}$ is strictly deeper than $\text{CurrentScope}$ | **Context Pollution:** Artifact leaks into sibling tasks. Demote down to $\text{DCA}$. |
| **`UNDER_SCOPED`** | Citations or demands escape $\text{CurrentScope}$ | **Authority Violation / Sibling Demand:** Code cites a rule outside its scope, or a sibling wants to author a duplicate. Elevate up to $\text{DCA}$. |
| **`INCHOATE`** | Total citations $< N$ (e.g. 0 or 1) | **Immature Artifact:** Insufficient graph data to determine a permanent home. Retain at current scope until mature. |

---

## Protecting Against Duplicate Creation of Underscoped Artifacts

When an artifact is placed deeply in a leaf directory (e.g. `src/core/engine/.modie/rules/stream-separation.RULE-12.md`), an engineer or agent working in `src/interfaces/cli` cannot see it during normal task execution. 

If they try to solve the same problem in their subtree, how do we prevent duplicate artifact creation?

### 1. Global Pre-Creation Collision & Similarity Scanning

During standard task compilation (`modie context`), only ancestors are indexed to protect the LLM context window. However, **during artifact authoring (`create_rule`, `create_adr`, `modie rule create`, `modie adr create`)**, the pipeline must bypass local scope boundaries and query the **global artifact registry** across the entire repository:

```
Author submits: "CLI Stream Separation" at "src/interfaces/cli"
                               │
                               ▼
        ┌──────────────────────────────────────────────┐
        │        Global Registry Pre-Flight Scan       │
        │        (scanActiveArtifacts across repo)     │
        └──────────────────────┬───────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
   Exact Slug Match                     Semantic/Token Overlap
   ("stream-separation")               ("cli-stream-separation")
            │                                     │
            └──────────────────┬──────────────────┘
                               │ Match found in sibling subtree:
                               ▼ RULE-12 at `src/core/engine`
        ┌──────────────────────────────────────────────┐
        │          ELEVATE INSTEAD OF MINT             │
        │                                              │
        │  1. Compute DCA(src/core/engine,             │
        │                 src/interfaces/cli) = "src"  │
        │  2. Prompt to move RULE-12 to "src"          │
        │  3. Block duplicate creation without --force │
        └──────────────────────────────────────────────┘
```

#### Pre-Creation Linter Checks
1. **Canonical Slug Collision (Exact):** If an active artifact with the exact same slug already exists anywhere in the repository, block creation immediately:
   ```
   SLUG_COLLISION_ACROSS_SCOPES:
   An active RULE with slug 'stream-separation' already exists at:
     RULE-12: src/core/engine/.modie/rules/stream-separation.RULE-12.md
   
   To share this rule across 'src/interfaces/cli', move it to the common ancestor 'src':
     modie scope move RULE-12 src
   Or simply cite RULE-12 in your code and run:
     modie scope audit --apply
   ```
2. **Lexical / Token Jaccard Overlap (Fuzzy):** If the new title shares high token similarity with an existing artifact of the same subtype, surface an advisory diagnostic with the candidate tag and its current scope.

---

### 2. The Workflow: Natural Tagging First, Then Audit or Move

Rather than introducing redundant commands (e.g. separate "elevate" vs "move" operations), Modie supports two natural, streamlined paths:

#### Option A: Declarative Flow (Tag-First, Zero Command Friction)
1. **Cite the Existing Rule:** When working in `src/interfaces/cli/`, the author recognizes that `RULE-12` (currently nested in `src/core/engine/`) represents the invariant they need. They directly add the tag in code or tests:
   ```typescript
   // @verifies RULE-12
   ```
2. **Natural Graph Expansion:** Because a citation now exists in `src/interfaces/cli`, the rule's reference graph automatically expands across subtrees.
3. **Audit & Reconcile:** 
   - `modie scope audit` detects that `RULE-12` citations now escape `src/core/engine`, flagging it as `UNDER_SCOPED`.
   - Running `modie scope audit --apply` calculates $\text{findDeepestCommonAncestor}(\text{engine}, \text{cli}) = \text{"src"}$ and moves the artifact to `src/.modie/rules/` automatically.

#### Option B: Imperative Flow (`modie scope move`)
If the author prefers to relocate the artifact upfront before writing code:
```bash
modie scope move RULE-12 src
```
* **With Explicit Target (`modie scope move <TAG> <targetScope>`):** Moves the artifact directly to `<targetScope>/.modie/<subtypes>/`, verifying that the move does not violate link ancestry (RULE-16, RULE-17) or downward blast radius.
* **Without Target (`modie scope move <TAG>`):** Automatically evaluates $\text{findDeepestCommonAncestor}(\text{citations})$ and relocates the artifact to its optimal mathematical scope.

---

### 3. Static Verification of Out-of-Scope Citations (`UNDER_SCOPED` Detection)

What happens if a developer discovers a nested rule and directly adds `// @verifies RULE-12` in `src/interfaces/cli/command.ts`, even though `RULE-12` is locked inside `src/core/engine/`?

In `modie verify` and `modie scope audit`:
* Check every citation against the artifact's governing scope.
* If a citation resides in a file $F$ such that $\text{findDeepestCommonAncestor}(\text{Scope}(F), \text{Scope}(Artifact)) \ne \text{Scope}(Artifact)$, flag the rule as **`UNDER_SCOPED`**.
* The audit report highlights:
  ```
  TAG      SUBTYPE  CURRENT SCOPE    RECOMMENDED  STATUS        VIOLATIONS
  RULE-12  RULE     src/core/engine  src          UNDER_SCOPED  Cited by src/interfaces/cli/command.ts
  ```
* Running `modie scope audit --apply` automatically elevates the under-scoped rule to `src`.

---

## Real-World Case Study (Modie Codebase)

Evaluating Modie's existing artifacts illustrates the immediate token and architectural wins:

### Case 1: `RULE-38` (`core-architectural-layer-dependency-direction`)
* **Current Location:** `src/.modie/rules/core-architectural-layer-dependency-direction.RULE-38.md` (Governing Scope: `src`)
* **Reference Graph (`modie references RULE-38 --code-only`):**
  - 45 source file citations (all in `src/core/domain/`, `src/core/engine/`, `src/core/platform/`, `src/core/index.ts`)
  - 23 test citations (all in `src/core/**`)
  - 0 citations in `src/interfaces/**`
* **Deepest Common Ancestor:** `src/core`
* **Diagnosis:** **`OVER_SCOPED`**
* **Impact of Relocation to `src/core/.modie/rules/`:**
  - Tasks in `src/core/` retain full access to RULE-38.
  - Tasks in `src/interfaces/cli` and `src/interfaces/mcp` save ~250 tokens per task context and eliminate completely irrelevant layer constraints from their attentional focus.

### Case 2: `RULE-27` (`cli-stdout-stderr-separation`)
* **Current Location:** `src/interfaces/cli/.modie/rules/cli-stdout-stderr-separation.RULE-27.md` (Governing Scope: `src/interfaces/cli`)
* **Reference Graph:** Citations strictly in CLI handlers and CLI execution tests.
* **Deepest Common Ancestor:** `src/interfaces/cli`
* **Diagnosis:** **`OPTIMAL`** (Properly isolated; never leaks into domain or MCP tasks).

### Case 3: `RULE-34` (`fixture-based-test-isolation`)
* **Current Location:** `src/.modie/rules/fixture-based-test-isolation.RULE-34.md` (Governing Scope: `src`)
* **Reference Graph:** Cited in 425 test files across `src/core/` and `src/interfaces/`.
* **Deepest Common Ancestor:** `src`
* **Diagnosis:** **`OPTIMAL`** (Cross-cutting repository test invariant; belongs at `src`).

---

## Architectural & Engine Design

```
┌─────────────────────────────────────────────────────────────┐
│                    Existing Primitives                      │
│                                                             │
│  findArtifactReferences(tag)   findDeepestCommonAncestor()  │
│  [src/core/engine/query]       [src/core/domain/common]     │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│             New Engine Query Service (RULE-25)               │
│                                                             │
│             auditArtifactPlacement(tagOrScope)              │
│             [src/core/engine/query/placement.ts]            │
│                                                             │
│  1. Scans active rules & ADRs across workspace              │
│  2. Resolves citation paths via findArtifactReferences      │
│  3. Computes DCA via findDeepestCommonAncestor              │
│  4. Compares with resolveGoverningScope                     │
│  5. Produces ScopingAuditReport (Optimal, Over, Under)      │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
┌───────────────────────┐             ┌───────────────────────┐
│     CLI Interface     │             │    MCP Integration    │
│  modie scope audit    │             │   directory_context   │
│  modie scope move     │             │     task_context      │
│                       │             │      create_rule      │
└───────────────────────┘             └───────────────────────┘
```

### 1. The Core Query Algorithm (`auditArtifactPlacement`)

```typescript
export interface ArtifactPlacementSuggestion {
  tag: string;
  subtype: "RULE" | "ADR";
  title: string;
  currentScope: string;
  recommendedScope: string;
  status: "OPTIMAL" | "OVER_SCOPED" | "UNDER_SCOPED" | "INCHOATE";
  citationsCount: number;
  referencingPaths: string[];
  suggestedPath: string;
  violations?: string[];
}

export async function auditArtifactPlacement(
  tagOrScope?: string,
  options: AuditOptions = {},
): Promise<ArtifactPlacementSuggestion[]> {
  // 1. List candidate artifacts across global workspace
  // 2. For each artifact:
  //    a. Fetch references via findArtifactReferences(tag)
  //    b. If RULE: extract code + test paths (+ linking active task paths)
  //    c. If ADR: extract paths of active rules linking to this ADR
  //    d. If citationCount < minCitationsThreshold (default: 3) -> INCHOATE
  //    e. dca = findDeepestCommonAncestor(targets, cwd)
  //    f. Compare dca with resolveGoverningScope(artifact.filepath)
  //       - If dca is strictly below currentScope: OVER_SCOPED (demote)
  //       - If targets escape currentScope: UNDER_SCOPED (elevate)
  //       - If dca === currentScope: OPTIMAL
  //    g. Return structured recommendation
}
```

### 2. Auto-Relocation & Elevation Engine (`relocateArtifact`)

When applying a demotion or elevation:
1. Ensure destination directory exists: `<recommendedScope>/.modie/<subtypes>/`.
2. Scaffold `<recommendedScope>/.modie/MOTIVE.md` if the target directory lacks an architectural motive.
3. Move the file from old path to new path using standard filesystem rename (or Git move if VCS adapter is active).
4. Verify graph invariants via `linkValidator` to ensure no downward or sideways link constraints were violated (RULE-16, RULE-17, RULE-19).
5. Prune empty parent `.modie/` directories if the relocated artifact leaves behind a file-less `.modie/` container.

---

## Tooling & User Ergonomics

### 1. CLI Commands

* **`modie scope audit [target]` (alias: `modie audit`)**
  Audits the workspace (or a specific subdirectory/tag) and prints a high-signal report to `stderr` (and machine JSON to `stdout` per RULE-27):

  ```bash
  $ modie scope audit

  Artifact Scope Audit (Least Scope Placement - RULE-12):

  TAG       SUBTYPE  CURRENT SCOPE    RECOMMENDED     CITATIONS  STATUS        ACTION / SAVINGS
  RULE-38   RULE     src              src/core        68         OVER_SCOPED   Demote to src/core (~250 tokens/cli task)
  RULE-12   RULE     src/core/engine  src             14         UNDER_SCOPED  Elevate to src (cited outside engine)
  RULE-27   RULE     src/interfaces   src/interfaces  54         OPTIMAL       -
  RULE-34   RULE     src              src             425        OPTIMAL       -

  Summary: 1 over-scoped, 1 under-scoped artifact detected. Run with --apply to resolve.
  ```

* **`modie scope audit --apply`**
  Prompts (or automatically executes) atomic file moves for all `OVER_SCOPED` and `UNDER_SCOPED` artifacts.

* **`modie scope move <TAG> [targetScope]`**
  Manually relocates an artifact to a target directory.
  - **Explicit Target (`modie scope move <TAG> <targetScope>`):** Moves the artifact to `<targetScope>/.modie/<subtypes>/`, validating that the move does not violate link hierarchy (RULE-16, RULE-17) or blast radius. Works symmetrically for both widening scope (elevating) and narrowing scope (demoting).
  - **Auto Target (`modie scope move <TAG>`):** If `targetScope` is omitted, automatically computes $\text{findDeepestCommonAncestor}(\text{citations})$ and relocates the artifact to its optimal mathematical scope.

### 2. MCP Server Guidance

* **Creation Guardrails in `create_rule` and `create_adr`:**
  If a proposed title has an exact slug or high token overlap with an existing artifact in a sibling subtree, reject or return an advisory with instructions to elevate the existing tag rather than creating a duplicate.
* **Ambient Context in `task_context`:**
  If an active task is running in a scope that inherits an over-scoped rule with zero citations in that subtree, emit a soft diagnostic hint to the agent:
  > *"Note: RULE-38 is currently scoped at `src`, but has zero citations in `src/interfaces`. It may be a candidate for least-scope relocation to `src/core` via `modie scope audit`."*

### 3. CI / Verification Pipeline

Add an optional check to `bun run verify`:
```bash
bun run verify scope
```
Flags whenever mature rules (e.g. $> 5$ citations) have drifted into becoming over-scoped root polluters or under-scoped authority violators.

---

## Resolved Decisions & Follow-up Sparks

1. **Intermediate `.modie` Containers & Scaffolding:**
   - *Resolution:* Scope artifacts in whatever directory represents their true mathematical Deepest Common Ancestor, independent of what `.modie` scaffolding currently exists. If the target directory lacks `.modie/MOTIVE.md`, scaffold a skeleton motive.
   - *Follow-up Spark (Pruning Empty `.modie` Containers):* If moving or completing artifacts leaves behind a file-less, empty `.modie/` directory (no rules, no adrs, no tasks, no motive), clean it up to prevent repository clutter (captured for a future `modie cleanup` capability).

2. **Minimum Citation Maturity Threshold:**
   - *Resolution:* A brand-new rule created during a task might only have 1 test citation in `src/core/domain/foo.test.ts`. Moving it immediately to `src/core/domain` is premature if upcoming tasks in `src/core/engine` plan to cite it. Require a minimum threshold (e.g. at least 3 distinct citations across multiple files, or an explicit `--force` flag) before flagging an artifact as `OVER_SCOPED`.

3. **Cross-Branch Merging & Git Hygiene:**
   - *Resolution:* Because Modie task branches are ephemeral and short-lived (ADR-6, RULE-21), relocation audits are recommended to run on the trunk branch between feature tasks rather than in the middle of active feature branches, avoiding merge churn.