/**
 * Integration and unit tests for `modie task check` and `modie task complete`.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { formatArtifactTag } from "../../../../core/index.ts";
import {
  createFixtureWorkspace, type FixtureWorkspace,
} from "../../../../core/platform/testing/index.ts";
import {
  captureCli, execBin,
} from "../../test-utils.ts";

const execFileAsync = promisify(execFile);

describe("CLI Task Check - Execution & Stream Separation (RULE-22, RULE-25, RULE-27, RULE-34, RULE-35)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("cli-check-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-22, RULE-25, RULE-27, RULE-34, RULE-35
  it("[RULE-22][RULE-25][RULE-27][RULE-34][RULE-35] should check off an item, emit file path to stdout and status to stderr", async () => {
    const linkAdr = formatArtifactTag("ADR", 6);
    const linkRule = formatArtifactTag("RULE", 22);

    const task = await workspace.createTask({
      id: 200,
      slug: "cli-check-test",
      links: [linkAdr, linkRule],
      context: "Test task for CLI check.",
      criteria: ["First item to check", "Second item to check"],
    });

    const { exitCode, stdout, stderr } = await captureCli([
      "task",
      "check",
      task.filepath,
      "--item",
      "1",
    ], workspace.cwd);

    expect(exitCode).toBe(0);
    // Machine payload to stdout
    expect(stdout.trim()).toBe(task.filepath);
    // Diagnostics to stderr
    expect(stderr).toContain(`✓ Checked item 1 on ${task.tag}`);
    expect(stderr).toContain("(1/2 complete)");

    const updated = await workspace.readFile(task);
    expect(updated).toContain("- [x] First item to check");
    expect(updated).toContain("- [ ] Second item to check");
  });

  // @verifies RULE-22, RULE-27, RULE-34
  it("[RULE-22][RULE-27][RULE-34] should emit machine JSON to stdout when --json is passed", async () => {
    const task = await workspace.createTask({
      id: 201,
      slug: "cli-json",
      context: "JSON check test.",
      criteria: ["JSON item"],
    });

    const { exitCode, stdout, stderr } = await captureCli([
      "task",
      "check",
      task.filepath,
      "--item",
      "1",
      "--json",
    ], workspace.cwd);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.taskId).toBe(task.id);
    expect(parsed.itemIndex).toBe(1);
    expect(parsed.completed).toBe(true);
    expect(parsed.allCompleted).toBe(true);

    expect(stderr).toContain("✓ Checked item 1");
    expect(stderr).toContain(
      `✓ All acceptance criteria for ${task.tag} are satisfied!`,
    );
  });

  // @verifies RULE-22, RULE-27, RULE-34
  it("[RULE-22][RULE-27][RULE-34] should support unchecking an item with -u / --uncheck", async () => {
    const task = await workspace.createTask({
      id: 202,
      slug: "cli-uncheck",
      context: "Uncheck test.",
      criteria: [{ text: "Already checked item", completed: true }],
    });

    const { exitCode, stdout, stderr } = await captureCli([
      "task",
      "check",
      task.filepath,
      "--item",
      "1",
      "--uncheck",
    ], workspace.cwd);

    expect(exitCode).toBe(0);
    expect(stderr).toContain(`○ Unchecked item 1 on ${task.tag}`);

    const updated = await workspace.readFile(task);
    expect(updated).toContain("- [ ] Already checked item");
  });

  // @verifies RULE-27, RULE-35
  it("[RULE-27][RULE-35] should report error to stderr when --item flag is missing", async () => {
    const dummyTag = formatArtifactTag("TASK", "7-2");
    const { exitCode, stdout, stderr } = await captureCli([
      "task",
      "check",
      dummyTag,
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Error: Missing required --item flag");
  });

  // @verifies RULE-27, RULE-34
  it("[RULE-27][RULE-34] should report error to stderr when task identifier is missing", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "task",
      "check",
      "--item",
      "1",
    ], workspace.cwd);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Error: Missing required task identifier");
  });
});

describe("CLI Task Complete - Execution & Stream Separation (RULE-21, RULE-22, RULE-25, RULE-27, RULE-34, RULE-35)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("cli-complete-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-21, RULE-22, RULE-27, RULE-34, RULE-35
  it("[RULE-21][RULE-22][RULE-27][RULE-34][RULE-35] should reject completion with error to stderr when criteria are incomplete", async () => {
    const linkAdr = formatArtifactTag("ADR", 6);
    const linkRule21 = formatArtifactTag("RULE", 21);
    const linkRule22 = formatArtifactTag("RULE", 22);

    const task = await workspace.createTask({
      id: 300,
      slug: "incomplete-task",
      links: [linkAdr, linkRule21, linkRule22],
      context: "Incomplete task.",
      criteria: ["Pending deliverable"],
    });

    const { exitCode, stdout, stderr } = await captureCli([
      "task",
      "complete",
      task.filepath,
    ], workspace.cwd);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain(
      `Error: Cannot complete task ${task.id}: 1 acceptance criteria remain unchecked`,
    );

    // File must NOT be deleted
    expect(await workspace.fileExists(task)).toBe(true);
  });

  // @verifies RULE-21, RULE-22, RULE-25, RULE-27, RULE-34, RULE-35
  it("[RULE-21][RULE-22][RULE-25][RULE-27][RULE-34][RULE-35] should complete task and delete file when all criteria are satisfied", async () => {
    const linkAdr = formatArtifactTag("ADR", 6);
    const linkRule21 = formatArtifactTag("RULE", 21);
    const linkRule22 = formatArtifactTag("RULE", 22);

    const task = await workspace.createTask({
      id: 301,
      slug: "complete-task",
      links: [linkAdr, linkRule21, linkRule22],
      context: "Satisfied task.",
      criteria: [{ text: "Completed deliverable", completed: true }],
    });

    const { exitCode, stdout, stderr } = await captureCli([
      "task",
      "complete",
      task.filepath,
    ], workspace.cwd);

    expect(exitCode).toBe(0);
    // Machine payload to stdout
    expect(stdout.trim()).toBe(task.filepath);
    // Human status to stderr
    expect(stderr).toContain(
      `✓ Completed task ${task.tag}: ${task.filename} (artifact deleted)`,
    );

    // File MUST be deleted per task completion invariants
    expect(await workspace.fileExists(task)).toBe(false);
  });

  // @verifies RULE-21, RULE-27, RULE-34
  it("[RULE-21][RULE-27][RULE-34] should support --force to bypass incomplete criteria", async () => {
    const task = await workspace.createTask({
      id: 302,
      slug: "force-task",
      context: "Forced task.",
      criteria: ["Incomplete item"],
    });

    const { exitCode, stdout, stderr } = await captureCli([
      "task",
      "complete",
      task.filepath,
      "--force",
    ], workspace.cwd);

    expect(exitCode).toBe(0);
    expect(stderr).toContain(`✓ Completed task ${task.tag}`);
    expect(await workspace.fileExists(task)).toBe(false);
  });

  // @verifies RULE-21, RULE-27, RULE-34
  it("[RULE-21][RULE-27][RULE-34] should support --keep-file to retain artifact on disk", async () => {
    const task = await workspace.createTask({
      id: 303,
      slug: "keep-task",
      context: "Retain test.",
      criteria: [{ text: "Checked item", completed: true }],
    });

    const { exitCode, stdout, stderr } = await captureCli([
      "task",
      "complete",
      task.filepath,
      "--keep-file",
    ], workspace.cwd);

    expect(exitCode).toBe(0);
    expect(stderr).toContain("(artifact retained)");

    const content = await workspace.readFile(task);
    expect(content).toContain("- [x] Checked item");
  });

  // @verifies RULE-27, RULE-34
  it("[RULE-27][RULE-34] should emit machine JSON to stdout when --json is passed", async () => {
    const task = await workspace.createTask({
      id: 304,
      slug: "json-complete",
      context: "JSON complete test.",
      criteria: [{ text: "Item", completed: true }],
    });

    const { exitCode, stdout, stderr } = await captureCli([
      "task",
      "complete",
      task.filepath,
      "--json",
    ], workspace.cwd);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.taskId).toBe(task.id);
    expect(parsed.deleted).toBe(true);
    expect(parsed.criteriaCompleted).toBe(1);
  });

  // @verifies RULE-21, RULE-27, RULE-34
  it("[RULE-21][RULE-27][RULE-34] should execute two-phase commit ceremony with -c / --commit", async () => {
    await workspace.initGit();

    const task = await workspace.createTask({
      id: 305,
      slug: "commit-task",
      context: "CLI Commit Ceremony Test.",
      criteria: [{ text: "Verified item", completed: true }],
    });

    const { exitCode, stdout, stderr } = await captureCli([
      "task",
      "complete",
      task.tag,
      "--commit",
    ], workspace.cwd);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(task.filepath);
    expect(stderr).toContain(`✓ Completed task ${task.tag}: ${task.filename}`);
    expect(stderr).toContain("Phase 1 commit (verified criteria):");
    expect(stderr).toContain("Phase 2 commit (artifact deletion):");

    // Verify task is deleted on disk
    expect(await workspace.fileExists(task)).toBe(false);

    // Verify git history has both ceremony commits
    const { stdout: logOut } = await execFileAsync(
      "git",
      ["log", "--oneline", "--format=%s"],
      { cwd: workspace.cwd },
    );
    const messages = logOut.trim().split("\n");
    expect(messages[0]).toBe(
      `chore(task): delete completed ${task.tag} artifact`,
    );
    expect(messages[1]).toBe(`feat(${task.tag}): ${task.slug}`);
  });

  // @verifies RULE-21, RULE-27, RULE-34
  it("[RULE-21][RULE-27][RULE-34] should support task finish alias for complete", async () => {
    const task = await workspace.createTask({
      id: 306,
      slug: "finish-task",
      context: "Finish alias test.",
      criteria: [{ text: "Finished item", completed: true }],
    });

    const { exitCode, stdout, stderr } = await captureCli([
      "task",
      "finish",
      task.tag,
    ], workspace.cwd);

    expect(exitCode).toBe(0);
    expect(stderr).toContain(`✓ Completed task ${task.tag}`);
    expect(await workspace.fileExists(task)).toBe(false);
  });

  // @verifies RULE-21, RULE-27, RULE-34
  it("[RULE-21][RULE-27][RULE-34] should reject completing a zombie task with error to stderr", async () => {
    await workspace.initGit();

    // Create and delete task in git
    const originalTask = await workspace.createTask({
      id: 307,
      slug: "orig",
      criteria: [{ text: "Done", completed: true }],
    });
    await workspace.gitCommit(`feat(${originalTask.tag}): done`);

    // Delete in git
    await execFileAsync("rm", [originalTask.filepath]);
    await execFileAsync("git", ["add", "-u"], { cwd: workspace.cwd });
    await workspace.gitCommit("chore: delete");

    // Re-create resurrected zombie file
    await workspace.createTask({
      id: 307,
      slug: "zombie",
      criteria: [{ text: "Done", completed: true }],
    });

    const { exitCode, stdout, stderr } = await captureCli([
      "task",
      "complete",
      originalTask.tag,
    ], workspace.cwd);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Zombie task detected");
    expect(stderr).toContain(originalTask.tag);
  });
});

describe("CLI Task Lifecycle - End-to-End Subprocess via bin.ts (RULE-21, RULE-22, RULE-25, RULE-27, RULE-34)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("cli-subproc-lifecycle-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-21, RULE-22, RULE-25, RULE-27, RULE-34
  it("[RULE-21][RULE-22][RULE-25][RULE-27][RULE-34] should execute full check and complete lifecycle via bin.ts subprocess", async () => {
    await workspace.initGit();

    // 1. Create a task with two criteria inside isolated workspace
    const createResult = await execBin([
      "task",
      "create",
      "Subprocess Lifecycle Task",
      "-a",
      "Step one",
      "-a",
      "Step two",
      "--json",
    ], workspace.cwd);
    const created = JSON.parse(createResult.stdout.trim());
    const taskPath = created.filepath;

    // 2. Check item 1
    const check1 = await execBin([
      "task",
      "check",
      taskPath,
      "--item",
      "1",
    ], workspace.cwd);
    expect(check1.stderr).toContain("✓ Checked item 1");
    expect(check1.stdout.trim()).toBe(taskPath);

    // 3. Attempt to complete (should fail because items 2 and 3 remain unchecked)
    try {
      await execBin(["task", "complete", taskPath], workspace.cwd);
      expect(true).toBe(false); // should not reach here
    } catch (err: any) {
      expect(err.stderr).toContain("2 acceptance criteria remain unchecked");
    }

    // 4. Check item 2
    const check2 = await execBin([
      "task",
      "check",
      taskPath,
      "--item",
      "2",
    ], workspace.cwd);
    expect(check2.stderr).toContain("✓ Checked item 2");

    // 5. Attempt to complete (should fail because item 3 "User Review" remains unchecked)
    try {
      await execBin(["task", "complete", taskPath], workspace.cwd);
      expect(true).toBe(false); // should not reach here
    } catch (err: any) {
      expect(err.stderr).toContain("1 acceptance criteria remain unchecked");
    }

    // 6. Check item 3 (User Review)
    const check3 = await execBin([
      "task",
      "check",
      taskPath,
      "--item",
      "3",
    ], workspace.cwd);
    expect(check3.stderr).toContain("✓ All acceptance criteria");

    // 7. Complete task inside the hermetic git repository
    const completeResult = await execBin([
      "task",
      "complete",
      taskPath,
      "--commit",
    ], workspace.cwd);
    expect(completeResult.stderr).toContain("✓ Completed task");
    expect(completeResult.stderr).toContain("artifact deleted");

    // Verify deletion
    expect(await workspace.fileExists(taskPath)).toBe(false);
  });
});
