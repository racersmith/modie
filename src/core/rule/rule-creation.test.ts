/**
 * Unit tests for Core Rule Creation Service.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 * @verifies ADR-7, RULE-1, RULE-3, RULE-8, RULE-11, RULE-13, RULE-16, RULE-23, RULE-34
 */

import { describe, expect, it } from "bun:test";
import { createFixtureWorkspace, makeTestTag } from "../testing/index.ts";
import {
  createRule,
  resolveRuleDirectories,
  validateRuleAncestry,
} from "./index.ts";

describe("Rule Creation - Scope & Directory Resolution (RULE-8)", () => {
  // @verifies RULE-8
  it("[RULE-8] should resolve target container inside normalized scope", () => {
    const { normalizedScopeDir, targetDir } = resolveRuleDirectories(
      "src/interfaces",
      "/mock/root",
    );
    expect(normalizedScopeDir).toBe("/mock/root/src/interfaces");
    expect(targetDir).toBe("/mock/root/src/interfaces/.modie/rules");
  });

  // @verifies RULE-8
  it("[RULE-8] should strip .modie/rules container when already present in input", () => {
    const { normalizedScopeDir, targetDir } = resolveRuleDirectories(
      "src/interfaces/.modie/rules",
      "/mock/root",
    );
    expect(normalizedScopeDir).toBe("/mock/root/src/interfaces");
    expect(targetDir).toBe("/mock/root/src/interfaces/.modie/rules");
  });
});

describe("Rule Creation - Frontmatter Validation & Ancestry (RULE-13, RULE-16, RULE-34)", () => {
  // @verifies RULE-13
  it("[RULE-13] should reject non-ADR links with RULE-13 error", async () => {
    const ruleTag = makeTestTag("RULE", 1);
    const taskTag = makeTestTag("TASK", 10);

    await expect(
      validateRuleAncestry("/mock/dir", [ruleTag], process.cwd()),
    ).rejects.toThrow("RULE-13");
    await expect(
      validateRuleAncestry("/mock/dir", [taskTag], process.cwd()),
    ).rejects.toThrow("RULE-13");
  });

  // @verifies RULE-16, RULE-34
  it("[RULE-16][RULE-34] should succeed when referencing an ancestor ADR", async () => {
    const workspace = await createFixtureWorkspace("rule-ancestry-");
    const adr = await workspace.createAdr({
      id: 100,
      slug: "system-architecture",
      context: "System architecture ADR",
    });

    // Rule scoped in a sub-package (e.g. workspace.cwd/src/interfaces)
    const ruleScope = await workspace.mkdir("src/interfaces");

    // ADR is at workspace.cwd (root), Rule is at workspace.cwd/src/interfaces -> Root is ancestor of sub-package
    await expect(
      validateRuleAncestry(ruleScope, [adr.tag], workspace.cwd),
    ).resolves.toBeUndefined();

    await workspace.cleanup();
  });

  // @verifies RULE-16, RULE-34
  it("[RULE-16][RULE-34] should succeed when referencing an ADR in the same directory", async () => {
    const workspace = await createFixtureWorkspace("rule-same-dir-");
    const adr = await workspace.createAdr({
      id: 101,
      slug: "local-decision",
      context: "Local decision ADR",
    });

    // Rule scoped in workspace.cwd (same scope as ADR)
    await expect(
      validateRuleAncestry(workspace.cwd, [adr.tag], workspace.cwd),
    ).resolves.toBeUndefined();

    await workspace.cleanup();
  });

  // @verifies RULE-16, RULE-34
  it("[RULE-16][RULE-34] should reject referencing an ADR in a sibling directory", async () => {
    const workspace = await createFixtureWorkspace("rule-sibling-");

    const adr = await workspace.createAdr({
      id: 102,
      slug: "core-decision",
      context: "Core decision ADR",
      subDir: "src/core/.modie/adrs",
    });

    // Rule scoped in workspace.cwd/src/interfaces
    const interfacesRuleScope = await workspace.mkdir("src/interfaces");

    await expect(
      validateRuleAncestry(interfacesRuleScope, [adr.tag], workspace.cwd),
    ).rejects.toThrow("RULE-16");

    await workspace.cleanup();
  });

  // @verifies RULE-16, RULE-34
  it("[RULE-16][RULE-34] should reject referencing an ADR in a descendant directory", async () => {
    const workspace = await createFixtureWorkspace("rule-descendant-");

    const adr = await workspace.createAdr({
      id: 103,
      slug: "cli-decision",
      context: "CLI decision ADR",
      subDir: "src/interfaces/cli/.modie/adrs",
    });

    // Rule scoped at workspace.cwd/src/interfaces (parent of CLI)
    const interfacesRuleScope = workspace.resolve("src/interfaces");

    await expect(
      validateRuleAncestry(interfacesRuleScope, [adr.tag], workspace.cwd),
    ).rejects.toThrow("RULE-16");

    await workspace.cleanup();
  });
});

describe("Rule Creation - Execution & Disk Writing (RULE-1, RULE-3, RULE-8, RULE-11, RULE-13, RULE-34)", () => {
  // @verifies RULE-1, RULE-3, RULE-8, RULE-11, RULE-34
  it("[RULE-1][RULE-3][RULE-8][RULE-11][RULE-34] should create a rule artifact on disk with sequential monotonic ID", async () => {
    const workspace = await createFixtureWorkspace("rule-create-");

    const result = await createRule({
      title: "First Invariant Rule",
      assertion: "All inputs must be strictly validated before parsing.",
      cwd: workspace.cwd,
    });

    const expectedRule1Tag = makeTestTag("RULE", 1);
    expect(result.id).toBe("1");
    expect(result.tag).toBe(expectedRule1Tag);
    expect(result.filename).toBe(`first-invariant-rule.${expectedRule1Tag}.md`);
    expect(result.relativePath).toContain(
      `.modie/rules/first-invariant-rule.${expectedRule1Tag}.md`,
    );

    const onDisk = await workspace.readFile(result.filepath);
    expect(onDisk).toBe(
      "All inputs must be strictly validated before parsing.\n",
    );

    // Second rule should allocate ID 2
    const result2 = await createRule({
      title: "Second Invariant Rule",
      assertion:
        "All outputs must be formatted according to standard conventions.",
      cwd: workspace.cwd,
    });

    const expectedRule2Tag = makeTestTag("RULE", 2);
    expect(result2.id).toBe("2");
    expect(result2.tag).toBe(expectedRule2Tag);
    expect(result2.filename).toBe(
      `second-invariant-rule.${expectedRule2Tag}.md`,
    );

    await workspace.cleanup();
  });

  // @verifies RULE-13, RULE-16, RULE-34
  it("[RULE-13][RULE-16][RULE-34] should render frontmatter with ancestor ADR links", async () => {
    const workspace = await createFixtureWorkspace("rule-links-");

    // Create ancestor ADR
    const adr = await workspace.createAdr({
      id: 10,
      slug: "governance",
      context: "Governance ADR",
    });

    const result = await createRule({
      title: "Governed Invariant Rule",
      assertion: "All components must respect governance boundary.",
      links: [adr.tag],
      cwd: workspace.cwd,
    });

    expect(result.artifact.links).toEqual([adr.tag]);
    const onDisk = await workspace.readFile(result.filepath);
    expect(onDisk.startsWith(`---\nlinks:\n  - ${adr.tag}\n---`)).toBe(true);
    expect(onDisk).toContain(
      "All components must respect governance boundary.",
    );

    await workspace.cleanup();
  });

  it("should reject creation with empty title", async () => {
    await expect(
      createRule({
        title: "   ",
      }),
    ).rejects.toThrow("Rule title must be a non-empty string.");
  });
});
