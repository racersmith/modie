/**
 * Integration and unit tests for unified `modie archive <tag> [options]`.
 * Verifies root command execution, subtype auto-inference, stream separation,
 * and transparent aliasing from `modie adr archive` and `modie rule archive`.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 * @verifies RULE-4, RULE-25, RULE-27, RULE-31, RULE-34
 */

import { describe, expect, it } from "bun:test";
import { captureCli, createTestWorkspace, makeTestTag } from "../../test-utils.ts";

describe("CLI Unified Archive - Execution & Stream Separation (RULE-4, RULE-25, RULE-27, RULE-31, RULE-34)", () => {
  // @verifies RULE-27
  it("[RULE-27] should emit archive command help to stderr with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "archive",
      "--help",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Usage: modie archive <tag-or-path>");
    expect(stderr).toContain("RULE-31");
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr when tag argument is missing", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["archive"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Error: Missing required artifact identifier");
  });

  // @verifies RULE-25, RULE-27, RULE-31, RULE-34
  it("[RULE-25][RULE-27][RULE-31][RULE-34] should archive an unreferenced RULE via root archive command", async () => {
    const workspace = await createTestWorkspace("cli-archive-rule-");
    const ruleTag = makeTestTag("RULE", 5);
    const rule = await workspace.createRule({
      id: 5,
      slug: "obsolete-pattern",
      body: "Obsolete pattern invariant.\n",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "archive",
      rule.tag,
    ]);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(`.modie/rules/obsolete-pattern.${ruleTag}.ARCHIVED.md`);
    expect(stderr).toContain(
      `✓ Archived RULE ${ruleTag}: obsolete-pattern.${ruleTag}.ARCHIVED.md`,
    );

    const existsOriginal = await workspace.fileExists(rule);
    expect(existsOriginal).toBe(false);

    const existsArchived = await workspace.readFile(stdout);
    expect(existsArchived).toContain("Obsolete pattern invariant.");

    await workspace.cleanup();
  });

  // @verifies RULE-25, RULE-27, RULE-31, RULE-34
  it("[RULE-25][RULE-27][RULE-31][RULE-34] should archive an unreferenced ADR via root archive command", async () => {
    const workspace = await createTestWorkspace("cli-archive-adr-");
    const adrTag = makeTestTag("ADR", 10);
    const adr = await workspace.createAdr({
      id: 10,
      slug: "monolith",
      context: "Monolith.",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "archive",
      adr.tag,
    ]);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(`.modie/adrs/monolith.${adrTag}.ARCHIVED.md`);
    expect(stderr).toContain(
      `✓ Archived ADR ${adrTag}: monolith.${adrTag}.ARCHIVED.md`,
    );

    await workspace.cleanup();
  });

  // @verifies RULE-27, RULE-31, RULE-34
  it("[RULE-27][RULE-31][RULE-34] should reject archiving when active references exist without --force", async () => {
    const workspace = await createTestWorkspace("cli-archive-guard-");

    const adrTag = makeTestTag("ADR", 1);
    const adr = await workspace.createAdr({
      id: 1,
      slug: "core-design",
      context: "Core.",
    });

    const ruleTag = makeTestTag("RULE", 1);
    await workspace.createRule({
      id: 1,
      slug: "dependent-rule",
      links: [adr.tag],
      body: "Assertion.\n",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "archive",
      adr.tag,
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain(
      `Cannot archive ${adr.tag}: 1 active incoming reference(s) exist`,
    );
    expect(stderr).toContain("Use --force to bypass this guard");

    await workspace.cleanup();
  });

  // @verifies RULE-25, RULE-27, RULE-31, RULE-34
  it("[RULE-25][RULE-27][RULE-31][RULE-34] should bypass active references guard with --force", async () => {
    const workspace = await createTestWorkspace("cli-archive-force-");

    const adrTag = makeTestTag("ADR", 1);
    const adr = await workspace.createAdr({
      id: 1,
      slug: "forced-design",
      context: "Forced.",
    });

    const ruleTag = makeTestTag("RULE", 1);
    await workspace.createRule({
      id: 1,
      slug: "active-link",
      links: [adr.tag],
      body: "Assertion.\n",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "archive",
      adr.tag,
      "--force",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(`.modie/adrs/forced-design.${adrTag}.ARCHIVED.md`);
    expect(stderr).toContain("(forced with active references)");

    await workspace.cleanup();
  });

  // @verifies RULE-27, RULE-34
  it("[RULE-27][RULE-34] should emit machine JSON to stdout when --json is passed", async () => {
    const workspace = await createTestWorkspace("cli-archive-json-");
    const ruleTag = makeTestTag("RULE", 9);
    const rule = await workspace.createRule({
      id: 9,
      slug: "json-test",
      body: "JSON test assertion.\n",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "archive",
      rule.tag,
      "--json",
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toContain(`✓ Archived RULE ${ruleTag}`);

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.tag).toBe(ruleTag);
    expect(parsed.subtype).toBe("RULE");
    expect(parsed.archivedFilename).toBe(`json-test.${ruleTag}.ARCHIVED.md`);
    expect(parsed.canArchive).toBe(true);

    await workspace.cleanup();
  });

  // @verifies RULE-4, RULE-25, RULE-27, RULE-34
  it("[RULE-4][RULE-25][RULE-27][RULE-34] should transparently execute via modie adr archive alias", async () => {
    const workspace = await createTestWorkspace("cli-alias-adr-");
    const adrTag = makeTestTag("ADR", 3);
    const adr = await workspace.createAdr({
      id: 3,
      slug: "alias-test",
      context: "Alias test.",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "adr",
      "archive",
      adr.tag,
    ]);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(`.modie/adrs/alias-test.${adrTag}.ARCHIVED.md`);
    expect(stderr).toContain(
      `✓ Archived ADR ${adrTag}: alias-test.${adrTag}.ARCHIVED.md`,
    );

    await workspace.cleanup();
  });

  // @verifies RULE-4, RULE-25, RULE-27, RULE-34
  it("[RULE-4][RULE-25][RULE-27][RULE-34] should transparently execute via modie rule archive alias", async () => {
    const workspace = await createTestWorkspace("cli-alias-rule-");
    const ruleTag = makeTestTag("RULE", 7);
    const rule = await workspace.createRule({
      id: 7,
      slug: "alias-rule",
      body: "Rule assertion for alias.\n",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "rule",
      "archive",
      rule.tag,
    ]);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(`.modie/rules/alias-rule.${ruleTag}.ARCHIVED.md`);
    expect(stderr).toContain(
      `✓ Archived RULE ${ruleTag}: alias-rule.${ruleTag}.ARCHIVED.md`,
    );

    await workspace.cleanup();
  });

  // @verifies RULE-25, RULE-27, RULE-34
  it("[RULE-25][RULE-27][RULE-34] should execute root archive command via bin.ts subprocess", async () => {
    const workspace = await createTestWorkspace("cli-archive-subproc-");
    const ruleTag = makeTestTag("RULE", 20);
    await workspace.createRule({
      id: 20,
      slug: "subprocess-rule",
      body: "Subprocess invariant.\n",
    });

    const { stdout, stderr } = await workspace.execBin([
      "archive",
      ruleTag,
      "--json",
    ]);

    expect(stderr).toContain(`✓ Archived RULE ${ruleTag}`);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.tag).toBe(ruleTag);
    expect(parsed.archivedFilename).toBe(`subprocess-rule.${ruleTag}.ARCHIVED.md`);

    await workspace.cleanup();
  });
});
