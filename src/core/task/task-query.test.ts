/**
 * Unit tests for active task queue querying and DAG dependency readiness evaluation.
 * @verifies ADR-6, RULE-18, RULE-22, RULE-25, RULE-28
 */

import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  compareTaskIds,
  getTaskStatus,
  parseTaskIdFromBranch,
  queryTaskQueue,
} from "./index.ts";

describe("Task Queue Query Service - ID Comparison & Natural Ordering", () => {
  it("should sort monotonic integer task IDs numerically", () => {
    const ids = ["10", "2", "1", "11", "9"];
    ids.sort(compareTaskIds);
    expect(ids).toEqual(["1", "2", "9", "10", "11"]);
  });

  it("should sort subtasks under parents monotonically", () => {
    const ids = ["2-2", "1", "2-10", "2-1", "3"];
    ids.sort(compareTaskIds);
    expect(ids).toEqual(["1", "2-1", "2-2", "2-10", "3"]);
  });

  it("should handle TASK- prefix normalization when sorting", () => {
    const ids = ["TASK-10", "TASK-2", "TASK-1"];
    ids.sort(compareTaskIds);
    expect(ids).toEqual(["TASK-1", "TASK-2", "TASK-10"]);
  });
});

describe("Task Queue Query Service - DAG Readiness Evaluation (ADR-6, RULE-18)", () => {
  // @verifies ADR-6, RULE-18, RULE-22
  it("[ADR-6][RULE-18] should evaluate tasks with no dependencies as READY", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-query-ready-"));
    const taskPath = join(tempDir, "root-task.TASK-100.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links:
  - ADR-6
---

# Context
Root task with no prerequisites.

# Acceptance Criteria
- [ ] Deliverable 1
- [ ] Deliverable 2
`,
      "utf8",
    );

    const queue = await queryTaskQueue({ cwd: tempDir });
    expect(queue.length).toBe(1);
    expect(queue[0]!.id).toBe("100");
    expect(queue[0]!.fullTaskId).toBe("TASK-100");
    expect(queue[0]!.readiness).toBe("READY");
    expect(queue[0]!.blockedBy).toEqual([]);
    expect(queue[0]!.criteriaTotal).toBe(2);
    expect(queue[0]!.criteriaCompleted).toBe(0);
    expect(queue[0]!.criteriaProgress).toBe("0/2");
    expect(queue[0]!.allCriteriaSatisfied).toBe(false);

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies ADR-6, RULE-18
  it("[ADR-6][RULE-18] should mark task as BLOCKED when prerequisite task is active on disk", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-query-blocked-"));
    const taskAPath = join(tempDir, "upstream-task.TASK-201.md");
    const taskBPath = join(tempDir, "downstream-task.TASK-202.md");

    await writeFile(
      taskAPath,
      `---
depends_on: []
links: []
---

# Context
Upstream task.

# Acceptance Criteria
- [ ] Criteria A
`,
      "utf8",
    );

    await writeFile(
      taskBPath,
      `---
depends_on:
  - TASK-201
links: []
---

# Context
Downstream task depending on TASK-201.

# Acceptance Criteria
- [ ] Criteria B
`,
      "utf8",
    );

    const queue = await queryTaskQueue({ cwd: tempDir });
    expect(queue.length).toBe(2);

    const taskA = queue.find((t) => t.id === "201");
    const taskB = queue.find((t) => t.id === "202");

    expect(taskA?.readiness).toBe("READY");
    expect(taskA?.blockedBy).toEqual([]);

    expect(taskB?.readiness).toBe("BLOCKED");
    expect(taskB?.blockedBy).toEqual(["TASK-201"]);

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies ADR-6, RULE-18
  it("[ADR-6][RULE-18] should evaluate task as READY when prerequisite task was completed and deleted (not on disk)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-query-deleted-dep-"));
    const taskBPath = join(tempDir, "downstream-task.TASK-302.md");

    // Notice: TASK-301 does NOT exist on disk (deleted per RULE-21 upon completion)
    await writeFile(
      taskBPath,
      `---
depends_on:
  - TASK-301
links: []
---

# Context
Downstream task whose dependency TASK-301 has already completed.

# Acceptance Criteria
- [ ] Actionable deliverable
`,
      "utf8",
    );

    const queue = await queryTaskQueue({ cwd: tempDir });
    expect(queue.length).toBe(1);
    expect(queue[0]!.id).toBe("302");
    // Per ADR-6 Section 3, absence from disk signifies satisfied prerequisite
    expect(queue[0]!.readiness).toBe("READY");
    expect(queue[0]!.blockedBy).toEqual([]);

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies ADR-6, RULE-18
  it("[ADR-6][RULE-18] should handle transitive dependency chains correctly", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-query-chain-"));
    const task1 = join(tempDir, "phase-one.TASK-401.md");
    const task2 = join(tempDir, "phase-two.TASK-402.md");
    const task3 = join(tempDir, "phase-three.TASK-403.md");

    await writeFile(
      task1,
      `---\ndepends_on: []\nlinks: []\n---\n# Acceptance Criteria\n- [ ] Step 1\n`,
      "utf8",
    );
    await writeFile(
      task2,
      `---\ndepends_on:\n  - TASK-401\nlinks: []\n---\n# Acceptance Criteria\n- [ ] Step 2\n`,
      "utf8",
    );
    await writeFile(
      task3,
      `---\ndepends_on:\n  - TASK-402\nlinks: []\n---\n# Acceptance Criteria\n- [ ] Step 3\n`,
      "utf8",
    );

    const queue = await queryTaskQueue({ cwd: tempDir });
    expect(queue.length).toBe(3);

    const t1 = queue.find((t) => t.id === "401")!;
    const t2 = queue.find((t) => t.id === "402")!;
    const t3 = queue.find((t) => t.id === "403")!;

    expect(t1.readiness).toBe("READY");
    expect(t2.readiness).toBe("BLOCKED");
    expect(t2.blockedBy).toEqual(["TASK-401"]);
    expect(t3.readiness).toBe("BLOCKED");
    expect(t3.blockedBy).toEqual(["TASK-402"]);

    // Now delete task1 (simulating task 1 completion per RULE-21)
    await rm(task1);

    const updatedQueue = await queryTaskQueue({ cwd: tempDir });
    const updatedT2 = updatedQueue.find((t) => t.id === "402")!;
    const updatedT3 = updatedQueue.find((t) => t.id === "403")!;

    expect(updatedT2.readiness).toBe("READY");
    expect(updatedT2.blockedBy).toEqual([]);
    expect(updatedT3.readiness).toBe("BLOCKED");
    expect(updatedT3.blockedBy).toEqual(["TASK-402"]);

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-18
  it("[RULE-18] should handle mutual circular dependencies safely without infinite loop", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-query-cycle-"));
    const taskA = join(tempDir, "cycle-a.TASK-501.md");
    const taskB = join(tempDir, "cycle-b.TASK-502.md");

    await writeFile(
      taskA,
      `---\ndepends_on:\n  - TASK-502\nlinks: []\n---\n# Acceptance Criteria\n- [ ] A\n`,
      "utf8",
    );
    await writeFile(
      taskB,
      `---\ndepends_on:\n  - TASK-501\nlinks: []\n---\n# Acceptance Criteria\n- [ ] B\n`,
      "utf8",
    );

    const queue = await queryTaskQueue({ cwd: tempDir });
    expect(queue.length).toBe(2);

    const tA = queue.find((t) => t.id === "501")!;
    const tB = queue.find((t) => t.id === "502")!;

    expect(tA.readiness).toBe("BLOCKED");
    expect(tA.blockedBy).toEqual(["TASK-502"]);
    expect(tB.readiness).toBe("BLOCKED");
    expect(tB.blockedBy).toEqual(["TASK-501"]);

    await rm(tempDir, { recursive: true, force: true });
  });
});

describe("Task Queue Query Service - Progress & Filtering (RULE-22)", () => {
  // @verifies RULE-22
  it("[RULE-22] should accurately compute criteria completion status and percentage", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-query-progress-"));
    const taskPath = join(tempDir, "progress-task.TASK-601.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Acceptance Criteria
- [x] Item 1 completed
- [ ] Item 2 pending
- [x] Item 3 completed
`,
      "utf8",
    );

    const queue = await queryTaskQueue({ cwd: tempDir });
    expect(queue.length).toBe(1);
    expect(queue[0]!.criteriaTotal).toBe(3);
    expect(queue[0]!.criteriaCompleted).toBe(2);
    expect(queue[0]!.criteriaProgress).toBe("2/3");
    expect(queue[0]!.allCriteriaSatisfied).toBe(false);

    await rm(tempDir, { recursive: true, force: true });
  });

  it("should filter by readyOnly and blockedOnly", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-query-filter-"));
    const taskA = join(tempDir, "ready-task.TASK-701.md");
    const taskB = join(tempDir, "blocked-task.TASK-702.md");

    await writeFile(
      taskA,
      `---\ndepends_on: []\nlinks: []\n---\n# Acceptance Criteria\n- [ ] Ready item\n`,
      "utf8",
    );
    await writeFile(
      taskB,
      `---\ndepends_on:\n  - TASK-701\nlinks: []\n---\n# Acceptance Criteria\n- [ ] Blocked item\n`,
      "utf8",
    );

    const readyList = await queryTaskQueue({ cwd: tempDir, readyOnly: true });
    expect(readyList.length).toBe(1);
    expect(readyList[0]!.id).toBe("701");

    const blockedList = await queryTaskQueue({ cwd: tempDir, blockedOnly: true });
    expect(blockedList.length).toBe(1);
    expect(blockedList[0]!.id).toBe("702");

    await rm(tempDir, { recursive: true, force: true });
  });
});

describe("Task Status Inspection Service - getTaskStatus (RULE-22, RULE-25)", () => {
  // @verifies RULE-22, RULE-25
  it("[RULE-22][RULE-25] should retrieve detailed status and incomplete criteria for single task", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-query-single-"));
    const taskPath = join(tempDir, "inspection-task.TASK-801.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links:
  - ADR-6
  - RULE-18
---

# Context
Detailed inspection test.

# Acceptance Criteria
- [x] First item checked
- [ ] Second item pending
`,
      "utf8",
    );

    const status = await getTaskStatus("TASK-801", { cwd: tempDir });
    expect(status.id).toBe("801");
    expect(status.fullTaskId).toBe("TASK-801");
    expect(status.readiness).toBe("READY");
    expect(status.criteriaTotal).toBe(2);
    expect(status.criteriaCompleted).toBe(1);
    expect(status.incompleteCriteria).toEqual(["Second item pending"]);
    expect(status.links).toEqual(["ADR-6", "RULE-18"]);

    await rm(tempDir, { recursive: true, force: true });
  });

  it("should throw descriptive error when inspecting non-existent task", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-query-missing-"));
    await expect(getTaskStatus("TASK-9999", { cwd: tempDir })).rejects.toThrow(
      /was not found among active tasks on disk/,
    );
    await rm(tempDir, { recursive: true, force: true });
  });
});

describe("Task Branch Parsing Service - parseTaskIdFromBranch (RULE-28)", () => {
  // @verifies RULE-28
  it("[RULE-28] should parse monotonic integer task ID from branch name", () => {
    expect(parseTaskIdFromBranch("task/30-resolve-current-task")).toBe("30");
    expect(parseTaskIdFromBranch("task/1-setup")).toBe("1");
  });

  // @verifies RULE-28
  it("[RULE-28] should parse subtask ID from branch name", () => {
    expect(parseTaskIdFromBranch("task/7-1-subtask-feature")).toBe("7-1");
  });

  // @verifies RULE-28
  it("[RULE-28] should parse branch with explicit TASK- prefix", () => {
    expect(parseTaskIdFromBranch("task/TASK-30-resolve-current-task")).toBe("30");
  });

  // @verifies RULE-28
  it("[RULE-28] should parse alphanumeric / prefixed task ID from branch name", () => {
    expect(parseTaskIdFromBranch("task/J101-jira-task")).toBe("J101");
  });

  // @verifies RULE-28
  it("[RULE-28] should return null for trunk, protected, or non-task branches", () => {
    expect(parseTaskIdFromBranch("dev")).toBeNull();
    expect(parseTaskIdFromBranch("main")).toBeNull();
    expect(parseTaskIdFromBranch("feature/some-feature")).toBeNull();
    expect(parseTaskIdFromBranch("fix/some-fix")).toBeNull();
    expect(parseTaskIdFromBranch("")).toBeNull();
    expect(parseTaskIdFromBranch(null)).toBeNull();
    expect(parseTaskIdFromBranch(undefined)).toBeNull();
  });
});
