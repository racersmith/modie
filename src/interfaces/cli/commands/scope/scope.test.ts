/**
 * Integration and unit tests for `modie scope`.
 * Validates TASK-51, RULE-6, RULE-8, RULE-12, RULE-25, RULE-27, RULE-34 and RULE-35.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createFixtureWorkspace, type FixtureWorkspace,
} from "../../../../core/platform/testing/index.ts";
import {
  captureCli, execBin,
} from "../../test-utils.ts";

describe("CLI Scope - Execution & Stream Separation (RULE-6, RULE-8, RULE-12, RULE-25, RULE-27, RULE-34, RULE-35)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-cli-scope-");

    // Root scope setup
    await workspace.createRule({
      id: "TEST-1",
      title: "Root Architecture Invariant",
    });

    // src/interfaces/cli scope setup
    await workspace.createRule({
      id: "TEST-2",
      title: "CLI Stream Separation Rule",
      scopeDir: "src/interfaces/cli",
    });
    await workspace.createTask({
      id: "TEST-1",
      title: "CLI Scope Verification Task",
      scopeDir: "src/interfaces/cli",
    });
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-27
  it("[RULE-27] should emit scope help to stderr with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "scope",
      "--help",
    ], workspace.cwd);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Usage: modie scope");
    expect(stderr).toContain("Resolve architectural scope boundaries");
  });

  // @verifies RULE-8, RULE-25, RULE-27
  it("[RULE-8][RULE-25][RULE-27] should default to root scope when target is omitted", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["scope"], workspace.cwd);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Scope Resolution: .");
    expect(stderr).toContain("Governing Scope:  .");
    expect(stderr).toContain("Enclosing .modie: .modie");
  });

  // @verifies RULE-6, RULE-8, RULE-12, RULE-25, RULE-27
  it("[RULE-6][RULE-8][RULE-12][RULE-25][RULE-27] should emit human-readable scope summary to stderr for deep file path", async () => {
    await workspace.writeFile(
      "src/interfaces/cli/commands/scope/scope.ts",
      "export const scope = 1;",
    );

    const { exitCode, stdout, stderr } = await captureCli([
      "scope",
      "src/interfaces/cli/commands/scope/scope.ts",
    ], workspace.cwd);
    expect(exitCode).toBe(0);
    // RULE-27: stdout must be empty
    expect(stdout).toBe("");
    // Stderr contains structured boundaries
    expect(stderr).toContain("Governing Scope:  src/interfaces/cli");
    expect(stderr).toContain("Enclosing .modie: src/interfaces/cli/.modie");
    expect(stderr).toContain("Ancestral Scopes: . -> src/interfaces/cli");
    expect(stderr).toContain("Ancestral Rule Chains:");
    expect(stderr).toContain("Active Tasks in Scope [src/interfaces/cli]:");
    expect(stderr).toContain("cli scope verification task");
  });

  // @verifies RULE-25, RULE-27, RULE-34, RULE-35
  it("[RULE-25][RULE-27][RULE-34][RULE-35] should emit machine JSON payload to stdout and empty stderr when --json is passed", async () => {
    await workspace.writeFile(
      "src/interfaces/cli/commands/scope/scope.ts",
      "export const scope = 1;",
    );

    const { exitCode, stdout, stderr } = await captureCli([
      "scope",
      "src/interfaces/cli/commands/scope/scope.ts",
      "--json",
    ], workspace.cwd);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");

    const payload = JSON.parse(stdout);
    expect(payload.type).toBe("path");
    expect(payload.targetPath).toBe(
      "src/interfaces/cli/commands/scope/scope.ts",
    );
    expect(payload.scope).toBe("src/interfaces/cli");
    expect(payload.enclosingModieDir).toBe("src/interfaces/cli/.modie");
    expect(payload.ancestralScopes).toEqual([".", "src/interfaces/cli"]);
    expect(payload.rules.length).toBe(2);
    expect(payload.tasks.length).toBe(1);
    expect(payload.tasks[0]?.tag).toBe("TASK-TEST-1");
  });

  // @verifies RULE-8, RULE-12, RULE-25, RULE-27
  it("[RULE-8][RULE-12][RULE-25][RULE-27] should resolve artifact tag bidirectionally", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "scope",
      "RULE-TEST-2",
      "--json",
    ], workspace.cwd);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");

    const payload = JSON.parse(stdout);
    expect(payload.type).toBe("artifact");
    expect(payload.artifact).toBeDefined();
    expect(payload.artifact?.tag).toBe("RULE-TEST-2");
    expect(payload.scope).toBe("src/interfaces/cli");
    expect(payload.enclosingModieDir).toBe("src/interfaces/cli/.modie");
    expect(payload.rules.length).toBe(2);
  });

  // @verifies RULE-25, RULE-27
  it("[RULE-25][RULE-27] should execute scope command via bin.ts subprocess", async () => {
    const { stdout, stderr } = await execBin(["scope", "--json"], workspace.cwd);
    expect(stderr).toBe("");

    const payload = JSON.parse(stdout.trim());
    expect(payload.scope).toBe(".");
    expect(payload.enclosingModieDir).toBe(".modie");
  });

  it("should report error to stderr when path is outside workspace root", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "scope",
      "../outside",
    ], workspace.cwd);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("path must reside within the workspace root");
  });

  // @verifies RULE-12, RULE-25, RULE-27, RULE-34, RULE-35
  it("[RULE-12][RULE-25][RULE-27][RULE-34][RULE-35] should execute scope audit and emit clean notice by default or table with --all", async () => {
    // 1. Clean workspace by default emits clean notice to stderr
    const cleanRes = await captureCli([
      "scope",
      "audit",
    ], workspace.cwd);

    expect(cleanRes.exitCode).toBe(0);
    expect(cleanRes.stdout).toBe("");
    expect(cleanRes.stderr).toContain("Artifact Scope Audit (Least Scope Placement - RULE-12):");
    expect(cleanRes.stderr).toContain("✓ All 2 governance artifacts are optimally scoped.");

    // 2. With --all, emits full inventory table including optimal artifacts
    const allRes = await captureCli([
      "scope",
      "audit",
      "--all",
    ], workspace.cwd);

    expect(allRes.exitCode).toBe(0);
    expect(allRes.stdout).toBe("");
    expect(allRes.stderr).toContain("Artifact Scope Audit (Least Scope Placement - RULE-12):");
    expect(allRes.stderr).toContain("TAG");
    expect(allRes.stderr).toContain("SUBTYPE");
    expect(allRes.stderr).toContain("RULE-TEST-1");
  });

  // @verifies RULE-12, RULE-25, RULE-27, RULE-34, RULE-35
  it("[RULE-12][RULE-25][RULE-27][RULE-34][RULE-35] should execute scope audit --json and emit machine JSON to stdout", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "scope",
      "audit",
      "--json",
    ], workspace.cwd);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");

    const payload = JSON.parse(stdout);
    expect(payload.totalAudited).toBeGreaterThan(0);
    expect(payload.suggestions).toBeDefined();
    expect(Array.isArray(payload.suggestions)).toBe(true);
  });

  // @verifies RULE-8, RULE-12, RULE-25, RULE-27, RULE-34, RULE-35
  it("[RULE-8][RULE-12][RULE-25][RULE-27][RULE-34][RULE-35] should execute scope audit --apply and automatically relocate over-scoped rules", async () => {
    // Write 3 citations inside src/core for a rule currently at root '.'
    await workspace.writeFile(
      "src/core/a.ts",
      "// @verifies RULE-TEST-1\nexport const a = 1;",
    );
    await workspace.writeFile(
      "src/core/b.ts",
      "// @verifies RULE-TEST-1\nexport const b = 2;",
    );
    await workspace.writeFile(
      "src/core/c.ts",
      "// @verifies RULE-TEST-1\nexport const c = 3;",
    );

    const { exitCode, stdout, stderr } = await captureCli([
      "scope",
      "audit",
      "RULE-TEST-1",
      "--apply",
    ], workspace.cwd);

    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Applied relocations");
    expect(stderr).toContain("RULE-TEST-1: . -> src/core");
  });

  // @verifies RULE-8, RULE-12, RULE-25, RULE-27, RULE-34, RULE-35
  it("[RULE-8][RULE-12][RULE-25][RULE-27][RULE-34][RULE-35] should execute scope move command to relocate an artifact", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "scope",
      "move",
      "RULE-TEST-2",
      "src",
    ], workspace.cwd);

    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Artifact Relocation Successful:");
    expect(stderr).toContain("Previous Scope:  src/interfaces/cli");
    expect(stderr).toContain("New Scope:       src");
  });

  // @verifies RULE-12, RULE-25, RULE-27, RULE-34, RULE-35
  it("[RULE-12][RULE-25][RULE-27][RULE-34][RULE-35] should report detailed external citations and dual resolution options for under-scoped rules", async () => {
    // Write an out-of-scope citation for RULE-TEST-2 (scoped to src/interfaces/cli) in src/core
    await workspace.writeFile(
      "src/core/stray.ts",
      "// @verifies RULE-TEST-2\nexport const stray = true;",
    );

    const { exitCode, stdout, stderr } = await captureCli([
      "scope",
      "audit",
      "RULE-TEST-2",
    ], workspace.cwd);

    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("UNDER_SCOPED");
    expect(stderr).toContain("Elevate to src or prune (1 ext)");
    expect(stderr).toContain("Under-Scoped Artifacts & External Citations:");
    expect(stderr).toContain("RULE-TEST-2 (RULE) [Current: src/interfaces/cli -> DCA: src]:");
    expect(stderr).toContain("Out-of-scope citations (1 file(s)):");
    expect(stderr).toContain("- src/core/stray.ts");
    expect(stderr).toContain("1. Elevate artifact: modie scope move RULE-TEST-2 src");
    expect(stderr).toContain("2. Prune foreign tags: remove or reword out-of-scope citations");
  });
});
