/**
 * Unit tests for the task ID watermark resolver and active scanner.
 * Complies with ADR-1, ADR-2, ADR-6, ADR-7, ADR-9, RULE-1, RULE-21, RULE-23, RULE-33, RULE-34, and RULE-35.
 * @verifies ADR-1, ADR-2, ADR-6, ADR-7, ADR-9, RULE-1, RULE-21, RULE-23, RULE-33, RULE-34, RULE-35
 */

import { describe, expect, it } from "bun:test";
import { createFixtureWorkspace, makeTestTag } from "../testing/index.ts";
import {
  detectGitBranch,
  inspectGitDeletedTaskIds,
  inspectGitDeletedTasks,
  inspectMultiBranchActiveArtifactIds,
  inspectMultiBranchActiveArtifacts,
  parseTaskBranch,
  resolveNextTaskId,
  resolveWatermark,
  scanActiveTaskIds,
  scanActiveTasks,
} from "./index.ts";

describe("Watermark Resolver - Active Task Scanner (RULE-1, ADR-6, RULE-34, RULE-35)", () => {
  // @verifies RULE-1, ADR-6, RULE-34, RULE-35
  it("[RULE-1][ADR-6][RULE-34][RULE-35] should recursively scan and detect active task files on disk", async () => {
    const workspace = await createFixtureWorkspace("active-scan-");

    // Create valid task files
    await workspace.createTask({
      id: 1,
      slug: "create-task-cli",
      subDir: "src/.tasks",
    });
    await workspace.createTask({
      id: 4,
      slug: "watermark-resolver",
      subDir: "src/core/.tasks",
    });

    const ignoredTaskTag = makeTestTag("TASK", 999);
    // Create non-task files and files in ignored directories
    await workspace.writeFile("src/README.md", "# Readme");
    await workspace.writeFile(
      `node_modules/pkg/ignored.${ignoredTaskTag}.md`,
      "# Ignored",
    );

    const tasks = await scanActiveTasks(workspace.cwd);
    expect(tasks.length).toBe(2);

    const taskIds = await scanActiveTaskIds(workspace.cwd);
    expect(taskIds.sort()).toEqual(["1", "4"]);

    await workspace.cleanup();
  });

  // @verifies ADR-6, RULE-34
  it("[ADR-6][RULE-34] should return empty array when no active tasks exist on disk", async () => {
    const workspace = await createFixtureWorkspace("empty-scan-");
    const taskIds = await scanActiveTaskIds(workspace.cwd);
    expect(taskIds).toEqual([]);
    await workspace.cleanup();
  });
});

describe("Watermark Resolver - Git History & Branch Detection (ADR-6, ADR-9, RULE-21, RULE-34, RULE-35)", () => {
  // @verifies ADR-9
  it("[ADR-9] should parse parent task ID and slug from task branches", () => {
    expect(
      parseTaskBranch("task/2-task-id-allocation-and-rule-alignment"),
    ).toEqual({
      parentId: "2",
      slug: "task-id-allocation-and-rule-alignment",
    });

    expect(parseTaskBranch("task/4-task-id-watermark-resolver")).toEqual({
      parentId: "4",
      slug: "task-id-watermark-resolver",
    });

    expect(parseTaskBranch("task/2-1-subtask-test")).toEqual({
      parentId: "2-1",
      slug: "subtask-test",
    });

    expect(parseTaskBranch("task/42")).toEqual({
      parentId: "42",
      slug: undefined,
    });

    expect(parseTaskBranch("dev")).toBeNull();
    expect(parseTaskBranch("main")).toBeNull();
    expect(parseTaskBranch("feature/user-auth")).toBeNull();
  });

  // @verifies ADR-6, RULE-21, RULE-34, RULE-35
  it("[ADR-6][RULE-21][RULE-34][RULE-35] should identify deleted task IDs from Git commit history in fixture workspace", async () => {
    const workspace = await createFixtureWorkspace("git-deleted-task-");
    await workspace.initGit({ defaultBranch: "main" });

    const task2 = await workspace.createTask({ id: 2, slug: "second-task" });
    const task3 = await workspace.createTask({ id: 3, slug: "third-task" });
    await workspace.gitCommit("feat: add tasks 2 and 3");

    await workspace.remove(task2);
    await workspace.remove(task3);
    await workspace.gitCommit("chore: remove completed tasks");

    const deletedTasks = await inspectGitDeletedTasks(workspace.cwd);
    const deletedIds = await inspectGitDeletedTaskIds(workspace.cwd);

    expect(deletedIds).toContain("2");
    expect(deletedIds).toContain("3");
    expect(deletedTasks.some((t) => t.id === "2")).toBe(true);
    expect(deletedTasks.some((t) => t.id === "3")).toBe(true);

    await workspace.cleanup();
  });

  // @verifies ADR-9, RULE-34
  it("[ADR-9][RULE-34] should detect current git branch accurately in fixture workspace", async () => {
    const workspace = await createFixtureWorkspace("git-branch-detect-");
    await workspace.initGit({ defaultBranch: "feature/custom-branch" });

    const branch = await detectGitBranch(workspace.cwd);
    expect(branch).toBe("feature/custom-branch");

    await workspace.cleanup();
  });
});

describe("Watermark Resolver - Trunk Monotonic Integer Progression (ADR-6, ADR-9, RULE-21, RULE-35)", () => {
  // @verifies ADR-6, ADR-9, RULE-35
  it("[ADR-6][ADR-9][RULE-35] should return next ID 1 for fresh repositories with no prior tasks", async () => {
    const expectedTag = makeTestTag("TASK", 1);
    const details = await resolveWatermark({
      activeIds: [],
      deletedIds: [],
      branch: "dev",
    });

    expect(details.strategy).toBe("trunk");
    expect(details.nextId).toBe("1");
    expect(details.fullTaskId).toBe(expectedTag);
    expect(details.sequence).toBe(1);
  });

  // @verifies ADR-6, ADR-9, RULE-21, RULE-35
  it("[ADR-6][ADR-9][RULE-21][RULE-35] should compute monotonic watermark across active and deleted tasks", async () => {
    const expectedTag = makeTestTag("TASK", 4);
    const details = await resolveWatermark({
      activeIds: ["1"],
      deletedIds: ["2", "3"],
      branch: "main",
    });

    expect(details.strategy).toBe("trunk");
    expect(details.nextId).toBe("4");
    expect(details.fullTaskId).toBe(expectedTag);
  });

  // @verifies ADR-6, RULE-21
  it("[ADR-6][RULE-21] should advance monotonically when ALL active tasks on disk are deleted", async () => {
    const nextId = await resolveNextTaskId({
      activeIds: [],
      deletedIds: ["1", "2", "3", "4", "5"],
      branch: "dev",
    });

    expect(nextId).toBe("6");
  });

  // @verifies ADR-9
  it("[ADR-9] should handle non-contiguous task IDs safely without collision", async () => {
    const nextId = await resolveNextTaskId({
      activeIds: ["1", "5", "8"],
      deletedIds: ["2", "3"],
      branch: "master",
    });

    expect(nextId).toBe("9");
  });
});

describe("Watermark Resolver - Branch-Aware Sub-Task Namespacing (ADR-9, RULE-21, RULE-35)", () => {
  // @verifies ADR-9, RULE-35
  it("[ADR-9][RULE-35] should allocate first sub-task ID under parent on task branch", async () => {
    const expectedTag = makeTestTag("TASK", "2-1");
    const details = await resolveWatermark({
      activeIds: ["1", "2", "3"],
      deletedIds: [],
      branch: "task/2-task-id-allocation-and-rule-alignment",
    });

    expect(details.strategy).toBe("subtask");
    expect(details.parentId).toBe("2");
    expect(details.sequence).toBe(1);
    expect(details.nextId).toBe("2-1");
    expect(details.fullTaskId).toBe(expectedTag);
  });

  // @verifies ADR-9, RULE-35
  it("[ADR-9][RULE-35] should increment sub-task sequence monotonically for existing sub-tasks", async () => {
    const expectedTag = makeTestTag("TASK", "2-2");
    const details = await resolveWatermark({
      activeIds: ["2-1"],
      deletedIds: [],
      branch: "task/2-task-id-allocation-and-rule-alignment",
    });

    expect(details.strategy).toBe("subtask");
    expect(details.parentId).toBe("2");
    expect(details.sequence).toBe(2);
    expect(details.nextId).toBe("2-2");
    expect(details.fullTaskId).toBe(expectedTag);
  });

  // @verifies ADR-9, RULE-21, RULE-35
  it("[ADR-9][RULE-21][RULE-35] should respect deleted sub-tasks in git history to prevent subtask reuse", async () => {
    const expectedTag = makeTestTag("TASK", "2-3");
    const details = await resolveWatermark({
      activeIds: [],
      deletedIds: ["2-1", "2-2"],
      branch: "task/2-something",
    });

    expect(details.strategy).toBe("subtask");
    expect(details.parentId).toBe("2");
    expect(details.sequence).toBe(3);
    expect(details.nextId).toBe("2-3");
    expect(details.fullTaskId).toBe(expectedTag);
  });

  // @verifies ADR-9
  it("[ADR-9] should isolate sub-task namespaces between different parent branches", async () => {
    const idForParent2 = await resolveNextTaskId({
      activeIds: ["2-1", "3-1", "3-2"],
      deletedIds: [],
      branch: "task/2-parent-two",
    });

    const idForParent3 = await resolveNextTaskId({
      activeIds: ["2-1", "3-1", "3-2"],
      deletedIds: [],
      branch: "task/3-parent-three",
    });

    expect(idForParent2).toBe("2-2");
    expect(idForParent3).toBe("3-3");
  });
});

describe("Watermark Resolver - Author / Agent Prefix Namespacing (ADR-9, RULE-35)", () => {
  // @verifies ADR-9, RULE-35
  it("[ADR-9][RULE-35] should allocate first prefixed ID when explicit prefix is provided", async () => {
    const expectedTag = makeTestTag("TASK", "J1");
    const details = await resolveWatermark({
      activeIds: ["1", "2"],
      deletedIds: [],
      prefix: "J",
      branch: "feature/awesome-ui",
    });

    expect(details.strategy).toBe("prefixed");
    expect(details.prefix).toBe("J");
    expect(details.sequence).toBe(1);
    expect(details.nextId).toBe("J1");
    expect(details.fullTaskId).toBe(expectedTag);
  });

  // @verifies ADR-9, RULE-35
  it("[ADR-9][RULE-35] should advance from highest existing prefixed sequence (e.g. J101 -> J102)", async () => {
    const expectedTag = makeTestTag("TASK", "J102");
    const details = await resolveWatermark({
      activeIds: ["J101"],
      deletedIds: [],
      prefix: "J",
      branch: "feature/awesome-ui",
    });

    expect(details.strategy).toBe("prefixed");
    expect(details.prefix).toBe("J");
    expect(details.sequence).toBe(102);
    expect(details.nextId).toBe("J102");
    expect(details.fullTaskId).toBe(expectedTag);
  });

  // @verifies ADR-9, RULE-35
  it("[ADR-9][RULE-35] should fall back to trunk monotonic integer on feature branches without prefix", async () => {
    const expectedTag = makeTestTag("TASK", 5);
    const details = await resolveWatermark({
      activeIds: ["1", "2", "3"],
      deletedIds: ["4"],
      branch: "feature/no-prefix",
    });

    expect(details.strategy).toBe("trunk");
    expect(details.nextId).toBe("5");
    expect(details.fullTaskId).toBe(expectedTag);
  });

  // @verifies ADR-9, RULE-35
  it("[ADR-9][RULE-35] should allow forceTrunk to bypass branch subtask namespacing", async () => {
    const expectedTag = makeTestTag("TASK", 4);
    const details = await resolveWatermark({
      activeIds: ["1", "2"],
      deletedIds: ["3"],
      branch: "task/4-resolver",
      forceTrunk: true,
    });

    expect(details.strategy).toBe("trunk");
    expect(details.nextId).toBe("4");
    expect(details.fullTaskId).toBe(expectedTag);
  });
});

describe("Watermark Resolver - Integrated Workspace Verification (ADR-6, ADR-9, RULE-21, RULE-34, RULE-35)", () => {
  // @verifies ADR-6, ADR-9, RULE-21, RULE-34, RULE-35
  it("[ADR-6][ADR-9][RULE-21][RULE-34][RULE-35] should resolve watermark accurately in an integrated workspace", async () => {
    const workspace = await createFixtureWorkspace("live-watermark-");
    await workspace.initGit({ defaultBranch: "dev" });

    // Create active task 1
    await workspace.createTask({ id: 1, slug: "first-task" });

    // Create and delete task 2 and 3
    const task2 = await workspace.createTask({ id: 2, slug: "second-task" });
    const task3 = await workspace.createTask({ id: 3, slug: "third-task" });
    await workspace.gitCommit("feat: initial tasks");

    await workspace.remove(task2);
    await workspace.remove(task3);
    await workspace.gitCommit("chore: complete tasks 2 and 3");

    const liveDetails = await resolveWatermark({ cwd: workspace.cwd });
    expect(liveDetails.activeIds).toEqual(["1"]);
    expect(liveDetails.deletedIds).toContain("2");
    expect(liveDetails.deletedIds).toContain("3");
    expect(liveDetails.nextId).toBe("4");
    expect(liveDetails.fullTaskId).toBe(makeTestTag("TASK", 4));

    // Resolving for trunk dev branch
    const trunkDetails = await resolveWatermark({ branch: "dev", cwd: workspace.cwd });
    expect(trunkDetails.strategy).toBe("trunk");
    expect(trunkDetails.nextId).toBe("4");
    expect(trunkDetails.fullTaskId).toBe(makeTestTag("TASK", 4));

    await workspace.cleanup();
  });
});

describe("Watermark Resolver - Multi-Subtype Monotonic Allocation (ADR-1, ADR-2, RULE-1, RULE-34, RULE-35)", () => {
  // @verifies ADR-1, ADR-2, RULE-1, RULE-35
  it("[ADR-1][ADR-2][RULE-1][RULE-35] should allocate next RULE ID monotonically across active and deleted IDs", async () => {
    const expectedTag = makeTestTag("RULE", 5);
    const details = await resolveWatermark({
      subtype: "RULE",
      activeIds: ["1", "2", "3"],
      deletedIds: ["4"],
    });

    expect(details.subtype).toBe("RULE");
    expect(details.nextId).toBe("5");
    expect(details.tag).toBe(expectedTag);
    expect(details.strategy).toBe("trunk");
  });

  // @verifies ADR-1, ADR-2, RULE-1, RULE-35
  it("[ADR-1][ADR-2][RULE-1][RULE-35] should allocate next ADR ID monotonically across active and deleted IDs", async () => {
    const expectedTag = makeTestTag("ADR", 3);
    const details = await resolveWatermark({
      subtype: "ADR",
      activeIds: ["1", "2"],
      deletedIds: [],
    });

    expect(details.subtype).toBe("ADR");
    expect(details.nextId).toBe("3");
    expect(details.tag).toBe(expectedTag);
    expect(details.strategy).toBe("trunk");
  });

  // @verifies ADR-1, ADR-2, RULE-1, RULE-34, RULE-35
  it("[ADR-1][ADR-2][RULE-1][RULE-34][RULE-35] should resolve RULE and ADR watermarks accurately in an integrated workspace", async () => {
    const workspace = await createFixtureWorkspace("live-gov-watermark-");
    await workspace.initGit({ defaultBranch: "main" });

    // Active rule 1 and deleted rule 2
    await workspace.createRule({ id: 1, slug: "first-rule" });
    const rule2 = await workspace.createRule({ id: 2, slug: "second-rule" });
    await workspace.gitCommit("feat: rules 1 and 2");
    await workspace.remove(rule2);
    await workspace.gitCommit("chore: remove rule 2");

    const ruleDetails = await resolveWatermark({ subtype: "RULE", cwd: workspace.cwd });
    expect(ruleDetails.subtype).toBe("RULE");
    expect(ruleDetails.nextId).toBe("3");
    expect(ruleDetails.tag).toBe(makeTestTag("RULE", 3));

    // Active ADR 1
    await workspace.createAdr({ id: 1, slug: "first-adr" });
    const adrDetails = await resolveWatermark({ subtype: "ADR", cwd: workspace.cwd });
    expect(adrDetails.subtype).toBe("ADR");
    expect(adrDetails.nextId).toBe("2");
    expect(adrDetails.tag).toBe(makeTestTag("ADR", 2));

    await workspace.cleanup();
  });
});

describe("Watermark Resolver - Multi-Branch Collision Guard & Discovery (RULE-1, RULE-33, RULE-34, RULE-35, ADR-1, ADR-2, ADR-6, ADR-9)", () => {
  // @verifies RULE-33, ADR-6, ADR-9, RULE-35
  it("[RULE-33][ADR-6][ADR-9][RULE-35] should incorporate active IDs from other branches during ID allocation", async () => {
    const expectedTag = makeTestTag("TASK", 6);
    const details = await resolveWatermark({
      activeIds: ["1", "2"],
      otherBranchActiveIds: ["4", "5"],
      deletedIds: ["3"],
      branch: "dev",
    });

    expect(details.strategy).toBe("trunk");
    expect(details.nextId).toBe("6");
    expect(details.fullTaskId).toBe(expectedTag);
    expect(details.otherBranchActiveIds).toEqual(["4", "5"]);
  });

  // @verifies RULE-1, RULE-33, ADR-1, ADR-2, RULE-35
  it("[RULE-1][RULE-33][ADR-1][ADR-2][RULE-35] should allocate monotonic RULE and ADR IDs skipping other branch IDs", async () => {
    const ruleDetails = await resolveWatermark({
      subtype: "RULE",
      activeIds: ["1"],
      otherBranchActiveIds: ["2", "5"],
      deletedIds: [],
    });

    expect(ruleDetails.nextId).toBe("6");
    expect(ruleDetails.tag).toBe(makeTestTag("RULE", 6));

    const adrDetails = await resolveWatermark({
      subtype: "ADR",
      activeIds: ["1", "2"],
      otherBranchActiveIds: ["3", "7"],
      deletedIds: [],
    });

    expect(adrDetails.nextId).toBe("8");
    expect(adrDetails.tag).toBe(makeTestTag("ADR", 8));
  });

  // @verifies RULE-33, RULE-34, RULE-35
  it("[RULE-33][RULE-34][RULE-35] should discover active artifacts across git branches using git tree queries", async () => {
    const workspace = await createFixtureWorkspace("multibranch-");

    await workspace.initGit({ defaultBranch: "main", initialCommit: true });
    await workspace.writeFile("README.md", "# Multi-Branch Test\n");
    await workspace.gitCommit("chore: init");

    // Create branch feature/new-rule
    await workspace.gitCheckout("feature/new-rule", { create: true });
    const rule = await workspace.createRule({
      id: 50,
      slug: "sample-rule",
      body: "# Sample Rule 50\n",
    });
    await workspace.gitCommit("feat: add sample rule");

    // Switch back to main
    await workspace.gitCheckout("main");

    // Inspect active artifacts across other branches
    const artifacts = await inspectMultiBranchActiveArtifacts(
      workspace.cwd,
      "RULE",
      { excludeCurrent: true },
    );
    expect(artifacts.length).toBe(1);
    expect(artifacts[0]?.tag).toBe(rule.tag);
    expect(artifacts[0]?.id).toBe("50");

    const activeIds = await inspectMultiBranchActiveArtifactIds(
      workspace.cwd,
      "RULE",
      { excludeCurrent: true },
    );
    expect(activeIds).toEqual(["50"]);

    await workspace.cleanup();
  });
});
