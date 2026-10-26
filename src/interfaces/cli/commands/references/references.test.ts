/**
 * Integration tests for declarative CLI references command and stream separation.
 * Enforces RULE-25 (interface core decoupling), RULE-27 (stream separation), RULE-31 (archival guard), and RULE-34 (fixture-based test isolation).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createTestWorkspace, makeTestTag, type TestWorkspace } from "../../test-utils.ts";

describe("CLI References Command - Execution & Stream Separation (RULE-25, RULE-27, RULE-31, RULE-34)", () => {
  let workspace: TestWorkspace;
  const adr1Tag = makeTestTag("ADR", 1);
  const adr4Tag = makeTestTag("ADR", 4);
  const rule25Tag = makeTestTag("RULE", 25);
  const rule31Tag = makeTestTag("RULE", 31);

  beforeEach(async () => {
    workspace = await createTestWorkspace("modie-cli-refs-");

    // 1. Target and related ADRs
    await workspace.createAdr({
      id: 1,
      slug: "architecture",
      links: [adr4Tag],
      context: "ADR defining upward linking.",
    });

    await workspace.createAdr({
      id: 4,
      slug: "foundation",
      context: "Foundational ADR.",
    });

    // 2. Rules linking to ADR-4
    await workspace.createRule({
      id: 25,
      slug: "interface-core-decoupling",
      links: [adr4Tag],
      body: "Decouple interfaces from core logic.",
    });

    await workspace.createRule({
      id: 31,
      slug: "archival-guard",
      links: [adr4Tag],
      body: "Archival reference invariance.",
    });

    // 3. Source and test code citing rule25Tag and adr1Tag
    await workspace.writeFile(
      "component.ts",
      `// Implements ${rule25Tag} and references ${adr1Tag}
export function run() {
  return "${rule25Tag}";
}
`,
    );

    await workspace.writeFile(
      "component.test.ts",
      `// @verifies ${rule25Tag}
`,
    );
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  it("[RULE-25][RULE-27][RULE-34] should emit human formatted output to stderr and exit code 0", async () => {
    const { exitCode, stdout, stderr } = await workspace.captureCli(["references", rule25Tag]);

    expect(exitCode).toBe(0);
    // RULE-27: stdout strictly empty for human command output
    expect(stdout).toBe("");
    // Human output on stderr
    expect(stderr).toContain(`Target: ${rule25Tag}`);
    expect(stderr).toContain("[Found In]");
    expect(stderr).toContain("[Links To]");
    expect(stderr).toContain("[Archival Safety Check]");
  });

  it("[RULE-27][RULE-34] should emit machine-parsable JSON to stdout when --json is passed", async () => {
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "references",
      rule25Tag,
      "--json",
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");

    const parsed = JSON.parse(stdout);
    expect(parsed.target.tag).toBe(rule25Tag);
    expect(parsed.target.slug).toBe("interface-core-decoupling");
    expect(parsed.foundIn).toBeDefined();
    expect(parsed.linksTo).toBeDefined();
    expect(parsed.archivalGuard).toBeDefined();
    expect(typeof parsed.archivalGuard.canArchive).toBe("boolean");
  });

  it("[RULE-34] should support the refs alias via CLI entrypoint in fixture workspace", async () => {
    const { exitCode, stderr } = await workspace.captureCli(["refs", rule25Tag]);

    expect(exitCode).toBe(0);
    expect(stderr).toContain(`Target: ${rule25Tag}`);
    expect(stderr).toContain("[Found In]");
  });

  it("[RULE-34] should support --to flag to show only outbound declared links in fixture workspace", async () => {
    const { exitCode, stderr } = await workspace.captureCli(["references", rule31Tag, "--to"]);

    expect(exitCode).toBe(0);
    expect(stderr).toContain("[Links To]");
    expect(stderr).toContain(adr4Tag);
    expect(stderr).not.toContain("[Found In]");
  });

  it("[RULE-34] should support --by flag to show only citations found across workspace", async () => {
    const { exitCode, stderr } = await workspace.captureCli([
      "references",
      adr4Tag,
      "--by",
      "--governance-only",
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toContain("[Found In]");
    expect(stderr).toContain("Governance Links");
    expect(stderr).not.toContain("[Links To]");
  });

  it("[RULE-27] should emit help to stderr with exit code 0 when --help is passed", async () => {
    const { exitCode, stdout, stderr } = await workspace.captureCli(["references", "--help"]);

    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Usage: modie references <tag> [options]");
    expect(stderr).toContain("--by, --found-in");
    expect(stderr).toContain("--to, --links-to");
  });

  it("[RULE-27] should report error to stderr when required tag argument is missing", async () => {
    const { exitCode, stdout, stderr } = await workspace.captureCli(["references"]);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Missing required artifact identifier.");
  });

  it("[RULE-27] should report error to stderr when querying non-existent artifact", async () => {
    const nonExistent = makeTestTag("RULE", 9999);
    const { exitCode, stdout, stderr } = await workspace.captureCli(["references", nonExistent]);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain(`Artifact "${nonExistent}" was not found`);
  });

  it("[RULE-25][RULE-27][RULE-34] should execute references via bin.ts subprocess against fixture workspace", async () => {
    const { stdout, stderr } = await workspace.execBin([
      "references",
      rule25Tag,
      "--json",
    ]);

    expect(stderr).toBe("");
    const parsed = JSON.parse(stdout);
    expect(parsed.target.tag).toBe(rule25Tag);
    expect(parsed.foundIn.total).toBeGreaterThan(0);
  });
});
