/**
 * Integration and unit tests for `modie rule archive`.
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

describe("CLI Rule Archive - Execution & Stream Separation (RULE-4, RULE-25, RULE-27, RULE-31)", () => {
  // @verifies RULE-27
  it("[RULE-27] should emit rule archive subcommand help to stderr with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "rule",
      "archive",
      "--help",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain(
      "Usage: modie rule archive <tag-or-path> [options]",
    );
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr when tag argument is missing", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["rule", "archive"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Error: Missing required RULE identifier.");
  });

  // @verifies RULE-25, RULE-27, RULE-31
  it("[RULE-25][RULE-27][RULE-31] should archive an unreferenced RULE with relative path to stdout and status to stderr", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-rule-archive-"));
    const rulesDir = join(tempDir, ".rules");
    await mkdir(rulesDir, { recursive: true });

    await writeFile(
      join(rulesDir, "single-purpose.RULE-1.md"),
      `---
links: []
---

Rule description.
`,
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["rule", "archive", "RULE-1"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(".rules/single-purpose.RULE-1.ARCHIVED.md");
    expect(stderr).toContain(
      "✓ Archived RULE RULE-1: single-purpose.RULE-1.ARCHIVED.md",
    );

    const archivedContent = await readFile(
      join(tempDir, stdout.trim()),
      "utf8",
    );
    expect(archivedContent).toContain("Rule description.");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-27, RULE-31
  it("[RULE-27][RULE-31] should reject archiving when active references exist", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-rule-reject-"));
    const rulesDir = join(tempDir, ".rules");
    const tasksDir = join(tempDir, ".tasks");
    await mkdir(rulesDir, { recursive: true });
    await mkdir(tasksDir, { recursive: true });

    await writeFile(
      join(rulesDir, "target-rule.RULE-1.md"),
      "---\nlinks: []\n---\nTarget rule.",
      "utf8",
    );
    await writeFile(
      join(tasksDir, "dependent-task.TASK-1.md"),
      "---\nlinks:\n  - RULE-1\n---\n# Context\nDependent task.",
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["rule", "archive", "RULE-1"],
      tempDir,
    );

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain(
      "Error: Cannot archive RULE-1: 1 active incoming reference(s) exist.",
    );
    expect(stderr).toContain(
      "Active artifact TASK-1 (links) maintains link to RULE-1",
    );

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-25, RULE-27, RULE-31
  it("[RULE-25][RULE-27][RULE-31] should bypass active references guard with --force", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-rule-force-"));
    const rulesDir = join(tempDir, ".rules");
    const tasksDir = join(tempDir, ".tasks");
    await mkdir(rulesDir, { recursive: true });
    await mkdir(tasksDir, { recursive: true });

    await writeFile(
      join(rulesDir, "forced-rule.RULE-1.md"),
      "---\nlinks: []\n---\nForced rule.",
      "utf8",
    );
    await writeFile(
      join(tasksDir, "dependent-task.TASK-1.md"),
      "---\nlinks:\n  - RULE-1\n---\n# Context\nDependent task.",
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["rule", "archive", "RULE-1", "--force"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(".rules/forced-rule.RULE-1.ARCHIVED.md");
    expect(stderr).toContain(
      "✓ Archived RULE RULE-1: forced-rule.RULE-1.ARCHIVED.md (forced with active references)",
    );

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-27
  it("[RULE-27] should emit machine JSON to stdout when --json is passed", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-rule-json-"));
    const rulesDir = join(tempDir, ".rules");
    await mkdir(rulesDir, { recursive: true });

    await writeFile(
      join(rulesDir, "json-rule.RULE-1.md"),
      "---\nlinks: []\n---\nJson rule.",
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["rule", "archive", "RULE-1", "--json"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stderr).toContain("✓ Archived RULE RULE-1");

    const parsed = JSON.parse(stdout);
    expect(parsed.tag).toBe("RULE-1");
    expect(parsed.archivedFilename).toBe("json-rule.RULE-1.ARCHIVED.md");
    expect(parsed.canArchive).toBe(true);

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-25, RULE-27
  it("[RULE-25][RULE-27] should execute rule archive via bin.ts subprocess", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-rule-subprocess-"));
    const rulesDir = join(tempDir, ".rules");
    await mkdir(rulesDir, { recursive: true });

    await writeFile(
      join(rulesDir, "sub-rule.RULE-1.md"),
      "---\nlinks: []\n---\nSubprocess rule.",
      "utf8",
    );

    const binPath = join(process.cwd(), "src/interfaces/cli/bin.ts");
    const { stdout, stderr } = await execFileAsync(
      "bun",
      ["run", binPath, "rule", "archive", "RULE-1"],
      { cwd: tempDir },
    );

    expect(stdout.trim()).toBe(".rules/sub-rule.RULE-1.ARCHIVED.md");
    expect(stderr).toContain(
      "✓ Archived RULE RULE-1: sub-rule.RULE-1.ARCHIVED.md",
    );

    await rm(tempDir, { recursive: true, force: true });
  });
});
