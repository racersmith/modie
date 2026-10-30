/**
 * Integration and unit tests for `modie adr list`.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 * @verifies ADR-4, RULE-9, RULE-25, RULE-27, RULE-34, RULE-35
 */

import { describe, expect, it } from "bun:test";
import {
  captureCli,
  createTestWorkspace,
  makeTestTag,
} from "../../test-utils.ts";

describe("CLI ADR List - Execution, Scope Filtering & Stream Separation (ADR-4, RULE-9, RULE-25, RULE-27, RULE-34, RULE-35)", () => {
  // @verifies RULE-27
  it("[RULE-27] should emit adr list subcommand help to stderr with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "adr",
      "list",
      "--help",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Usage: modie adr list [options]");
  });

  // @verifies ADR-4, RULE-25, RULE-27, RULE-34, RULE-35
  it("[ADR-4][RULE-25][RULE-27][RULE-34][RULE-35] should emit formatted table with titles, tags, relative paths, and links to stderr and empty stdout", async () => {
    const workspace = await createTestWorkspace("modie-cli-adr-list-");
    const rule1Tag = makeTestTag("RULE", 1);
    const adr1 = await workspace.createAdr({
      id: 1,
      slug: "primitive-artifact-taxonomy",
      links: [rule1Tag],
      context: "Taxonomy decision.",
    });
    const adr2 = await workspace.createAdr({
      id: 2,
      slug: "ephemeral-task-lifecycle",
      links: [],
      context: "Lifecycle decision.",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "adr",
      "list",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Active ADRs (2 ADRs):");
    expect(stderr).toContain(adr1.tag);
    expect(stderr).toContain("primitive artifact taxonomy");
    expect(stderr).toContain(rule1Tag);
    expect(stderr).toContain(
      `.modie/adrs/primitive-artifact-taxonomy.${adr1.tag}.md`,
    );
    expect(stderr).toContain(adr2.tag);
    expect(stderr).toContain("ephemeral task lifecycle");

    await workspace.cleanup();
  });

  // @verifies RULE-25, RULE-27, RULE-34, RULE-35
  it("[RULE-25][RULE-27][RULE-34][RULE-35] should emit machine-parsable JSON array to stdout and empty stderr when --json is passed", async () => {
    const workspace = await createTestWorkspace("modie-cli-adr-list-json-");
    const rule20Tag = makeTestTag("RULE", 20);
    const adr = await workspace.createAdr({
      id: 10,
      slug: "unified-modie-directory-containment",
      links: [rule20Tag],
      context: "Directory containment decision.",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "adr",
      "list",
      "--json",
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");

    const parsed = JSON.parse(stdout.trim());
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].tag).toBe(adr.tag);
    expect(parsed[0].title).toBe("unified modie directory containment");
    expect(parsed[0].links).toEqual([rule20Tag]);
    expect(parsed[0].relativePath).toBe(
      `.modie/adrs/unified-modie-directory-containment.${adr.tag}.md`,
    );

    await workspace.cleanup();
  });

  // @verifies RULE-9, RULE-25, RULE-27, RULE-34, RULE-35
  it("[RULE-9][RULE-25][RULE-27][RULE-34][RULE-35] should support --scope filtering honoring ancestral scope traversal up to workspace root", async () => {
    const workspace = await createTestWorkspace("modie-cli-adr-scope-");
    const rootAdr = await workspace.createAdr({
      id: 1,
      slug: "root-decision",
    });
    const coreAdr = await workspace.createAdr({
      id: 2,
      slug: "core-decision",
      scopeDir: "src/core",
    });
    const gistAdr = await workspace.createAdr({
      id: 3,
      slug: "gist-decision",
      scopeDir: "src/core/gist",
    });
    await workspace.createAdr({
      id: 4,
      slug: "cli-sibling-decision",
      scopeDir: "src/interfaces/cli",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "adr",
      "list",
      "--scope",
      "src/core/gist",
      "--json",
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.map((a: any) => a.tag)).toEqual([
      rootAdr.tag,
      coreAdr.tag,
      gistAdr.tag,
    ]);

    await workspace.cleanup();
  });

  // @verifies RULE-27, RULE-34
  it("[RULE-27][RULE-34] should report notice to stderr when workspace has no active ADRs", async () => {
    const workspace = await createTestWorkspace("modie-cli-adr-empty-");
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "adr",
      "list",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("No active ADRs found in workspace.");

    await workspace.cleanup();
  });

  // @verifies RULE-27, RULE-34
  it("[RULE-27][RULE-34] should support adr ls alias", async () => {
    const workspace = await createTestWorkspace("modie-cli-adr-ls-");
    const { exitCode, stdout } = await workspace.captureCli([
      "adr",
      "ls",
      "--json",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("[]");

    await workspace.cleanup();
  });
});
