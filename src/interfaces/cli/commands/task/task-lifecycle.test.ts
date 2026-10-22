/**
 * Integration and unit tests for `modie task check` and `modie task complete`.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 */

import { describe, expect, it } from "bun:test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { captureCli } from "../../test-utils.ts";

const execFileAsync = promisify(execFile);

describe("CLI Task Check - Execution & Stream Separation (RULE-22, RULE-25, RULE-27)", () => {
  // @verifies RULE-22, RULE-25, RULE-27
  it("[RULE-22][RULE-25][RULE-27] should check off an item, emit file path to stdout and status to stderr", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-check-"));
    const taskPath = join(tempDir, "cli-check-test.TASK-200.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links:
  - ADR-6
  - RULE-22
---

# Context
Test task for CLI check.

# Acceptance Criteria

- [ ] First item to check
- [ ] Second item to check
`,
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "check", taskPath, "--item", "1"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    // Machine payload to stdout
    expect(stdout.trim()).toBe(taskPath);
    // Diagnostics to stderr
    expect(stderr).toContain("✓ Checked item 1 on TASK-200");
    expect(stderr).toContain("(1/2 complete)");

    const updated = await readFile(taskPath, "utf8");
    expect(updated).toContain("- [x] First item to check");
    expect(updated).toContain("- [ ] Second item to check");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-22, RULE-27
  it("[RULE-22][RULE-27] should emit machine JSON to stdout when --json is passed", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-check-json-"));
    const taskPath = join(tempDir, "cli-json.TASK-201.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Context
JSON check test.

# Acceptance Criteria

- [ ] JSON item
`,
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "check", taskPath, "--item", "1", "--json"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.taskId).toBe("201");
    expect(parsed.itemIndex).toBe(1);
    expect(parsed.completed).toBe(true);
    expect(parsed.allCompleted).toBe(true);

    expect(stderr).toContain("✓ Checked item 1");
    expect(stderr).toContain(
      "✓ All acceptance criteria for TASK-201 are satisfied!",
    );

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-22, RULE-27
  it("[RULE-22][RULE-27] should support unchecking an item with -u / --uncheck", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-uncheck-"));
    const taskPath = join(tempDir, "cli-uncheck.TASK-202.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Context
Uncheck test.

# Acceptance Criteria

- [x] Already checked item
`,
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "check", taskPath, "--item", "1", "--uncheck"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stderr).toContain("○ Unchecked item 1 on TASK-202");

    const updated = await readFile(taskPath, "utf8");
    expect(updated).toContain("- [ ] Already checked item");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr when --item flag is missing", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "task",
      "check",
      "TASK-7-2",
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Error: Missing required --item flag");
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr when task identifier is missing", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "task",
      "check",
      "--item",
      "1",
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Error: Missing required task identifier");
  });
});

describe("CLI Task Complete - Execution & Stream Separation (RULE-21, RULE-22, RULE-25, RULE-27)", () => {
  // @verifies RULE-21, RULE-22, RULE-27
  it("[RULE-21][RULE-22][RULE-27] should reject completion with error to stderr when criteria are incomplete", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-complete-err-"));
    const taskPath = join(tempDir, "incomplete-task.TASK-300.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links:
  - ADR-6
  - RULE-21
  - RULE-22
---

# Context
Incomplete task.

# Acceptance Criteria

- [ ] Pending deliverable
`,
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "complete", taskPath],
      tempDir,
    );

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain(
      "Error: Cannot complete task 300: 1 acceptance criteria remain unchecked",
    );

    // File must NOT be deleted
    const content = await readFile(taskPath, "utf8");
    expect(content).toBeDefined();

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-21, RULE-22, RULE-25, RULE-27
  it("[RULE-21][RULE-22][RULE-25][RULE-27] should complete task and delete file when all criteria are satisfied", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-complete-ok-"));
    const taskPath = join(tempDir, "complete-task.TASK-301.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links:
  - ADR-6
  - RULE-21
  - RULE-22
---

# Context
Satisfied task.

# Acceptance Criteria

- [x] Completed deliverable
`,
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "complete", taskPath],
      tempDir,
    );

    expect(exitCode).toBe(0);
    // Machine payload to stdout
    expect(stdout.trim()).toBe(taskPath);
    // Human status to stderr
    expect(stderr).toContain(
      "✓ Completed task TASK-301: complete-task.TASK-301.md (artifact deleted)",
    );

    // File MUST be deleted per RULE-21
    await expect(readFile(taskPath, "utf8")).rejects.toThrow();

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-21, RULE-27
  it("[RULE-21][RULE-27] should support --force to bypass incomplete criteria", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-force-"));
    const taskPath = join(tempDir, "force-task.TASK-302.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Context
Forced task.

# Acceptance Criteria

- [ ] Incomplete item
`,
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "complete", taskPath, "--force"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stderr).toContain("✓ Completed task TASK-302");
    await expect(readFile(taskPath, "utf8")).rejects.toThrow();

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-21, RULE-27
  it("[RULE-21][RULE-27] should support --keep-file to retain artifact on disk", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-keep-"));
    const taskPath = join(tempDir, "keep-task.TASK-303.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Context
Retain test.

# Acceptance Criteria

- [x] Checked item
`,
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "complete", taskPath, "--keep-file"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stderr).toContain("(artifact retained)");

    const content = await readFile(taskPath, "utf8");
    expect(content).toContain("- [x] Checked item");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-27
  it("[RULE-27] should emit machine JSON to stdout when --json is passed", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-complete-json-"));
    const taskPath = join(tempDir, "json-complete.TASK-304.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Context
JSON complete test.

# Acceptance Criteria

- [x] Item
`,
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "complete", taskPath, "--json"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.taskId).toBe("304");
    expect(parsed.deleted).toBe(true);
    expect(parsed.criteriaCompleted).toBe(1);

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies ADR-6, RULE-21, RULE-27
  it("[ADR-6][RULE-21][RULE-27] should execute two-phase commit ceremony with -c / --commit", async () => {
    const gitDir = await mkdtemp(join(tmpdir(), "modie-cli-commit-"));
    await execFileAsync("git", ["init", "-q"], { cwd: gitDir });
    await execFileAsync("git", ["config", "user.name", "CLI Tester"], { cwd: gitDir });
    await execFileAsync("git", ["config", "user.email", "tester@modie.dev"], { cwd: gitDir });

    const taskPath = join(gitDir, "commit-task.TASK-305.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Context
CLI Commit Ceremony Test.

# Acceptance Criteria

- [x] Verified item
`,
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "complete", "TASK-305", "--commit"],
      gitDir,
    );

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(taskPath);
    expect(stderr).toContain("✓ Completed task TASK-305: commit-task.TASK-305.md");
    expect(stderr).toContain("Phase 1 commit (verified criteria):");
    expect(stderr).toContain("Phase 2 commit (artifact deletion):");

    // Verify task is deleted on disk
    await expect(readFile(taskPath, "utf8")).rejects.toThrow();

    // Verify git history has both ceremony commits
    const { stdout: logOut } = await execFileAsync(
      "git",
      ["log", "--oneline", "--format=%s"],
      { cwd: gitDir },
    );
    const messages = logOut.trim().split("\n");
    expect(messages[0]).toBe("chore(task): delete completed TASK-305 artifact");
    expect(messages[1]).toBe("feat(TASK-305): commit-task");

    await rm(gitDir, { recursive: true, force: true });
  });

  // @verifies ADR-6, RULE-21, RULE-27
  it("[ADR-6][RULE-21][RULE-27] should support task finish alias for complete", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-finish-"));
    const taskPath = join(tempDir, "finish-task.TASK-306.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Context
Finish alias test.

# Acceptance Criteria

- [x] Finished item
`,
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "finish", "TASK-306"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stderr).toContain("✓ Completed task TASK-306");
    await expect(readFile(taskPath, "utf8")).rejects.toThrow();

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies ADR-6, RULE-21, RULE-27
  it("[ADR-6][RULE-21][RULE-27] should reject completing a zombie task with error to stderr", async () => {
    const gitDir = await mkdtemp(join(tmpdir(), "modie-cli-zombie-"));
    await execFileAsync("git", ["init", "-q"], { cwd: gitDir });
    await execFileAsync("git", ["config", "user.name", "CLI Tester"], { cwd: gitDir });
    await execFileAsync("git", ["config", "user.email", "tester@modie.dev"], { cwd: gitDir });

    // Create and delete TASK-307 in git
    const originalFile = join(gitDir, "orig.TASK-307.md");
    await writeFile(originalFile, "---\ndepends_on: []\nlinks: []\n---\n# Context\nOrig\n# Acceptance Criteria\n- [x] Done\n", "utf8");
    await execFileAsync("git", ["add", "orig.TASK-307.md"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "feat: done"], { cwd: gitDir });
    await rm(originalFile, { force: true });
    await execFileAsync("git", ["add", "-u", "orig.TASK-307.md"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "chore: delete"], { cwd: gitDir });

    // Re-create resurrected zombie file
    const zombieFile = join(gitDir, "zombie.TASK-307.md");
    await writeFile(zombieFile, "---\ndepends_on: []\nlinks: []\n---\n# Context\nZombie\n# Acceptance Criteria\n- [x] Done\n", "utf8");

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "complete", "TASK-307"],
      gitDir,
    );

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Zombie task detected");
    expect(stderr).toContain("TASK-307");

    await rm(gitDir, { recursive: true, force: true });
  });
});

describe("CLI Task Lifecycle - End-to-End Subprocess via bin.ts", () => {
  // @verifies RULE-21, RULE-22, RULE-25, RULE-27
  it("[RULE-21][RULE-22][RULE-25][RULE-27] should execute full check and complete lifecycle via bin.ts subprocess", async () => {
    const binPath = "./src/interfaces/cli/bin.ts";

    // 1. Create a task with two criteria
    const createResult = await execFileAsync(process.execPath, [
      binPath,
      "task",
      "create",
      "Subprocess Lifecycle Task",
      "--scope",
      "src/interfaces/cli",
      "--branch",
      "dev",
      "-a",
      "Step one",
      "-a",
      "Step two",
      "--json",
    ]);
    const created = JSON.parse(createResult.stdout.trim());
    const taskPath = created.filepath;

    // 2. Check item 1
    const check1 = await execFileAsync(process.execPath, [
      binPath,
      "task",
      "check",
      taskPath,
      "--item",
      "1",
    ]);
    expect(check1.stderr).toContain("✓ Checked item 1");
    expect(check1.stdout.trim()).toBe(taskPath);

    // 3. Attempt to complete (should fail because item 2 is incomplete)
    try {
      await execFileAsync(process.execPath, [
        binPath,
        "task",
        "complete",
        taskPath,
      ]);
      expect(true).toBe(false); // should not reach here
    } catch (err: any) {
      expect(err.stderr).toContain("1 acceptance criteria remain unchecked");
    }

    // 4. Check item 2
    const check2 = await execFileAsync(process.execPath, [
      binPath,
      "task",
      "check",
      taskPath,
      "--item",
      "2",
    ]);
    expect(check2.stderr).toContain("✓ All acceptance criteria");

    // 5. Complete task (pass --no-commit to avoid committing in the host repository)
    const completeResult = await execFileAsync(process.execPath, [
      binPath,
      "task",
      "complete",
      taskPath,
      "--no-commit",
    ]);
    expect(completeResult.stderr).toContain("✓ Completed task");
    expect(completeResult.stderr).toContain("artifact deleted");

    // Verify deletion
    await expect(readFile(taskPath, "utf8")).rejects.toThrow();
  });
});
