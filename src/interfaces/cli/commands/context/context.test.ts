/**
 * CLI integration tests for `modie context`.
 * Verifies RULE-2, RULE-6, RULE-8, RULE-9, RULE-20, RULE-25, RULE-26, RULE-27, RULE-34, RULE-35, ADR-8, and ADR-10.
 */

import { describe, expect, it } from "bun:test";
import { captureCli, createTestWorkspace, makeTestTag } from "../../test-utils.ts";

describe("CLI Command: modie context (RULE-2, RULE-6, RULE-9, RULE-20, RULE-25, RULE-26, RULE-27, RULE-34, ADR-8)", () => {
  // @verifies RULE-27
  it("[RULE-27] should emit context command help to stderr with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "context",
      "--help",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain(
      "Usage: modie context [target-or-identifier] [options]",
    );
    expect(stderr).toContain("--raw");
    expect(stderr).toContain("--json");
  });

  // @verifies RULE-2, RULE-9, RULE-20, RULE-25, RULE-26, RULE-27, RULE-34, RULE-35, ADR-8
  it("[RULE-2][RULE-9][RULE-20][RULE-25][RULE-26][RULE-27][RULE-34][RULE-35][ADR-8] should support default stderr summary, --raw markdown on stdout, and --json payload on stdout", async () => {
    const workspace = await createTestWorkspace("modie-cli-context-");
    const ruleTag = makeTestTag("RULE", 1);
    const adrTag = makeTestTag("ADR", 1);
    const taskTag = makeTestTag("TASK", 1);

    try {
      await workspace.createMotive({
        content: "Root governance engine motive.",
      });
      await workspace.createMotive({
        scopeDir: "src/core",
        content: "Core domain logic motive.",
      });
      await workspace.createAdr({
        id: 1,
        slug: "progressive-context-summary",
        summary: "Deliver concise ADR summaries in context compilation.",
        links: [],
      });
      await workspace.createRule({
        id: 1,
        slug: "upward-context-rule",
        scopeDir: "src/core",
        body: "Traverse upward from target scope to root.",
        links: [adrTag],
      });
      await workspace.createGist({
        scopeDir: "src/core",
        content: "Core domain directory summary.",
      });
      await workspace.createGist({
        scopeDir: "src/core/gist",
        content: "Child GIST signpost summary.",
      });
      await workspace.createTask({
        id: 1,
        slug: "compile-core-context",
        scopeDir: "src/core",
        context: "Synthesize context for core scope.",
        criteria: ["Verify compilation"],
        links: [ruleTag, adrTag],
      });

      // 1. Default human-readable mode: emits to stderr, stdout is empty (RULE-27)
      const humanRes = await workspace.captureCli(["context", "src/core"]);
      expect(humanRes.exitCode).toBe(0);
      expect(humanRes.stdout).toBe("");
      expect(humanRes.stderr).toContain("Context Compilation: src/core");
      expect(humanRes.stderr).toContain("Governing Scope:     src/core");
      expect(humanRes.stderr).toContain("Core domain logic motive.");
      expect(humanRes.stderr).toContain("Root governance engine motive.");
      expect(humanRes.stderr).toContain(ruleTag);
      expect(humanRes.stderr).toContain(
        "Deliver concise ADR summaries in context compilation.",
      );
      expect(humanRes.stderr).toContain("Core domain directory summary.");
      expect(humanRes.stderr).toContain("src/core/gist");

      // 2. --raw mode: emits synthesized Markdown document to stdout, stderr is empty (RULE-27)
      const rawRes = await workspace.captureCli([
        "context",
        taskTag,
        "--raw",
      ]);
      expect(rawRes.exitCode).toBe(0);
      expect(rawRes.stderr).toBe("");
      expect(rawRes.stdout).toContain(`# Architectural Context: ${taskTag}`);
      expect(rawRes.stdout).toContain("## Task Specification");
      expect(rawRes.stdout).toContain("Synthesize context for core scope.");
      expect(rawRes.stdout).toContain("## Upward Motives");
      expect(rawRes.stdout).toContain("## Governing Rules");
      expect(rawRes.stdout).toContain("## Architectural Decisions (ADR Summaries)");
      expect(rawRes.stdout).toContain("## Local GISTs (`src/core`)");
      expect(rawRes.stdout).toContain("## Child Signposts");

      // 3. --json mode: emits structured JSON to stdout, stderr is empty (RULE-26, RULE-27)
      const jsonRes = await workspace.captureCli([
        "context",
        taskTag,
        "--json",
      ]);
      expect(jsonRes.exitCode).toBe(0);
      expect(jsonRes.stderr).toBe("");
      const parsed = JSON.parse(jsonRes.stdout);
      expect(parsed.type).toBe("task");
      expect(parsed.scope).toBe("src/core");
      expect(parsed.task.tag).toBe(taskTag);
      expect(parsed.task.blastRadius.scope).toBe("src/core");
      expect(parsed.motives).toHaveLength(2);
      expect(parsed.rules).toHaveLength(1);
      expect(parsed.adrs).toHaveLength(1);
      expect(parsed.adrs[0].summary).toBe(
        "Deliver concise ADR summaries in context compilation.",
      );
      expect(parsed.gists.directoryGist.content).toBe(
        "Core domain directory summary.",
      );
      expect(parsed.signposts).toHaveLength(1);
      expect(parsed.signposts[0].childScope).toBe("src/core/gist");
    } finally {
      await workspace.cleanup();
    }
  });
});

