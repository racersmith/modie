/**
 * Integration and unit tests for unified `modie archive <tag> [options]`.
 * Verifies root command execution, subtype auto-inference, stream separation,
 * and transparent aliasing from `modie adr archive` and `modie rule archive`.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 * @verifies RULE-4, RULE-25, RULE-27, RULE-31
 */

import { describe, expect, it } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { captureCli } from "../../test-utils.ts";

const execFileAsync = promisify(execFile);

describe("CLI Unified Archive - Execution & Stream Separation (RULE-4, RULE-25, RULE-27, RULE-31)", () => {
  // @verifies RULE-27
  it("[RULE-27] should emit archive command help to stderr with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["archive", "--help"]);
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

  // @verifies RULE-25, RULE-27, RULE-31
  it("[RULE-25][RULE-27][RULE-31] should archive an unreferenced RULE via root archive command", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-archive-rule-"));
    const rulesDir = join(tempDir, ".rules");
    await mkdir(rulesDir, { recursive: true });

    const ruleFile = join(rulesDir, "obsolete-pattern.RULE-5.md");
    await writeFile(ruleFile, "Obsolete pattern invariant.\n", "utf8");

    const { exitCode, stdout, stderr } = await captureCli(
      ["archive", "RULE-5"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(".rules/obsolete-pattern.RULE-5.ARCHIVED.md");
    expect(stderr).toContain(
      "✓ Archived RULE RULE-5: obsolete-pattern.RULE-5.ARCHIVED.md",
    );

    const existsOriginal = await readFile(ruleFile, "utf8").catch(() => null);
    expect(existsOriginal).toBeNull();

    const existsArchived = await readFile(
      join(tempDir, ".rules/obsolete-pattern.RULE-5.ARCHIVED.md"),
      "utf8",
    );
    expect(existsArchived).toBe("Obsolete pattern invariant.\n");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-25, RULE-27, RULE-31
  it("[RULE-25][RULE-27][RULE-31] should archive an unreferenced ADR via root archive command", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-archive-adr-"));
    const adrsDir = join(tempDir, ".adrs");
    await mkdir(adrsDir, { recursive: true });

    const adrFile = join(adrsDir, "monolith.ADR-10.md");
    await writeFile(
      adrFile,
      "---\nlinks: []\n---\n# Context\nMonolith.\n",
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["archive", "ADR-10"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(".adrs/monolith.ADR-10.ARCHIVED.md");
    expect(stderr).toContain(
      "✓ Archived ADR ADR-10: monolith.ADR-10.ARCHIVED.md",
    );

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-27, RULE-31
  it("[RULE-27][RULE-31] should reject archiving when active references exist without --force", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-archive-guard-"));
    const rulesDir = join(tempDir, ".rules");
    const adrsDir = join(tempDir, ".adrs");
    await mkdir(rulesDir, { recursive: true });
    await mkdir(adrsDir, { recursive: true });

    // Seed ADR-1
    await writeFile(
      join(adrsDir, "core-design.ADR-1.md"),
      "---\nlinks: []\n---\n# Context\nCore.\n",
      "utf8",
    );

    // Active RULE-1 linking to ADR-1
    await writeFile(
      join(rulesDir, "dependent-rule.RULE-1.md"),
      "---\nlinks:\n  - ADR-1\n---\nAssertion.\n",
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["archive", "ADR-1"],
      tempDir,
    );

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Cannot archive ADR-1: 1 active incoming reference(s) exist (RULE-31)");
    expect(stderr).toContain("Use --force to bypass this guard");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-25, RULE-27, RULE-31
  it("[RULE-25][RULE-27][RULE-31] should bypass active references guard with --force", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-archive-force-"));
    const rulesDir = join(tempDir, ".rules");
    const adrsDir = join(tempDir, ".adrs");
    await mkdir(rulesDir, { recursive: true });
    await mkdir(adrsDir, { recursive: true });

    await writeFile(
      join(adrsDir, "forced-design.ADR-1.md"),
      "---\nlinks: []\n---\n# Context\nForced.\n",
      "utf8",
    );

    await writeFile(
      join(rulesDir, "active-link.RULE-1.md"),
      "---\nlinks:\n  - ADR-1\n---\nAssertion.\n",
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["archive", "ADR-1", "--force"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(".adrs/forced-design.ADR-1.ARCHIVED.md");
    expect(stderr).toContain("(forced with active references)");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-27
  it("[RULE-27] should emit machine JSON to stdout when --json is passed", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-archive-json-"));
    const rulesDir = join(tempDir, ".rules");
    await mkdir(rulesDir, { recursive: true });

    await writeFile(
      join(rulesDir, "json-test.RULE-9.md"),
      "JSON test assertion.\n",
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["archive", "RULE-9", "--json"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stderr).toContain("✓ Archived RULE RULE-9");

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.tag).toBe("RULE-9");
    expect(parsed.subtype).toBe("RULE");
    expect(parsed.archivedFilename).toBe("json-test.RULE-9.ARCHIVED.md");
    expect(parsed.canArchive).toBe(true);

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-4, RULE-25, RULE-27
  it("[RULE-4][RULE-25][RULE-27] should transparently execute via modie adr archive alias", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-alias-adr-"));
    const adrsDir = join(tempDir, ".adrs");
    await mkdir(adrsDir, { recursive: true });

    await writeFile(
      join(adrsDir, "alias-test.ADR-3.md"),
      "---\nlinks: []\n---\n# Context\nAlias test.\n",
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["adr", "archive", "ADR-3"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(".adrs/alias-test.ADR-3.ARCHIVED.md");
    expect(stderr).toContain("✓ Archived ADR ADR-3: alias-test.ADR-3.ARCHIVED.md");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-4, RULE-25, RULE-27
  it("[RULE-4][RULE-25][RULE-27] should transparently execute via modie rule archive alias", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-alias-rule-"));
    const rulesDir = join(tempDir, ".rules");
    await mkdir(rulesDir, { recursive: true });

    await writeFile(
      join(rulesDir, "alias-rule.RULE-7.md"),
      "Rule assertion for alias.\n",
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["rule", "archive", "RULE-7"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(".rules/alias-rule.RULE-7.ARCHIVED.md");
    expect(stderr).toContain("✓ Archived RULE RULE-7: alias-rule.RULE-7.ARCHIVED.md");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-25, RULE-27
  it("[RULE-25][RULE-27] should execute root archive command via bin.ts subprocess", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-archive-subproc-"));
    const rulesDir = join(tempDir, ".rules");
    await mkdir(rulesDir, { recursive: true });

    await writeFile(
      join(rulesDir, "subprocess-rule.RULE-20.md"),
      "Subprocess invariant.\n",
      "utf8",
    );

    const binPath = join(process.cwd(), "src/interfaces/cli/bin.ts");
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [binPath, "archive", "RULE-20", "--json"],
      { cwd: tempDir },
    );

    expect(stderr).toContain("✓ Archived RULE RULE-20");
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.tag).toBe("RULE-20");
    expect(parsed.archivedFilename).toBe("subprocess-rule.RULE-20.ARCHIVED.md");

    await rm(tempDir, { recursive: true, force: true });
  });
});
