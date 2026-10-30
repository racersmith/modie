/**
 * Unit tests for FixtureWorkspace helper methods and scopeDir resolution.
 * Tagged per ADR-7, RULE-23, and RULE-34 for universal rule verification.
 * @verifies RULE-8, RULE-12, RULE-23, RULE-34, RULE-35, ADR-10
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createFixtureWorkspace, type FixtureWorkspace } from "./fixture-workspace.ts";

describe("FixtureWorkspace - Architectural scopeDir Resolution (RULE-8, RULE-12, RULE-34, ADR-10)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("fixture-scopedir-test-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-8, RULE-12, RULE-34, ADR-10
  it("[RULE-8][RULE-12][RULE-34][ADR-10] should place rules in nested scope when scopeDir is provided", async () => {
    const rule = await workspace.createRule({
      id: 1,
      slug: "scoped-rule",
      title: "Scoped Rule",
      scopeDir: "src/interfaces/cli",
    });

    expect(rule.relativePath).toBe(
      "src/interfaces/cli/.modie/rules/scoped-rule.RULE-1.md",
    );
    expect(await workspace.fileExists(rule)).toBe(true);
  });

  // @verifies RULE-8, RULE-12, RULE-34, ADR-10
  it("[RULE-8][RULE-12][RULE-34][ADR-10] should place ADRs in nested scope when scopeDir is provided", async () => {
    const adr = await workspace.createAdr({
      id: 1,
      slug: "scoped-decision",
      title: "Scoped Decision",
      scopeDir: "src/core",
    });

    expect(adr.relativePath).toBe(
      "src/core/.modie/adrs/scoped-decision.ADR-1.md",
    );
    expect(await workspace.fileExists(adr)).toBe(true);
  });

  // @verifies RULE-8, RULE-12, RULE-34, ADR-10
  it("[RULE-8][RULE-12][RULE-34][ADR-10] should place tasks in nested scope when scopeDir is provided", async () => {
    const task = await workspace.createTask({
      id: 1,
      slug: "scoped-task",
      title: "Scoped Task",
      scopeDir: "src/interfaces/mcp",
    });

    expect(task.relativePath).toBe(
      "src/interfaces/mcp/.modie/tasks/scoped-task.TASK-1.md",
    );
    expect(await workspace.fileExists(task)).toBe(true);
  });

  // @verifies RULE-8, RULE-12, RULE-34, ADR-10
  it("[RULE-8][RULE-12][RULE-34][ADR-10] should support createArtifact directly with scopeDir", async () => {
    const artifact = await workspace.createArtifact({
      subtype: "RULE",
      id: 99,
      slug: "generic-artifact-scoped",
      scopeDir: "packages/shared",
    });

    expect(artifact.relativePath).toBe(
      "packages/shared/.modie/rules/generic-artifact-scoped.RULE-99.md",
    );
    expect(await workspace.fileExists(artifact)).toBe(true);
  });

  // @verifies RULE-8, RULE-34
  it("[RULE-8][RULE-34] should prioritize subDir override over scopeDir in createArtifact for low-level escape hatch", async () => {
    const rule = await workspace.createArtifact({
      subtype: "RULE",
      id: 2,
      slug: "override-rule",
      scopeDir: "src/interfaces",
      subDir: "custom/legacy/rules",
    });

    expect(rule.relativePath).toBe(
      "custom/legacy/rules/override-rule.RULE-2.md",
    );
    expect(await workspace.fileExists(rule)).toBe(true);
  });

  // @verifies RULE-8, RULE-34, ADR-10
  it("[RULE-8][RULE-34][ADR-10] should default to root .modie/<subtype> when neither scopeDir nor subDir is provided", async () => {
    const rule = await workspace.createRule({
      id: 3,
      slug: "root-rule",
      title: "Root Rule",
    });
    const adr = await workspace.createAdr({
      id: 3,
      slug: "root-decision",
      title: "Root Decision",
    });
    const task = await workspace.createTask({
      id: 3,
      slug: "root-task",
      title: "Root Task",
    });

    expect(rule.relativePath).toBe(".modie/rules/root-rule.RULE-3.md");
    expect(adr.relativePath).toBe(".modie/adrs/root-decision.ADR-3.md");
    expect(task.relativePath).toBe(".modie/tasks/root-task.TASK-3.md");
    expect(await workspace.fileExists(rule)).toBe(true);
    expect(await workspace.fileExists(adr)).toBe(true);
    expect(await workspace.fileExists(task)).toBe(true);
  });
});

