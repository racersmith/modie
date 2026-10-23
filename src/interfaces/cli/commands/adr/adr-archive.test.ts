/**
 * Integration and unit tests for `modie adr archive`.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 */

import { describe, expect, it } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { captureCli } from "../../test-utils.ts";

const execFileAsync = promisify(execFile);

describe("CLI ADR Archive - Execution & Stream Separation (RULE-4, RULE-25, RULE-27, RULE-31)", () => {
  // @verifies RULE-27
  it("[RULE-27] should emit adr archive subcommand help to stderr with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "adr",
      "archive",
      "--help",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain(
      "Usage: modie adr archive <tag-or-path> [options]",
    );
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr when tag argument is missing", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["adr", "archive"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Error: Missing required ADR identifier.");
  });

  // @verifies RULE-25, RULE-27, RULE-31
  it("[RULE-25][RULE-27][RULE-31] should archive an unreferenced ADR with relative path to stdout and status to stderr", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-adr-archive-"));
    const adrsDir = join(tempDir, ".adrs");
    await mkdir(adrsDir, { recursive: true });

    await writeFile(
      join(adrsDir, "single-database.ADR-1.md"),
      `---
links: []
---

# Context
Single database.
`,
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["adr", "archive", "ADR-1"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(".adrs/single-database.ADR-1.ARCHIVED.md");
    expect(stderr).toContain(
      "✓ Archived ADR ADR-1: single-database.ADR-1.ARCHIVED.md",
    );

    const archivedContent = await readFile(
      join(tempDir, stdout.trim()),
      "utf8",
    );
    expect(archivedContent).toContain("# Context\nSingle database.");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-27, RULE-31
  it("[RULE-27][RULE-31] should reject archiving when active references exist", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-adr-reject-"));
    const adrsDir = join(tempDir, ".adrs");
    const rulesDir = join(tempDir, ".rules");
    await mkdir(adrsDir, { recursive: true });
    await mkdir(rulesDir, { recursive: true });

    await writeFile(
      join(adrsDir, "target-decision.ADR-1.md"),
      "---\nlinks: []\n---\n# Context\nTarget.",
      "utf8",
    );
    await writeFile(
      join(rulesDir, "dependent.RULE-1.md"),
      "---\nlinks:\n  - ADR-1\n---\nDependent rule.",
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["adr", "archive", "ADR-1"],
      tempDir,
    );

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain(
      "Error: Cannot archive ADR-1: 1 active incoming reference(s) exist.",
    );
    expect(stderr).toContain(
      "Active artifact RULE-1 (links) maintains link to ADR-1",
    );

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-25, RULE-27, RULE-31
  it("[RULE-25][RULE-27][RULE-31] should bypass active references guard with --force", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-adr-force-"));
    const adrsDir = join(tempDir, ".adrs");
    const rulesDir = join(tempDir, ".rules");
    await mkdir(adrsDir, { recursive: true });
    await mkdir(rulesDir, { recursive: true });

    await writeFile(
      join(adrsDir, "forced-decision.ADR-1.md"),
      "---\nlinks: []\n---\n# Context\nForced.",
      "utf8",
    );
    await writeFile(
      join(rulesDir, "dependent.RULE-1.md"),
      "---\nlinks:\n  - ADR-1\n---\nDependent.",
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["adr", "archive", "ADR-1", "--force"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(".adrs/forced-decision.ADR-1.ARCHIVED.md");
    expect(stderr).toContain(
      "✓ Archived ADR ADR-1: forced-decision.ADR-1.ARCHIVED.md (forced with active references)",
    );

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-27
  it("[RULE-27] should emit machine JSON to stdout when --json is passed", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-adr-json-"));
    const adrsDir = join(tempDir, ".adrs");
    await mkdir(adrsDir, { recursive: true });

    await writeFile(
      join(adrsDir, "json-decision.ADR-1.md"),
      "---\nlinks: []\n---\n# Context\nJson.",
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["adr", "archive", "ADR-1", "--json"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stderr).toContain("✓ Archived ADR ADR-1");

    const parsed = JSON.parse(stdout);
    expect(parsed.tag).toBe("ADR-1");
    expect(parsed.archivedFilename).toBe("json-decision.ADR-1.ARCHIVED.md");
    expect(parsed.canArchive).toBe(true);

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-25, RULE-27
  it("[RULE-25][RULE-27] should execute adr archive via bin.ts subprocess", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-adr-subprocess-"));
    const adrsDir = join(tempDir, ".adrs");
    await mkdir(adrsDir, { recursive: true });

    await writeFile(
      join(adrsDir, "sub-decision.ADR-1.md"),
      "---\nlinks: []\n---\n# Context\nSubprocess.",
      "utf8",
    );

    const binPath = join(process.cwd(), "src/interfaces/cli/bin.ts");
    const { stdout, stderr } = await execFileAsync(
      "bun",
      ["run", binPath, "adr", "archive", "ADR-1"],
      { cwd: tempDir },
    );

    expect(stdout.trim()).toBe(".adrs/sub-decision.ADR-1.ARCHIVED.md");
    expect(stderr).toContain(
      "✓ Archived ADR ADR-1: sub-decision.ADR-1.ARCHIVED.md",
    );

    await rm(tempDir, { recursive: true, force: true });
  });
});
