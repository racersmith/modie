/**
 * Unit tests for active task queue querying and DAG dependency readiness evaluation.
 * @verifies ADR-6, RULE-18, RULE-22, RULE-25, RULE-28
 */

import { describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { createFixtureWorkspace, makeTestTag } from "../testing/index.ts";
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
    await using workspace = await createFixtureWorkspace("modie-query-ready-");
    const task = await workspace.createTask({
      id: 100,
      slug: "root-task",
      context: "Root task with no prerequisites.",
      links: [makeTestTag("ADR", 6)],
      criteria: ["Deliverable 1", "Deliverable 2"],
    });

    const queue = await queryTaskQueue({ cwd: workspace.cwd });
    expect(queue.length).toBe(1);
    expect(queue[0]!.id).toBe(task.id);
    expect(queue[0]!.fullTaskId).toBe(task.tag);
    expect(queue[0]!.readiness).toBe("READY");
    expect(queue[0]!.blockedBy).toEqual([]);
    expect(queue[0]!.criteriaTotal).toBe(2);
    expect(queue[0]!.criteriaCompleted).toBe(0);
    expect(queue[0]!.criteriaProgress).toBe("0/2");
    expect(queue[0]!.allCriteriaSatisfied).toBe(false);
  });

  // @verifies ADR-6, RULE-18
  it("[ADR-6][RULE-18] should mark task as BLOCKED when prerequisite task is active on disk", async () => {
    await using workspace = await createFixtureWorkspace("modie-query-blocked-");
    const taskA = await workspace.createTask({
      id: 201,
      slug: "upstream-task",
      context: "Upstream task.",
      criteria: ["Criteria A"],
    });

    const taskB = await workspace.createTask({
      id: 202,
      slug: "downstream-task",
      context: "Downstream task depending on upstream.",
      depends_on: [taskA.tag],
      criteria: ["Criteria B"],
    });

    const queue = await queryTaskQueue({ cwd: workspace.cwd });
    expect(queue.length).toBe(2);

    const foundA = queue.find((t) => t.id === taskA.id);
    const foundB = queue.find((t) => t.id === taskB.id);

    expect(foundA?.readiness).toBe("READY");
    expect(foundA?.blockedBy).toEqual([]);

    expect(foundB?.readiness).toBe("BLOCKED");
    expect(foundB?.blockedBy).toEqual([taskA.tag]);
  });

  // @verifies ADR-6, RULE-18
  it("[ADR-6][RULE-18] should evaluate task as READY when prerequisite task was completed and deleted (not on disk)", async () => {
    await using workspace = await createFixtureWorkspace("modie-query-deleted-dep-");
    const task301Tag = makeTestTag("TASK", 301);
    const taskB = await workspace.createTask({
      id: 302,
      slug: "downstream-task",
      context: "Downstream task whose dependency has already completed.",
      depends_on: [task301Tag],
      criteria: ["Actionable deliverable"],
    });

    const queue = await queryTaskQueue({ cwd: workspace.cwd });
    expect(queue.length).toBe(1);
    expect(queue[0]!.id).toBe(taskB.id);
    // Per ADR-6 Section 3, absence from disk signifies satisfied prerequisite
    expect(queue[0]!.readiness).toBe("READY");
    expect(queue[0]!.blockedBy).toEqual([]);
  });

  // @verifies ADR-6, RULE-18
  it("[ADR-6][RULE-18] should handle transitive dependency chains correctly", async () => {
    await using workspace = await createFixtureWorkspace("modie-query-chain-");
    const task1 = await workspace.createTask({
      id: 401,
      slug: "phase-one",
      criteria: ["Step 1"],
    });
    const task2 = await workspace.createTask({
      id: 402,
      slug: "phase-two",
      depends_on: [task1.tag],
      criteria: ["Step 2"],
    });
    const task3 = await workspace.createTask({
      id: 403,
      slug: "phase-three",
      depends_on: [task2.tag],
      criteria: ["Step 3"],
    });

    const queue = await queryTaskQueue({ cwd: workspace.cwd });
    expect(queue.length).toBe(3);

    const t1 = queue.find((t) => t.id === task1.id)!;
    const t2 = queue.find((t) => t.id === task2.id)!;
    const t3 = queue.find((t) => t.id === task3.id)!;

    expect(t1.readiness).toBe("READY");
    expect(t2.readiness).toBe("BLOCKED");
    expect(t2.blockedBy).toEqual([task1.tag]);
    expect(t3.readiness).toBe("BLOCKED");
    expect(t3.blockedBy).toEqual([task2.tag]);

    // Now delete task1 (simulating task 1 completion per RULE-21)
    await rm(task1.filepath);

    const updatedQueue = await queryTaskQueue({ cwd: workspace.cwd });
    const updatedT2 = updatedQueue.find((t) => t.id === task2.id)!;
    const updatedT3 = updatedQueue.find((t) => t.id === task3.id)!;

    expect(updatedT2.readiness).toBe("READY");
    expect(updatedT2.blockedBy).toEqual([]);
    expect(updatedT3.readiness).toBe("BLOCKED");
    expect(updatedT3.blockedBy).toEqual([task2.tag]);
  });

  // @verifies RULE-18
  it("[RULE-18] should handle mutual circular dependencies safely without infinite loop", async () => {
    await using workspace = await createFixtureWorkspace("modie-query-cycle-");
    const task501Tag = makeTestTag("TASK", 501);
    const task502Tag = makeTestTag("TASK", 502);

    const taskA = await workspace.createTask({
      id: 501,
      slug: "cycle-a",
      depends_on: [task502Tag],
      criteria: ["A"],
    });
    const taskB = await workspace.createTask({
      id: 502,
      slug: "cycle-b",
      depends_on: [task501Tag],
      criteria: ["B"],
    });

    const queue = await queryTaskQueue({ cwd: workspace.cwd });
    expect(queue.length).toBe(2);

    const tA = queue.find((t) => t.id === taskA.id)!;
    const tB = queue.find((t) => t.id === taskB.id)!;

    expect(tA.readiness).toBe("BLOCKED");
    expect(tA.blockedBy).toEqual([taskB.tag]);
    expect(tB.readiness).toBe("BLOCKED");
    expect(tB.blockedBy).toEqual([taskA.tag]);
  });
});

describe("Task Queue Query Service - Progress & Filtering (RULE-22)", () => {
  // @verifies RULE-22
  it("[RULE-22] should accurately compute criteria completion status and percentage", async () => {
    await using workspace = await createFixtureWorkspace("modie-query-progress-");
    const task = await workspace.createTask({
      id: 601,
      slug: "progress-task",
      criteria: [
        { text: "Item 1 completed", completed: true },
        "Item 2 pending",
        { text: "Item 3 completed", completed: true },
      ],
    });

    const queue = await queryTaskQueue({ cwd: workspace.cwd });
    expect(queue.length).toBe(1);
    expect(queue[0]!.criteriaTotal).toBe(3);
    expect(queue[0]!.criteriaCompleted).toBe(2);
    expect(queue[0]!.criteriaProgress).toBe("2/3");
    expect(queue[0]!.allCriteriaSatisfied).toBe(false);
  });

  it("should filter by readyOnly and blockedOnly", async () => {
    await using workspace = await createFixtureWorkspace("modie-query-filter-");
    const taskA = await workspace.createTask({
      id: 701,
      slug: "ready-task",
      criteria: ["Ready item"],
    });
    const taskB = await workspace.createTask({
      id: 702,
      slug: "blocked-task",
      depends_on: [taskA.tag],
      criteria: ["Blocked item"],
    });

    const readyList = await queryTaskQueue({ cwd: workspace.cwd, readyOnly: true });
    expect(readyList.length).toBe(1);
    expect(readyList[0]!.id).toBe(taskA.id);

    const blockedList = await queryTaskQueue({ cwd: workspace.cwd, blockedOnly: true });
    expect(blockedList.length).toBe(1);
    expect(blockedList[0]!.id).toBe(taskB.id);
  });
});

describe("Task Status Inspection Service - getTaskStatus (RULE-22, RULE-25)", () => {
  // @verifies RULE-22, RULE-25
  it("[RULE-22][RULE-25] should retrieve detailed status and incomplete criteria for single task", async () => {
    await using workspace = await createFixtureWorkspace("modie-query-single-");
    const task = await workspace.createTask({
      id: 801,
      slug: "inspection-task",
      context: "Detailed inspection test.",
      links: [makeTestTag("ADR", 6), makeTestTag("RULE", 18)],
      criteria: [
        { text: "First item checked", completed: true },
        "Second item pending",
      ],
    });

    const status = await getTaskStatus(task.tag, { cwd: workspace.cwd });
    expect(status.id).toBe(task.id);
    expect(status.fullTaskId).toBe(task.tag);
    expect(status.readiness).toBe("READY");
    expect(status.criteriaTotal).toBe(2);
    expect(status.criteriaCompleted).toBe(1);
    expect(status.incompleteCriteria).toEqual(["Second item pending"]);
    expect(status.links).toEqual([makeTestTag("ADR", 6), makeTestTag("RULE", 18)]);
  });

  it("should throw descriptive error when inspecting non-existent task", async () => {
    await using workspace = await createFixtureWorkspace("modie-query-missing-");
    const missingTag = makeTestTag("TASK", 9999);
    await expect(getTaskStatus(missingTag, { cwd: workspace.cwd })).rejects.toThrow(
      /was not found among active tasks on disk/,
    );
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
