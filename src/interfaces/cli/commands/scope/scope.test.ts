/**
 * Integration and unit tests for `modie scope`.
 * Validates TASK-51, RULE-6, RULE-8, RULE-9, RULE-12, RULE-25, RULE-27, RULE-34, and RULE-35.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createTestWorkspace,
  makeTestTag,
  type TestWorkspace,
} from "../../test-utils.ts";

describe("CLI Scope - Execution & Stream Separation (RULE-6, RULE-8, RULE-9, RULE-12, RULE-25, RULE-27, RULE-34, RULE-35)", () => {
  let workspace: TestWorkspace;

  beforeEach(async () => {
    workspace = await createTestWorkspace("modie-cli-scope-");

    // Root scope setup
    await workspace.mkdir(".modie");
    await workspace.createRule({
      id: "TEST-1",
      title: "Root Architecture Invariant",
      subDir: ".modie/rules",
    });

    // src/interfaces/cli scope setup
    await workspace.mkdir("src/interfaces/cli/.modie");
    await workspace.createRule({
      id: "TEST-2",
      title: "CLI Stream Separation Rule",
      subDir: "src/interfaces/cli/.modie/rules",
    });
    await workspace.createTask({
      id: "TEST-1",
      title: "CLI Scope Verification Task",
      subDir: "src/interfaces/cli/.modie/tasks",
    });
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-27
  it("[RULE-27] should emit scope help to stderr with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "scope",
      "--help",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Usage: modie scope");
    expect(stderr).toContain("Resolve architectural scope boundaries");
  });

  // @verifies RULE-8, RULE-25, RULE-27
  it("[RULE-8][RULE-25][RULE-27] should default to root scope when target is omitted", async () => {
    const { exitCode, stdout, stderr } = await workspace.captureCli(["scope"]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Scope Resolution: .");
    expect(stderr).toContain("Governing Scope:  .");
    expect(stderr).toContain("Enclosing .modie: .modie");
  });

  // @verifies RULE-6, RULE-8, RULE-9, RULE-12, RULE-25, RULE-27
  it("[RULE-6][RULE-8][RULE-9][RULE-12][RULE-25][RULE-27] should emit human-readable scope summary to stderr for deep file path", async () => {
    await workspace.writeFile(
      "src/interfaces/cli/commands/scope/scope.ts",
      "export const scope = 1;",
    );

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "scope",
      "src/interfaces/cli/commands/scope/scope.ts",
    ]);
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

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "scope",
      "src/interfaces/cli/commands/scope/scope.ts",
      "--json",
    ]);
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

  // @verifies RULE-8, RULE-9, RULE-12, RULE-25, RULE-27
  it("[RULE-8][RULE-9][RULE-12][RULE-25][RULE-27] should resolve artifact tag bidirectionally", async () => {
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "scope",
      "RULE-TEST-2",
      "--json",
    ]);
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
    const { stdout, stderr } = await workspace.execBin(["scope", "--json"]);
    expect(stderr).toBe("");

    const payload = JSON.parse(stdout.trim());
    expect(payload.scope).toBe(".");
    expect(payload.enclosingModieDir).toBe(".modie");
  });

  it("should report error to stderr when path is outside workspace root", async () => {
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "scope",
      "../outside",
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("path must reside within the workspace root");
  });
});
