/**
 * Unit and integration tests for Unified Architectural Context Compilation.
 * Verifies RULE-2, RULE-6, RULE-8, RULE-9, RULE-12, RULE-25, RULE-26, RULE-34, and RULE-35.
 */

import { describe, expect, it } from "bun:test";
import {
  compileContext,
  formatCompiledContextMarkdown,
  resolveContextTarget,
} from "./context.ts";
import { buildAncestralScopes, formatArtifactTag } from "../../domain/index.ts";
import { computeAncestralScopes } from "./scope.ts";
import {
  createFixtureWorkspace,
} from "../../platform/testing/fixture-workspace.ts";

describe("Core Context Compilation Service (RULE-2, RULE-6, RULE-8, RULE-9, RULE-12)", () => {
  // @verifies RULE-2, RULE-9, RULE-12, RULE-34, RULE-35
  it("[RULE-2][RULE-9][RULE-12][RULE-34][RULE-35] should compile context across root, intermediate, and leaf scopes without sibling pollution and discover child motives", async () => {
    await using workspace = await createFixtureWorkspace(
      "modie-context-hierarchy-",
    );

    const rootRuleTag = formatArtifactTag("RULE", 1);
    const coreRuleTag = formatArtifactTag("RULE", 2);
    const leafRuleTag = formatArtifactTag("RULE", 3);
    const siblingRuleTag = formatArtifactTag("RULE", 4);
    const rootAdrTag = formatArtifactTag("ADR", 1);
    const coreAdrTag = formatArtifactTag("ADR", 2);
    const siblingAdrTag = formatArtifactTag("ADR", 3);

    // 1. Motives at root (.), src, intermediate (src/core), leaf (src/core/motive), and sibling (src/interfaces)
    await workspace.createMotive({
      content: "Root workspace purpose and trajectory.",
    });
    await workspace.createMotive({
      scopeDir: "src",
      content: "Source root directory purpose.",
    });
    await workspace.createMotive({
      scopeDir: "src/core",
      content: "Core domain evaluation engine purpose.",
    });
    await workspace.createMotive({
      scopeDir: "src/core/motive",
      content: "Leaf motive reader and discovery purpose.",
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
      slug: "core-motive-decision",
      scopeDir: "src/core",
      summary: "Use shallow child motives for progressive disclosure.",
      context: "Detailed core ADR context.",
      decision: "Discover 1-level child motives.",
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
      slug: "leaf-naming-invariant",
      scopeDir: "src/core/motive",
      body: "Motive reader must ignore dot directories.",
    });
    await workspace.createRule({
      id: 4,
      slug: "sibling-cli-invariant",
      scopeDir: "src/interfaces",
      body: "CLI must separate stdout and stderr.",
      links: [siblingAdrTag],
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
    // Immediate child of "." is "src" (which has src/.modie/MOTIVE.md)
    expect(rootCtx.childMotives.map((s) => s.childScope)).toEqual(["src"]);

    // --- B. Verify INTERMEDIATE scope (src/core) ---
    const coreCtx = await compileContext("src/core", { cwd: workspace.cwd });
    expect(coreCtx.scope).toBe("src/core");
    expect(coreCtx.ancestralScopes).toEqual([".", "src", "src/core"]);
    // Upward motives: src/core -> src -> . (sibling src/interfaces excluded)
    expect(coreCtx.motives.map((m) => m.scope)).toEqual([
      "src/core",
      "src",
      ".",
    ]);
    expect(coreCtx.rules.map((r) => r.tag)).toEqual([rootRuleTag, coreRuleTag]);
    expect(coreCtx.rules[1]?.body).toBe(
      "Core services must not import interface adapters.",
    );
    expect(coreCtx.adrs.map((a) => a.tag)).toEqual([rootAdrTag, coreAdrTag]);
    // Shallow downward child motives for immediate children of src/core
    expect(coreCtx.childMotives.map((s) => s.childScope)).toEqual([
      "src/core/motive",
    ]);

    // --- C. Verify LEAF scope (src/core/motive) ---
    const leafCtx = await compileContext("src/core/motive", {
      cwd: workspace.cwd,
    });
    expect(leafCtx.scope).toBe("src/core/motive");
    expect(leafCtx.ancestralScopes).toEqual([
      ".",
      "src",
      "src/core",
      "src/core/motive",
    ]);
    expect(leafCtx.motives.map((m) => m.scope)).toEqual([
      "src/core/motive",
      "src/core",
      "src",
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
    expect(leafCtx.childMotives).toEqual([]);
  });

  // @verifies RULE-6, RULE-8, RULE-9, RULE-22, RULE-34, RULE-35
  it("[RULE-6][RULE-8][RULE-9][RULE-22][RULE-34][RULE-35] should incorporate task-scoped metadata, dependencies, acceptance criteria, and blast radius when given a task tag", async () => {
    await using workspace = await createFixtureWorkspace("modie-context-task-");

    const prereqTaskTag = formatArtifactTag("TASK", 10);
    const targetTaskTag = formatArtifactTag("TASK", 11);
    const ruleTag = formatArtifactTag("RULE", 10);
    const adrTag = formatArtifactTag("ADR", 10);

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

    await workspace.createMotive({
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

    // Verify surrounding scope governance and child motives are compiled for the task's scope
    expect(ctx.motives.map((m) => m.scope)).toEqual(["src/interfaces"]);
    expect(ctx.rules.map((r) => r.tag)).toEqual([ruleTag]);
    expect(ctx.adrs.map((a) => a.tag)).toEqual([adrTag]);
    expect(ctx.childMotives.map((s) => s.childScope)).toEqual([
      "src/interfaces/cli",
    ]);

    // Verify markdown rendering includes task, motives, rules, ADR summaries, and child motives
    const markdown = formatCompiledContextMarkdown(ctx);
    expect(markdown).toContain(`# Architectural Context: ${targetTaskTag}`);
    expect(markdown).toContain("## Task Specification");
    expect(markdown).toContain("- [x] Implement CLI command");
    expect(markdown).toContain("- [ ] Register MCP tool");
    expect(markdown).toContain("## Child Motives");
    expect(markdown).toContain(
      "Project declarative command schemas into CLI and MCP tools.",
    );
    expect(markdown).toContain("src/interfaces/cli");
  });

  it("should resolve context targets across early-return candidates via resolveContextTarget", async () => {
    await using workspace = await createFixtureWorkspace("modie-target-cand-");

    await workspace.createRule({
      id: 1,
      slug: "root-rule",
      body: "Root rule body",
    });

    await workspace.createTask({
      id: 10,
      slug: "test-task",
      title: "Test Task Title",
      scopeDir: "src/core",
    });

    // 1. Explicit task tag
    const t1 = await resolveContextTarget("TASK-10", workspace.cwd);
    expect(t1.type).toBe("task");
    expect(t1.task?.id).toBe("10");
    expect(t1.scope).toBe("src/core");

    // 2. Explicit task filename
    const t2 = await resolveContextTarget(
      "test-task.TASK-10.md",
      workspace.cwd,
    );
    expect(t2.type).toBe("task");
    expect(t2.task?.id).toBe("10");

    // 3. Explicit artifact tag
    const t3 = await resolveContextTarget("RULE-1", workspace.cwd);
    expect(t3.type).toBe("artifact");
    expect(t3.scope).toBe(".");

    // 4. Bare numeric task ID
    const t4 = await resolveContextTarget("10", workspace.cwd);
    expect(t4.type).toBe("task");
    expect(t4.task?.id).toBe("10");

    // 5. Artifact slug
    const t5 = await resolveContextTarget("root-rule", workspace.cwd);
    expect(t5.type).toBe("artifact");
    expect(t5.scope).toBe(".");

    // 6. Existing directory path
    const t6 = await resolveContextTarget("src/core", workspace.cwd);
    expect(t6.type).toBe("path");
    expect(t6.scope).toBe("src/core");

    // 7. Root "."
    const t7 = await resolveContextTarget(".", workspace.cwd);
    expect(t7.type).toBe("path");
    expect(t7.scope).toBe(".");
  });

  it("should support pure ancestral scope traversal and scoped .modie filtering", async () => {
    await using workspace = await createFixtureWorkspace(
      "modie-ancestral-opts-",
    );

    await workspace.createMotive({
      scopeDir: "src/core/nested",
      content: "Nested motive",
    });

    // Pure string vector without disk I/O
    const all = buildAncestralScopes("src/core/nested");
    expect(all).toEqual([".", "src", "src/core", "src/core/nested"]);

    // Scoped governance filtering for .modie containers
    const filtered = computeAncestralScopes("src/core/nested", workspace.cwd);
    expect(filtered).toContain(".");
    expect(filtered).toContain("src/core/nested");
  });
});
