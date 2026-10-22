/**
 * Unit and integration tests for task checklist progression and completion lifecycle.
 * @verifies ADR-6, RULE-21, RULE-22, RULE-25
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  checkTaskItem,
  completeTask,
  getTask,
  normalizeTaskId,
  resolveTaskFile,
} from "./index.ts";
import { scanActiveTasks } from "../resolver/active-scanner.ts";

describe("Task Completion & Checklist Services - Normalization & Resolution", () => {
  it("should normalize diverse task ID formats", () => {
    expect(normalizeTaskId("TASK-7")).toBe("7");
    expect(normalizeTaskId("task-7-1")).toBe("7-1");
    expect(normalizeTaskId("TASK-J101")).toBe("J101");
    expect(normalizeTaskId("7-2")).toBe("7-2");
    expect(normalizeTaskId("my-slug")).toBe("my-slug");
  });

  it("should resolve active tasks on disk by ID and slug", async () => {
    const fixtureDir = await mkdtemp(join(tmpdir(), "modie-resolve-test-"));
    const taskPath = join(fixtureDir, "sample-feature.TASK-42.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Context
Resolve test fixture

# Acceptance Criteria
- [ ] Sample item
`,
      "utf8",
    );

    const fileById = await resolveTaskFile("TASK-42", { cwd: fixtureDir });
    expect(fileById).toBe(taskPath);

    const fileByRawId = await resolveTaskFile("42", { cwd: fixtureDir });
    expect(fileByRawId).toBe(taskPath);

    const fileBySlug = await resolveTaskFile("sample-feature", {
      cwd: fixtureDir,
    });
    expect(fileBySlug).toBe(taskPath);

    const fileByDirectPath = await resolveTaskFile(taskPath, {
      cwd: fixtureDir,
    });
    expect(fileByDirectPath).toBe(taskPath);

    await rm(fixtureDir, { recursive: true, force: true });
  });

  it("should throw a descriptive error when task does not exist", async () => {
    const fixtureDir = await mkdtemp(join(tmpdir(), "modie-empty-test-"));
    await expect(
      resolveTaskFile("TASK-99999", { cwd: fixtureDir }),
    ).rejects.toThrow(/was not found among active tasks on disk/);
    await rm(fixtureDir, { recursive: true, force: true });
  });
});

describe("Task Checklist Progression - checkTaskItem (RULE-22, RULE-25)", () => {
  let tempDir: string;
  let testTaskPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "modie-checklist-test-"));
    testTaskPath = join(tempDir, "sample-feature.TASK-99.md");

    const initialContent = `---
depends_on: []
links:
  - ADR-6
  - RULE-22
---

# Context

Test task for checklist progression.

# Acceptance Criteria

- [ ] First deliverable item
- [ ] Second deliverable item
- [ ] Third deliverable item
`;
    await writeFile(testTaskPath, initialContent, "utf8");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-22, RULE-25
  it("[RULE-22][RULE-25] should check off an item and update file on disk", async () => {
    const result = await checkTaskItem(testTaskPath, 1, {
      completed: true,
      cwd: tempDir,
    });

    expect(result.itemIndex).toBe(1);
    expect(result.itemText).toBe("First deliverable item");
    expect(result.completed).toBe(true);
    expect(result.totalItems).toBe(3);
    expect(result.completedCount).toBe(1);
    expect(result.allCompleted).toBe(false);

    const diskContent = await readFile(testTaskPath, "utf8");
    expect(diskContent).toContain("- [x] First deliverable item");
    expect(diskContent).toContain("- [ ] Second deliverable item");
    expect(diskContent).toContain("- [ ] Third deliverable item");
  });

  // @verifies RULE-22
  it("[RULE-22] should uncheck an already checked item when completed: false", async () => {
    // Check item 2 first
    await checkTaskItem(testTaskPath, 2, { completed: true, cwd: tempDir });
    let diskContent = await readFile(testTaskPath, "utf8");
    expect(diskContent).toContain("- [x] Second deliverable item");

    // Uncheck item 2
    const result = await checkTaskItem(testTaskPath, 2, {
      completed: false,
      cwd: tempDir,
    });
    expect(result.completed).toBe(false);
    expect(result.completedCount).toBe(0);

    diskContent = await readFile(testTaskPath, "utf8");
    expect(diskContent).toContain("- [ ] Second deliverable item");
  });

  // @verifies RULE-22
  it("[RULE-22] should report allCompleted: true when all items are checked", async () => {
    await checkTaskItem(testTaskPath, 1, { completed: true, cwd: tempDir });
    await checkTaskItem(testTaskPath, 2, { completed: true, cwd: tempDir });
    const result = await checkTaskItem(testTaskPath, 3, {
      completed: true,
      cwd: tempDir,
    });

    expect(result.completedCount).toBe(3);
    expect(result.totalItems).toBe(3);
    expect(result.allCompleted).toBe(true);

    const task = await getTask(testTaskPath, { cwd: tempDir });
    expect(task.acceptanceCriteria.every((c) => c.completed)).toBe(true);
  });

  // @verifies RULE-22
  it("[RULE-22] should preserve surrounding frontmatter and context intact", async () => {
    await checkTaskItem(testTaskPath, 1, { completed: true, cwd: tempDir });

    const content = await readFile(testTaskPath, "utf8");
    expect(content).toContain("depends_on: []");
    expect(content).toContain("- ADR-6");
    expect(content).toContain("- RULE-22");
    expect(content).toContain(
      "# Context\n\nTest task for checklist progression.",
    );
  });

  it("should throw an error for invalid item indices", async () => {
    // 0 is invalid (1-based index)
    await expect(
      checkTaskItem(testTaskPath, 0, { cwd: tempDir }),
    ).rejects.toThrow(/Item index must be a positive integer/);

    // Negative index is invalid
    await expect(
      checkTaskItem(testTaskPath, -1, { cwd: tempDir }),
    ).rejects.toThrow(/Item index must be a positive integer/);

    // Out of bounds index
    await expect(
      checkTaskItem(testTaskPath, 10, { cwd: tempDir }),
    ).rejects.toThrow(
      /Invalid item index 10\. Task TASK-99 has 3 acceptance criteria item\(s\)\./,
    );
  });
});

describe("Task Lifecycle Completion - completeTask (ADR-6, RULE-21, RULE-22)", () => {
  let tempDir: string;
  let testTaskPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "modie-complete-test-"));
    testTaskPath = join(tempDir, "ephemeral-lifecycle.TASK-100.md");

    const content = `---
depends_on: []
links:
  - ADR-6
  - RULE-21
  - RULE-22
---

# Context

Demonstrating ephemeral task completion lifecycle.

# Acceptance Criteria

- [ ] Unfinished deliverable A
- [ ] Unfinished deliverable B
`;
    await writeFile(testTaskPath, content, "utf8");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-21, RULE-22
  it("[RULE-21][RULE-22] should reject completion when criteria are incomplete", async () => {
    await expect(completeTask(testTaskPath, { cwd: tempDir })).rejects.toThrow(
      /Cannot complete task 100: 2 acceptance criteria remain unchecked/,
    );

    // File should still exist on disk
    const content = await readFile(testTaskPath, "utf8");
    expect(content).toBeDefined();
  });

  // @verifies RULE-21, RULE-22, ADR-6
  it("[RULE-21][RULE-22][ADR-6] should complete task and delete file from disk when all criteria are satisfied", async () => {
    // Check off all criteria
    await checkTaskItem(testTaskPath, 1, { completed: true, cwd: tempDir });
    await checkTaskItem(testTaskPath, 2, { completed: true, cwd: tempDir });

    const result = await completeTask(testTaskPath, { cwd: tempDir });

    expect(result.taskId).toBe("100");
    expect(result.slug).toBe("ephemeral-lifecycle");
    expect(result.deleted).toBe(true);
    expect(result.criteriaTotal).toBe(2);
    expect(result.criteriaCompleted).toBe(2);
    expect(result.incompleteCriteria).toEqual([]);

    // File MUST be deleted per RULE-21
    await expect(readFile(testTaskPath, "utf8")).rejects.toThrow();
  });

  // @verifies RULE-21, RULE-22
  it("[RULE-21][RULE-22] should allow force completion of incomplete tasks if force: true", async () => {
    const result = await completeTask(testTaskPath, {
      force: true,
      cwd: tempDir,
    });

    expect(result.deleted).toBe(true);
    expect(result.criteriaCompleted).toBe(0);
    expect(result.incompleteCriteria.length).toBe(2);

    // File is deleted even with force
    await expect(readFile(testTaskPath, "utf8")).rejects.toThrow();
  });

  // @verifies RULE-21
  it("[RULE-21] should allow retaining artifact file when deleteArtifact: false is specified", async () => {
    await checkTaskItem(testTaskPath, 1, { completed: true, cwd: tempDir });
    await checkTaskItem(testTaskPath, 2, { completed: true, cwd: tempDir });

    const result = await completeTask(testTaskPath, {
      deleteArtifact: false,
      cwd: tempDir,
    });

    expect(result.deleted).toBe(false);

    // File remains on disk
    const content = await readFile(testTaskPath, "utf8");
    expect(content).toContain("- [x] Unfinished deliverable A");
    expect(content).toContain("- [x] Unfinished deliverable B");
  });

  it("should reject completion if task declares no acceptance criteria at all", async () => {
    const emptyCriteriaTaskPath = join(tempDir, "empty-criteria.TASK-101.md");
    await writeFile(
      emptyCriteriaTaskPath,
      `---
depends_on: []
links: []
---

# Context
Empty criteria task.

# Acceptance Criteria
`,
      "utf8",
    );

    await expect(
      completeTask(emptyCriteriaTaskPath, { cwd: tempDir }),
    ).rejects.toThrow(/Task declares no acceptance criteria checklist items/);
  });
});

describe("Two-Phase Git Commit Ceremony (ADR-6, RULE-21, RULE-22)", () => {
  let gitDir: string;

  beforeEach(async () => {
    gitDir = await mkdtemp(join(tmpdir(), "modie-two-phase-git-"));
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    await execFileAsync("git", ["init", "-q"], { cwd: gitDir });
    await execFileAsync("git", ["config", "user.name", "Modie Test"], { cwd: gitDir });
    await execFileAsync("git", ["config", "user.email", "test@modie.dev"], { cwd: gitDir });
  });

  afterEach(async () => {
    await rm(gitDir, { recursive: true, force: true });
  });

  // @verifies ADR-6, RULE-21, RULE-22
  it("[ADR-6][RULE-21][RULE-22] should execute atomic two-phase commit on completeTask with commit: true", async () => {
    const taskPath = join(gitDir, "feature-x.TASK-50.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Context
Two phase task commit test.

# Acceptance Criteria

- [x] Implemented core service
- [x] Added unit tests
`,
      "utf8",
    );

    const result = await completeTask(taskPath, { commit: true, cwd: gitDir });

    expect(result.deleted).toBe(true);
    expect(result.commits).toBeDefined();
    expect(result.commits?.phase1).toBeDefined();
    expect(result.commits?.phase2).toBeDefined();

    // Verify file is deleted on disk
    await expect(readFile(taskPath, "utf8")).rejects.toThrow();

    // Verify git log contains both ceremony commits
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    const { stdout: logOut } = await execFileAsync(
      "git",
      ["log", "--oneline", "--format=%s"],
      { cwd: gitDir },
    );

    const commitMessages = logOut.trim().split("\n");
    expect(commitMessages[0]).toBe("chore(task): delete completed TASK-50 artifact");
    expect(commitMessages[1]).toBe("feat(TASK-50): feature-x");

    // Verify git diff-filter=D detects the deleted task
    const { stdout: deletedOut } = await execFileAsync(
      "git",
      ["log", "--diff-filter=D", "--name-only", "--format="],
      { cwd: gitDir },
    );
    expect(deletedOut).toContain("feature-x.TASK-50.md");
  });

  // @verifies ADR-6, RULE-21
  it("[ADR-6][RULE-21] should only execute Phase 1 commit when deleteArtifact: false", async () => {
    const taskPath = join(gitDir, "retained.TASK-51.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Context
Retained commit test.

# Acceptance Criteria

- [x] Item 1
`,
      "utf8",
    );

    const result = await completeTask(taskPath, {
      commit: true,
      deleteArtifact: false,
      cwd: gitDir,
    });

    expect(result.deleted).toBe(false);
    expect(result.commits?.phase1).toBeDefined();
    expect(result.commits?.phase2).toBeUndefined();

    // File remains on disk
    const content = await readFile(taskPath, "utf8");
    expect(content).toContain("- [x] Item 1");

    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    const { stdout: logOut } = await execFileAsync(
      "git",
      ["log", "--oneline", "--format=%s"],
      { cwd: gitDir },
    );
    const commitMessages = logOut.trim().split("\n");
    expect(commitMessages.length).toBe(1);
    expect(commitMessages[0]).toBe("feat(TASK-51): retained");
  });

  // @verifies ADR-6, RULE-21, RULE-22
  it("[ADR-6][RULE-21][RULE-22] should update unchecked items to checked on disk during forced commit", async () => {
    const taskPath = join(gitDir, "forced.TASK-52.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Context
Forced task commit.

# Acceptance Criteria

- [ ] Item unchecked
`,
      "utf8",
    );

    const result = await completeTask(taskPath, {
      commit: true,
      force: true,
      cwd: gitDir,
    });

    expect(result.deleted).toBe(true);
    expect(result.commits?.phase1).toBeDefined();
    expect(result.commits?.phase2).toBeDefined();

    // Verify git diff of Phase 1 commit shows checked criterion
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    const { stdout: diffOut } = await execFileAsync(
      "git",
      ["show", result.commits!.phase1!],
      { cwd: gitDir },
    );
    expect(diffOut).toContain("- [x] Item unchecked");
  });

  it("should throw error if commit: true is run outside a git repository", async () => {
    const nonGitDir = await mkdtemp(join(tmpdir(), "modie-nongit-"));
    const taskPath = join(nonGitDir, "fail.TASK-53.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Context
Non git.

# Acceptance Criteria

- [x] Item 1
`,
      "utf8",
    );

    await expect(
      completeTask(taskPath, { commit: true, cwd: nonGitDir }),
    ).rejects.toThrow(/directory is not a git repository/);

    await rm(nonGitDir, { recursive: true, force: true });
  });

  // @verifies ADR-6, RULE-21, RULE-22 (TASK-25)
  it("[ADR-6][RULE-21][TASK-25] should stage all pending code and task changes in Phase 1 commit when working tree is dirty", async () => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    // 1. Create an uncommitted code file in the repo
    const codePath = join(gitDir, "service.ts");
    await writeFile(codePath, 'export const value = "implemented";\n', "utf8");

    // 2. Create an uncommitted task file
    const taskPath = join(gitDir, "dirty-tree.TASK-60.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Context
Dirty tree completion test.

# Acceptance Criteria

- [x] Service implemented
`,
      "utf8",
    );

    // 3. Complete task with commit: true
    const result = await completeTask(taskPath, { commit: true, cwd: gitDir });

    expect(result.deleted).toBe(true);
    expect(result.commits?.phase1).toBeDefined();
    expect(result.commits?.phase2).toBeDefined();

    // Verify Phase 1 commit contains BOTH the code file and the task file
    const { stdout: phase1Files } = await execFileAsync(
      "git",
      ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", result.commits!.phase1!],
      { cwd: gitDir },
    );
    expect(phase1Files).toContain("service.ts");
    expect(phase1Files).toContain("dirty-tree.TASK-60.md");

    // Verify Phase 2 commit deleted the task file
    const { stdout: phase2Files } = await execFileAsync(
      "git",
      ["diff-tree", "--no-commit-id", "--name-only", "-r", result.commits!.phase2!],
      { cwd: gitDir },
    );
    expect(phase2Files.trim()).toBe("dirty-tree.TASK-60.md");

    // Verify working tree is completely clean
    const { stdout: statusOut } = await execFileAsync(
      "git",
      ["status", "--porcelain"],
      { cwd: gitDir },
    );
    expect(statusOut.trim()).toBe("");
  });

  // @verifies ADR-6, RULE-21, RULE-22 (TASK-25)
  it("[ADR-6][RULE-21][TASK-25] should automatically skip Phase 1 commit when working tree is already clean", async () => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    // 1. Create code file and task file
    const codePath = join(gitDir, "feature.ts");
    await writeFile(codePath, 'export const ready = true;\n', "utf8");

    const taskPath = join(gitDir, "clean-tree.TASK-61.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Context
Clean tree completion test.

# Acceptance Criteria

- [x] Ready to complete
`,
      "utf8",
    );

    // 2. Pre-commit implementation and task file so working tree is clean
    await execFileAsync("git", ["add", "-A"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "feat(TASK-61): pre-committed implementation"], { cwd: gitDir });

    const { stdout: cleanStatus } = await execFileAsync("git", ["status", "--porcelain"], { cwd: gitDir });
    expect(cleanStatus.trim()).toBe("");

    // 3. Complete task with commit: true
    const result = await completeTask(taskPath, { commit: true, cwd: gitDir });

    expect(result.deleted).toBe(true);
    // Phase 1 is skipped because working tree was already clean
    expect(result.commits?.phase1).toBeUndefined();
    // Phase 2 executed the artifact deletion
    expect(result.commits?.phase2).toBeDefined();

    const { stdout: logOut } = await execFileAsync(
      "git",
      ["log", "--oneline", "--format=%s", "-n", "2"],
      { cwd: gitDir },
    );
    const messages = logOut.trim().split("\n");
    expect(messages[0]).toBe("chore(task): delete completed TASK-61 artifact");
    expect(messages[1]).toBe("feat(TASK-61): pre-committed implementation");

    // Working tree remains clean
    const { stdout: finalStatus } = await execFileAsync("git", ["status", "--porcelain"], { cwd: gitDir });
    expect(finalStatus.trim()).toBe("");
  });
});

describe("Zombie Task Resurrection Prevention (ADR-6, RULE-21)", () => {
  let gitDir: string;

  beforeEach(async () => {
    gitDir = await mkdtemp(join(tmpdir(), "modie-zombie-git-"));
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    await execFileAsync("git", ["init", "-q"], { cwd: gitDir });
    await execFileAsync("git", ["config", "user.name", "Modie Test"], { cwd: gitDir });
    await execFileAsync("git", ["config", "user.email", "test@modie.dev"], { cwd: gitDir });

    // Create and complete TASK-99 via two-phase commit
    const taskPath = join(gitDir, "zombie-target.TASK-99.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Context
Zombie test task.

# Acceptance Criteria

- [x] Criterion 1
`,
      "utf8",
    );

    await execFileAsync("git", ["add", "zombie-target.TASK-99.md"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "feat: verify all acceptance criteria for TASK-99"], { cwd: gitDir });
    await rm(taskPath, { force: true });
    await execFileAsync("git", ["add", "-u", "zombie-target.TASK-99.md"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "chore(task): delete completed TASK-99 artifact per RULE-21"], { cwd: gitDir });
  });

  afterEach(async () => {
    await rm(gitDir, { recursive: true, force: true });
  });

  // @verifies ADR-6, RULE-21
  it("[ADR-6][RULE-21] should reject resolving a resurrected zombie task file on disk", async () => {
    // Re-create deleted TASK-99 on disk
    const zombieFile = join(gitDir, "resurrected.TASK-99.md");
    await writeFile(
      zombieFile,
      `---
depends_on: []
links: []
---

# Context
Zombie resurrected.

# Acceptance Criteria

- [ ] Criterion
`,
      "utf8",
    );

    // Attempting to resolve TASK-99 must throw zombie detection error
    await expect(
      resolveTaskFile("TASK-99", { cwd: gitDir }),
    ).rejects.toThrow(/Zombie task detected: Task "TASK-99" was previously completed and deleted in Git history/);

    // Bypassing with allowZombie: true resolves the path
    const resolved = await resolveTaskFile("TASK-99", { cwd: gitDir, allowZombie: true });
    expect(resolved).toBe(zombieFile);
  });

  // @verifies ADR-6, RULE-21
  it("[ADR-6][RULE-21] should detect zombie tasks across active queue", async () => {
    const { detectZombieTasks } = await import("./index.ts");

    // Initially no active tasks on disk
    let zombies = await detectZombieTasks(gitDir);
    expect(zombies.length).toBe(0);

    // Re-create deleted TASK-99 on disk
    const zombieFile = join(gitDir, "resurrected.TASK-99.md");
    await writeFile(
      zombieFile,
      `---
depends_on: []
links: []
---

# Context
Zombie.

# Acceptance Criteria

- [ ] Item
`,
      "utf8",
    );

    zombies = await detectZombieTasks(gitDir);
    expect(zombies.length).toBe(1);
    expect(zombies[0]?.id).toBe("99");
  });
});

