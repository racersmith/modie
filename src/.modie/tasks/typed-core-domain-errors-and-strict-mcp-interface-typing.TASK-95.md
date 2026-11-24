---
summary: Replace regex-based MCP error classification with typed core domain error codes, remove loose any casts in MCP registration/authoring, and eliminate minor interface duplication.

depends_on: []

links:
  - RULE-6
  - RULE-22
  - RULE-34
  - RULE-35
---

# Context

Three related type-safety and maintainability improvements surfaced during recent MCP and lifecycle refactoring:

1. **Replace regex-based MCP error classification with typed core domain errors**:
   `src/interfaces/mcp/errors.ts` (`toMcpErrorPayload`) currently classifies caught errors into `CRITERIA_INCOMPLETE`, `ANCESTRY_VIOLATION`, `BLAST_RADIUS_BREACH`, `ARTIFACT_NOT_FOUND`, and `INVALID_PARAMETER` via 5 regexes on `error.message`, even though `src/core/engine/lifecycle/errors.ts` already defines typed domain error classes (`TaskIncompleteError`, `ActiveSubtaskPendingError`, `ArtifactCollisionError`, `ForeignBranchAncestryError`). Any rewording of a core error string risks silently regressing MCP self-recovery envelopes to `EXECUTION_FAILED`. Introduce typed core error classes or a canonical domain error code contract across core services (criteria completion, spatial ancestry/scope linking, blast radius breach, artifact not found, invalid parameter) and update `toMcpErrorPayload` to match structurally (`instanceof` / typed `code`) first, retaining regex fallback only for unclassified/external errors.

2. **Remove loose `any` casts in MCP server & authoring handlers**:
   - In `src/interfaces/mcp/server.ts`, `registerMarkdownTool` and `registerStructuredTool` currently type `inputSchema`, `outputSchema`, and handler parameters as `Record<string, any>` / `any` and cast callbacks `as any`. Tighten the wrapper generics (e.g. keyed off Zod object schemas `z.ZodObject<T>`) so schema shapes and handler input types are checked at compile time.
   - In `src/interfaces/mcp/handlers/authoring.ts`, `(res as any).artifact ?? {}` works around an un-narrowed `CreateArtifactResult` type; narrow or type the return contract cleanly.

3. **Targeted interface deduplication (`bun run check:duplication`)**:
   - Consolidate repeated execution/rendering logic shared between `src/interfaces/cli/commands/link/link.ts` and `src/interfaces/cli/commands/link/unlink.ts`.
   - Deduplicate repeated `Governing Rules` and `Child Directory Motives` rendering loops between `summary` and `detailed` branches in `src/interfaces/mcp/renderers/directory-context.ts`.
   - Share MCP stdio startup logic duplicated between `src/interfaces/mcp/bin.ts` and `src/interfaces/cli/commands/mcp/index.ts`.

Starting points:
- `src/core/engine/lifecycle/errors.ts`, `src/core/engine/linking/validator.ts`, `src/core/domain/task/scope.ts`, `src/core/engine/query/artifact-query.ts`
- `src/interfaces/mcp/errors.ts`, `src/interfaces/mcp/server.ts`, `src/interfaces/mcp/handlers/authoring.ts`, `src/interfaces/mcp/renderers/directory-context.ts`
- `src/interfaces/cli/commands/link/link.ts`, `unlink.ts`, `src/interfaces/cli/commands/mcp/index.ts`, `src/interfaces/mcp/bin.ts`

# Acceptance Criteria

- [ ] Core domain and engine validation failures expose typed error classes or canonical error codes covering criteria completion, spatial ancestry, blast radius, artifact lookup, and parameter validation
- [ ] MCP error translation classifies typed core errors structurally without depending on fragile error message wording while preserving model-recoverable error envelopes
- [ ] MCP server tool registration wrappers and artifact authoring handlers enforce compile-time type compatibility between schemas and handlers without loose any casts
- [ ] Duplicated logic across CLI link/unlink commands, MCP stdio startup entrypoints, and directory context rendering is consolidated into shared helpers, with all repository verification checks passing
- [ ] User Review
