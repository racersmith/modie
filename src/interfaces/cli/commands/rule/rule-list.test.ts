/**
 * Integration and unit tests for `modie rule list`.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 * @verifies ADR-4, RULE-9, RULE-25, RULE-27, RULE-34, RULE-35
 */

import { describe, expect, it } from "bun:test";
import {
  captureCli,
  createTestWorkspace,
  makeTestTag,
} from "../../test-utils.ts";

describe("CLI Rule List - Execution, Scope Filtering & Stream Separation (ADR-4, RULE-9, RULE-25, RULE-27, RULE-34, RULE-35)", () => {
  // @verifies RULE-27
  it("[RULE-27] should emit rule list subcommand help to stderr with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "rule",
      "list",
      "--help",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Usage: modie rule list [options]");
  });

  // @verifies ADR-4, RULE-25, RULE-27, RULE-34, RULE-35
  it("[ADR-4][RULE-25][RULE-27][RULE-34][RULE-35] should emit formatted table with titles, tags, relative paths, and links to stderr and empty stdout", async () => {
    const workspace = await createTestWorkspace("modie-cli-rule-list-");
    const adr1Tag = makeTestTag("ADR", 1);
    const rule1 = await workspace.createRule({
      id: 1,
      slug: "first-invariant-rule",
      links: [adr1Tag],
      body: "First invariant.",
    });
    const rule2 = await workspace.createRule({
      id: 2,
      slug: "second-invariant-rule",
      links: [],
      body: "Second invariant.",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "rule",
      "list",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Active Rules (2 rules):");
    expect(stderr).toContain(rule1.tag);
    expect(stderr).toContain("first invariant rule");
    expect(stderr).toContain(adr1Tag);
    expect(stderr).toContain(
      `.modie/rules/first-invariant-rule.${rule1.tag}.md`,
    );
    expect(stderr).toContain(rule2.tag);
    expect(stderr).toContain("second invariant rule");

    await workspace.cleanup();
  });

  // @verifies RULE-25, RULE-27, RULE-34, RULE-35
  it("[RULE-25][RULE-27][RULE-34][RULE-35] should emit machine-parsable JSON array to stdout and empty stderr when --json is passed", async () => {
    const workspace = await createTestWorkspace("modie-cli-rule-list-json-");
    const adr4Tag = makeTestTag("ADR", 4);
    const rule = await workspace.createRule({
      id: 9,
      slug: "ancestral-scope-traversal",
      links: [adr4Tag],
      body: "Ancestral scope traversal invariant.",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "rule",
      "list",
      "--json",
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");

    const parsed = JSON.parse(stdout.trim());
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].tag).toBe(rule.tag);
    expect(parsed[0].title).toBe("ancestral scope traversal");
    expect(parsed[0].links).toEqual([adr4Tag]);
    expect(parsed[0].relativePath).toBe(
      `.modie/rules/ancestral-scope-traversal.${rule.tag}.md`,
    );

    await workspace.cleanup();
  });

  // @verifies RULE-9, RULE-25, RULE-27, RULE-34, RULE-35
  it("[RULE-9][RULE-25][RULE-27][RULE-34][RULE-35] should support --scope filtering honoring ancestral scope traversal up to workspace root", async () => {
    const workspace = await createTestWorkspace("modie-cli-rule-scope-");
    const rootRule = await workspace.createRule({
      id: 1,
      slug: "root-rule",
    });
    const srcRule = await workspace.createRule({
      id: 2,
      slug: "src-rule",
      scopeDir: "src",
    });
    const cliRule = await workspace.createRule({
      id: 3,
      slug: "cli-rule",
      scopeDir: "src/interfaces/cli",
    });
    await workspace.createRule({
      id: 4,
      slug: "mcp-sibling-rule",
      scopeDir: "src/interfaces/mcp",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "rule",
      "list",
      "--scope",
      "src/interfaces/cli",
      "--json",
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.map((r: any) => r.tag)).toEqual([
      rootRule.tag,
      srcRule.tag,
      cliRule.tag,
    ]);

    await workspace.cleanup();
  });

  // @verifies RULE-27, RULE-34
  it("[RULE-27][RULE-34] should report notice to stderr when workspace has no active rules", async () => {
    const workspace = await createTestWorkspace("modie-cli-rule-empty-");
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "rule",
      "list",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("No active rules found in workspace.");

    await workspace.cleanup();
  });

  // @verifies RULE-27, RULE-34
  it("[RULE-27][RULE-34] should support rule ls alias", async () => {
    const workspace = await createTestWorkspace("modie-cli-rule-ls-");
    const { exitCode, stdout } = await workspace.captureCli([
      "rule",
      "ls",
      "--json",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("[]");

    await workspace.cleanup();
  });
});
