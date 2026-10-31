/**
 * Unit and integration tests for Unified Architectural Context Compilation.
 * Verifies RULE-2, RULE-6, RULE-8, RULE-9, RULE-12, RULE-20, RULE-25, RULE-26, RULE-34, RULE-35, ADR-4, ADR-8, and ADR-10.
 */

import { describe, expect, it } from "bun:test";
import {
  compileContext,
  formatCompiledContextMarkdown,
} from "./context.ts";
import {
  createFixtureWorkspace,
  makeTestTag,
} from "../testing/fixture-workspace.ts";

describe("Core Context Compilation Service (RULE-2, RULE-6, RULE-8, RULE-9, RULE-12, RULE-20, ADR-4, ADR-8, ADR-10)", () => {
  // @verifies RULE-2, RULE-9, RULE-12, RULE-20, ADR-4, ADR-8, ADR-10, RULE-34, RULE-35
  it("[RULE-2][RULE-9][RULE-12][RULE-20][ADR-4][ADR-8][ADR-10][RULE-34][RULE-35] should compile context across root, intermediate, and leaf scopes without sibling or ancestor GIST pollution", async () => {
    await using workspace = await createFixtureWorkspace(
      "modie-context-hierarchy-",
    );

    const rootRuleTag = makeTestTag("RULE", 1);
    const coreRuleTag = makeTestTag("RULE", 2);
    const leafRuleTag = makeTestTag("RULE", 3);
    const siblingRuleTag = makeTestTag("RULE", 4);
    const rootAdrTag = makeTestTag("ADR", 1);
    const coreAdrTag = makeTestTag("ADR", 2);
    const siblingAdrTag = makeTestTag("ADR", 3);

    // 1. Motives at root (.), intermediate (src/core), leaf (src/core/gist), and sibling (src/interfaces)
    await workspace.createMotive({
      content: "Root workspace purpose and trajectory.",
    });
    await workspace.createMotive({
      scopeDir: "src/core",
      content: "Core domain evaluation engine purpose.",
    });
    await workspace.createMotive({
      scopeDir: "src/core/gist",
      content: "Leaf GIST discovery and signpost purpose.",
    });
    await workspace.createMotive({
      scopeDir: "src/interfaces",
      content: "Sibling interfaces transport adaptation purpose.",
    });

    // 2. ADRs with concise summaries
    await workspace.createAdr({
      id: 1,
      slug: "root-containment-decision",
      summary: "Encapsulate all governance metadata inside .modie containers.",
      context: "Detailed root ADR context that should not bloat summaries.",
      decision: "Use .modie directory.",
    });
    await workspace.createAdr({
      id: 2,
      slug: "core-signpost-decision",
      scopeDir: "src/core",
      summary: "Use shallow child GIST signposts for progressive disclosure.",
      context: "Detailed core ADR context.",
      decision: "Discover 1-level child signposts.",
    });
    await workspace.createAdr({
      id: 3,
      slug: "sibling-interface-decision",
      scopeDir: "src/interfaces",
      summary: "Sibling ADR summary that must not leak into core.",
    });

    // 3. Rules across scopes
    await workspace.createRule({
      id: 1,
      slug: "root-invariant",
      body: "All artifacts must reside at least scope.",
      links: [rootAdrTag],
    });
    await workspace.createRule({
      id: 2,
      slug: "core-decoupling-invariant",
      scopeDir: "src/core",
      body: "Core services must not import interface adapters.",
      links: [coreAdrTag],
    });
    await workspace.createRule({
      id: 3,
      slug: "gist-naming-invariant",
      scopeDir: "src/core/gist",
      body: "File GISTs must use <filename>.GIST.md suffix.",
    });
    await workspace.createRule({
      id: 4,
      slug: "sibling-cli-invariant",
      scopeDir: "src/interfaces",
      body: "CLI must separate stdout and stderr.",
      links: [siblingAdrTag],
    });

    // 4. GISTs at root, intermediate (src/core), leaf (src/core/gist), and sibling (src/interfaces)
    await workspace.createGist({
      content: "Root workspace directory summary.",
    });
    await workspace.createGist({
      scopeDir: "src",
      content: "Source root directory summary.",
    });
    await workspace.createGist({
      scopeDir: "src/core",
      content: "Core domain services summary.",
    });
    await workspace.createGist({
      scopeDir: "src/core",
      filename: "index.ts",
      content: "Public core barrel exports.",
    });
    await workspace.createGist({
      scopeDir: "src/core/gist",
      content: "GIST reader and signpost discovery module.",
    });
    await workspace.createGist({
      scopeDir: "src/core/gist",
      filename: "reader.ts",
      content: "Reads directory/file GISTs and discovers child signposts.",
    });
    await workspace.createGist({
      scopeDir: "src/core/motive",
      content: "Motive creation and upward ancestry reader module.",
    });
    await workspace.createGist({
      scopeDir: "src/interfaces",
      content: "CLI and MCP transport interfaces.",
    });

    // --- A. Verify ROOT scope (.) ---
    const rootCtx = await compileContext(".", { cwd: workspace.cwd });
    expect(rootCtx.type).toBe("path");
    expect(rootCtx.scope).toBe(".");
    expect(rootCtx.ancestralScopes).toEqual(["."]);
    expect(rootCtx.motives.map((m) => m.scope)).toEqual(["."]);
    expect(rootCtx.rules.map((r) => r.tag)).toEqual([rootRuleTag]);
    expect(rootCtx.adrs.map((a) => a.tag)).toEqual([rootAdrTag]);
    expect(rootCtx.adrs[0]?.summary).toBe(
      "Encapsulate all governance metadata inside .modie containers.",
    );
    expect(rootCtx.gists.directoryGist?.content).toBe(
      "Root workspace directory summary.",
    );
    expect(rootCtx.gists.fileGists).toEqual([]);
    // Immediate child of "." is "src" (which has src/.modie/gists/GIST.md)
    expect(rootCtx.signposts.map((s) => s.childScope)).toEqual(["src"]);

    // --- B. Verify INTERMEDIATE scope (src/core) ---
    const coreCtx = await compileContext("src/core", { cwd: workspace.cwd });
    expect(coreCtx.scope).toBe("src/core");
    expect(coreCtx.ancestralScopes).toEqual([".", "src", "src/core"]);
    // Upward motives: src/core -> . (no motive in src, sibling src/interfaces excluded)
    expect(coreCtx.motives.map((m) => m.scope)).toEqual(["src/core", "."]);
    expect(coreCtx.rules.map((r) => r.tag)).toEqual([rootRuleTag, coreRuleTag]);
    expect(coreCtx.rules[1]?.body).toBe(
      "Core services must not import interface adapters.",
    );
    expect(coreCtx.adrs.map((a) => a.tag)).toEqual([rootAdrTag, coreAdrTag]);
    // Local GISTs strictly at src/core (never root or src GISTs per RULE-9)
    expect(coreCtx.gists.directoryGist?.content).toBe(
      "Core domain services summary.",
    );
    expect(coreCtx.gists.fileGists.map((f) => f.sourceFilename)).toEqual([
      "index.ts",
    ]);
    // Shallow downward signposts for immediate children of src/core
    expect(coreCtx.signposts.map((s) => s.childScope)).toEqual([
      "src/core/gist",
      "src/core/motive",
    ]);

    // --- C. Verify LEAF scope (src/core/gist) ---
    const leafCtx = await compileContext("src/core/gist", {
      cwd: workspace.cwd,
    });
    expect(leafCtx.scope).toBe("src/core/gist");
    expect(leafCtx.ancestralScopes).toEqual([
      ".",
      "src",
      "src/core",
      "src/core/gist",
    ]);
    expect(leafCtx.motives.map((m) => m.scope)).toEqual([
      "src/core/gist",
      "src/core",
      ".",
    ]);
    expect(leafCtx.rules.map((r) => r.tag)).toEqual([
      rootRuleTag,
      coreRuleTag,
      leafRuleTag,
    ]);
    expect(leafCtx.rules.map((r) => r.tag)).not.toContain(siblingRuleTag);
    expect(leafCtx.adrs.map((a) => a.tag)).toEqual([rootAdrTag, coreAdrTag]);
    expect(leafCtx.adrs.map((a) => a.tag)).not.toContain(siblingAdrTag);
    // Local GISTs strictly at src/core/gist (ancestor src/core index.ts GIST is omitted per RULE-9)
    expect(leafCtx.gists.directoryGist?.content).toBe(
      "GIST reader and signpost discovery module.",
    );
    expect(leafCtx.gists.fileGists.map((f) => f.sourceFilename)).toEqual([
      "reader.ts",
    ]);
    expect(leafCtx.signposts).toEqual([]);
  });

  // @verifies RULE-6, RULE-8, RULE-9, RULE-22, ADR-8, RULE-34, RULE-35
  it("[RULE-6][RULE-8][RULE-9][RULE-22][ADR-8][RULE-34][RULE-35] should incorporate task-scoped metadata, dependencies, acceptance criteria, and blast radius when given a task tag", async () => {
    await using workspace = await createFixtureWorkspace("modie-context-task-");

    const prereqTaskTag = makeTestTag("TASK", 10);
    const targetTaskTag = makeTestTag("TASK", 11);
    const ruleTag = makeTestTag("RULE", 10);
    const adrTag = makeTestTag("ADR", 10);

    await workspace.createMotive({
      scopeDir: "src/interfaces",
      content: "Provide decoupled CLI and MCP interfaces.",
    });

    await workspace.createAdr({
      id: 10,
      slug: "interface-transport-decision",
      scopeDir: "src/interfaces",
      summary: "Project declarative command schemas into CLI and MCP tools.",
    });

    await workspace.createRule({
      id: 10,
      slug: "interface-stream-separation",
      scopeDir: "src/interfaces",
      body: "Separate machine stdout from human stderr.",
      links: [adrTag],
    });

    await workspace.createTask({
      id: 10,
      slug: "prerequisite-interface-task",
      scopeDir: "src/interfaces",
      criteria: ["Complete prerequisite"],
    });

    await workspace.createTask({
      id: 11,
      slug: "implement-context-interface",
      scopeDir: "src/interfaces",
      context: "Expose unified context command across CLI and MCP.",
      depends_on: [prereqTaskTag],
      links: [ruleTag, adrTag],
      criteria: [
        { text: "Implement CLI command", completed: true },
        { text: "Register MCP tool", completed: false },
      ],
    });

    await workspace.createGist({
      scopeDir: "src/interfaces/cli",
      content: "CLI command dispatcher and subcommands.",
    });

    const ctx = await compileContext(targetTaskTag, { cwd: workspace.cwd });
    expect(ctx.type).toBe("task");
    expect(ctx.scope).toBe("src/interfaces");
    expect(ctx.task).toBeDefined();
    expect(ctx.task?.tag).toBe(targetTaskTag);
    expect(ctx.task?.readiness).toBe("BLOCKED");
    expect(ctx.task?.blockedBy).toEqual([prereqTaskTag]);
    expect(ctx.task?.depends_on).toEqual([prereqTaskTag]);
    expect(ctx.task?.links).toEqual([ruleTag, adrTag]);
    expect(ctx.task?.context).toBe(
      "Expose unified context command across CLI and MCP.",
    );
    expect(ctx.task?.criteriaProgress).toBe("1/2");
    expect(ctx.task?.incompleteCriteria).toEqual(["Register MCP tool"]);
    expect(ctx.task?.blastRadius.scope).toBe("src/interfaces");
    expect(ctx.task?.blastRadius.enclosingModieDir).toBe(
      "src/interfaces/.modie",
    );
    expect(ctx.task?.blastRadius.constraint).toContain("src/interfaces");

    // Verify surrounding scope governance and child signposts are compiled for the task's scope
    expect(ctx.motives.map((m) => m.scope)).toEqual(["src/interfaces"]);
    expect(ctx.rules.map((r) => r.tag)).toEqual([ruleTag]);
    expect(ctx.adrs.map((a) => a.tag)).toEqual([adrTag]);
    expect(ctx.signposts.map((s) => s.childScope)).toEqual([
      "src/interfaces/cli",
    ]);

    // Verify markdown rendering includes task, motives, rules, ADR summaries, and signposts
    const markdown = formatCompiledContextMarkdown(ctx);
    expect(markdown).toContain(`# Architectural Context: ${targetTaskTag}`);
    expect(markdown).toContain("## Task Specification");
    expect(markdown).toContain("- [x] Implement CLI command");
    expect(markdown).toContain("- [ ] Register MCP tool");
    expect(markdown).toContain(
      "Project declarative command schemas into CLI and MCP tools.",
    );
    expect(markdown).toContain("src/interfaces/cli");
  });
});

