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
