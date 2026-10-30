/**
 * Tests for bidirectional scope resolution and architectural governance query service.
 * Complies with RULE-6, RULE-8, RULE-9, RULE-12, RULE-25, and ADR-10.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createFixtureWorkspace,
  makeTestTag,
  type FixtureWorkspace,
} from "../testing/index.ts";
import { resolveScope } from "./scope.ts";

describe("Core Scope Resolution Service (RULE-6, RULE-8, RULE-9, RULE-12, RULE-25, ADR-10)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-scope-test-");

    // Root scope setup
    await workspace.mkdir(".modie");
    await workspace.createRule({
      id: 1,
      title: "Root Architecture Invariant",
      subDir: ".modie/rules",
    });

    // src scope setup
    await workspace.mkdir("src/.modie");
    await workspace.createRule({
      id: 2,
      title: "Source Layer Policy",
      subDir: "src/.modie/rules",
    });

    // src/interfaces scope setup
    await workspace.mkdir("src/interfaces/.modie");
    await workspace.createRule({
      id: 3,
      title: "Interface Decoupling Rule",
      subDir: "src/interfaces/.modie/rules",
    });

    // src/interfaces/cli scope setup with rule and task
    await workspace.mkdir("src/interfaces/cli/.modie");
    await workspace.createRule({
      id: 4,
      title: "CLI Stream Separation Rule",
      subDir: "src/interfaces/cli/.modie/rules",
    });
    await workspace.createTask({
      id: 1,
      title: "CLI Command Polish Task",
      subDir: "src/interfaces/cli/.modie/tasks",
    });
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-8, RULE-9, RULE-12
  it("[RULE-8][RULE-9][RULE-12] should resolve root workspace directory and root files", async () => {
    const cwd = workspace.cwd;

    // 1. Root scope directory "."
    const rootScope = await resolveScope(".", { cwd });
    expect(rootScope.type).toBe("path");
    expect(rootScope.targetPath).toBe(".");
    expect(rootScope.scope).toBe(".");
    expect(rootScope.scopeDir).toBe(workspace.resolve("."));
    expect(rootScope.enclosingModieDir).toBe(".modie");
    expect(rootScope.ancestralScopes).toEqual(["."]);
    expect(rootScope.rules.length).toBe(1);
    expect(rootScope.rules[0]?.title).toBe("root architecture invariant");

    // 2. Arbitrary file at root
    await workspace.writeFile("package.json", "{}");
    const packageScope = await resolveScope("package.json", { cwd });
    expect(packageScope.type).toBe("path");
    expect(packageScope.targetPath).toBe("package.json");
    expect(packageScope.scope).toBe(".");
    expect(packageScope.enclosingModieDir).toBe(".modie");
  });

  // @verifies RULE-8, RULE-9, RULE-12
  it("[RULE-8][RULE-9][RULE-12] should resolve intermediate nested scopes with ancestral rule chains", async () => {
    const cwd = workspace.cwd;

    const ifaceScope = await resolveScope("src/interfaces", { cwd });
    expect(ifaceScope.type).toBe("path");
    expect(ifaceScope.targetPath).toBe("src/interfaces");
    expect(ifaceScope.scope).toBe("src/interfaces");
    expect(ifaceScope.enclosingModieDir).toBe("src/interfaces/.modie");

    // Ancestral scopes: root -> src -> src/interfaces
    expect(ifaceScope.ancestralScopes).toEqual([
      ".",
      "src",
      "src/interfaces",
    ]);

    // Ancestral rule chain includes rules from root, src, and src/interfaces (RULE-9)
    expect(ifaceScope.rules.length).toBe(3);
    const ruleScopes = ifaceScope.rules.map((r) => r.scope);
    expect(ruleScopes).toContain(".");
    expect(ruleScopes).toContain("src");
    expect(ruleScopes).toContain("src/interfaces");

    // Ancestral rule chains grouping
    expect(ifaceScope.ancestralRuleChains.length).toBe(3);
    const rootChain = ifaceScope.ancestralRuleChains.find((c) => c.scope === ".");
    expect(rootChain?.rules.length).toBe(1);
    expect(rootChain?.rules[0]?.title).toBe("root architecture invariant");
  });

  // @verifies RULE-6, RULE-8, RULE-9, RULE-12
  it("[RULE-6][RULE-8][RULE-9][RULE-12] should resolve deep source path without its own .modie container", async () => {
    const cwd = workspace.cwd;

    // Create deep source file
    await workspace.writeFile(
      "src/interfaces/cli/commands/read/read.ts",
      "export const execute = () => {};",
    );

    const deepScope = await resolveScope(
      "src/interfaces/cli/commands/read/read.ts",
      { cwd },
    );
    expect(deepScope.type).toBe("path");
    expect(deepScope.targetPath).toBe(
      "src/interfaces/cli/commands/read/read.ts",
    );
    expect(deepScope.scope).toBe("src/interfaces/cli");
    expect(deepScope.scopeDir).toBe(
      workspace.resolve("src/interfaces/cli"),
    );
    expect(deepScope.enclosingModieDir).toBe("src/interfaces/cli/.modie");

    // Ancestral scopes: . -> src -> src/interfaces -> src/interfaces/cli
    expect(deepScope.ancestralScopes).toEqual([
      ".",
      "src",
      "src/interfaces",
      "src/interfaces/cli",
    ]);

    // Collects all 4 rules along the upward ancestry vector (RULE-9)
    expect(deepScope.rules.length).toBe(4);

    // Active tasks scoped to src/interfaces/cli
    expect(deepScope.tasks.length).toBe(1);
    expect(deepScope.tasks[0]?.title).toBe("cli command polish task");
    expect(deepScope.tasks[0]?.scope).toBe("src/interfaces/cli");
  });

  // @verifies RULE-8, RULE-9, RULE-12, RULE-25
  it("[RULE-8][RULE-9][RULE-12][RULE-25] should resolve artifact identifiers bidirectionally by tag, filename, and slug", async () => {
    const cwd = workspace.cwd;

    // 1. By canonical tag
    const ruleScope = await resolveScope("RULE-3", { cwd });
    expect(ruleScope.type).toBe("artifact");
    expect(ruleScope.artifact).toBeDefined();
    expect(ruleScope.artifact?.tag).toBe("RULE-3");
    expect(ruleScope.scope).toBe("src/interfaces");
    expect(ruleScope.enclosingModieDir).toBe("src/interfaces/.modie");
    expect(ruleScope.targetPath).toContain(".modie/rules/");
    expect(ruleScope.ancestralScopes).toEqual([
      ".",
      "src",
      "src/interfaces",
    ]);

    // 2. By slug
    const slugScope = await resolveScope("cli-stream-separation-rule", { cwd });
    expect(slugScope.type).toBe("artifact");
    expect(slugScope.artifact?.tag).toBe("RULE-4");
    expect(slugScope.scope).toBe("src/interfaces/cli");

    // 3. By task tag
    const taskScope = await resolveScope("TASK-1", { cwd });
    expect(taskScope.type).toBe("artifact");
    expect(taskScope.artifact?.tag).toBe("TASK-1");
    expect(taskScope.scope).toBe("src/interfaces/cli");
    expect(taskScope.tasks.length).toBe(1);
    expect(taskScope.tasks[0]?.tag).toBe("TASK-1");
  });

  it("should reject paths outside the workspace root", async () => {
    const cwd = workspace.cwd;

    await expect(
      resolveScope("../outside-repo", { cwd }),
    ).rejects.toThrow(/path must reside within the workspace root/);
  });

  it("should reject empty target identifier", async () => {
    const cwd = workspace.cwd;

    await expect(resolveScope("", { cwd })).rejects.toThrow(
      /Target path or artifact identifier is required/,
    );
  });
});
