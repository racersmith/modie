/**
 * Unit tests for the task ID watermark resolver and active scanner.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 */

import { describe, expect, it } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  scanActiveTaskIds,
  scanActiveTasks,
  inspectGitDeletedTaskIds,
  inspectGitDeletedTasks,
  inspectMultiBranchActiveArtifacts,
  inspectMultiBranchActiveArtifactIds,
  detectGitBranch,
  parseTaskBranch,
  resolveWatermark,
  resolveNextTaskId,
} from "./index.ts";

describe("Watermark Resolver - Active Task Scanner", () => {
  // @verifies RULE-1, ADR-6
  it("[RULE-1][ADR-6] should recursively scan and detect active task files on disk", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-active-scan-"));

    try {
      // Create nested directory structure including .tasks/
      await mkdir(join(tempDir, "src", ".tasks"), { recursive: true });
      await mkdir(join(tempDir, "src", "core", ".tasks"), { recursive: true });
      await mkdir(join(tempDir, "node_modules", "pkg"), { recursive: true });

      // Create valid task files
      await writeFile(
        join(tempDir, "src", ".tasks", "create-task-cli.TASK-1.md"),
        "# Task 1",
      );
      await writeFile(
        join(tempDir, "src", "core", ".tasks", "watermark-resolver.TASK-4.md"),
        "# Task 4",
      );

      // Create non-task files and files in ignored directories
      await writeFile(join(tempDir, "src", "README.md"), "# Readme");
      await writeFile(
        join(tempDir, "node_modules", "pkg", "ignored.TASK-999.md"),
        "# Ignored",
      );

      const tasks = await scanActiveTasks(tempDir);
      expect(tasks.length).toBe(2);

      const taskIds = await scanActiveTaskIds(tempDir);
      expect(taskIds.sort()).toEqual(["1", "4"]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  // @verifies ADR-6
  it("[ADR-6] should return empty array when no active tasks exist on disk", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-empty-scan-"));
    try {
      const taskIds = await scanActiveTaskIds(tempDir);
      expect(taskIds).toEqual([]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe("Watermark Resolver - Git History & Branch Detection", () => {
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

  // @verifies ADR-6, RULE-21
  it("[ADR-6][RULE-21] should identify deleted task IDs from real Git commit history", async () => {
    const deletedTasks = await inspectGitDeletedTasks();
    const deletedIds = await inspectGitDeletedTaskIds();

    // In this repo, TASK-2 and TASK-3 were deleted per RULE-21
    expect(deletedIds).toContain("2");
    expect(deletedIds).toContain("3");
    expect(deletedTasks.some((t) => t.id === "2")).toBe(true);
    expect(deletedTasks.some((t) => t.id === "3")).toBe(true);
  });

  // @verifies ADR-9
  it("[ADR-9] should detect current git branch accurately", async () => {
    const branch = await detectGitBranch();
    expect(typeof branch).toBe("string");
    expect(branch!.length).toBeGreaterThan(0);
  });
});

describe("Watermark Resolver - Trunk Monotonic Integer Progression", () => {
  // @verifies ADR-6, ADR-9
  it("[ADR-6][ADR-9] should return TASK-1 for fresh repositories with no prior tasks", async () => {
    const details = await resolveWatermark({
      activeIds: [],
      deletedIds: [],
      branch: "dev",
    });

    expect(details.strategy).toBe("trunk");
    expect(details.nextId).toBe("1");
    expect(details.fullTaskId).toBe("TASK-1");
    expect(details.sequence).toBe(1);
  });

  // @verifies ADR-6, ADR-9, RULE-21
  it("[ADR-6][ADR-9][RULE-21] should compute monotonic watermark across active and deleted tasks", async () => {
    // TASK-1 is active; TASK-2 and TASK-3 were completed and deleted
    const details = await resolveWatermark({
      activeIds: ["1"],
      deletedIds: ["2", "3"],
      branch: "main",
    });

    expect(details.strategy).toBe("trunk");
    expect(details.nextId).toBe("4");
    expect(details.fullTaskId).toBe("TASK-4");
  });

  // @verifies ADR-6, RULE-21
  it("[ADR-6][RULE-21] should advance monotonically when ALL active tasks on disk are deleted", async () => {
    // All tasks 1, 2, 3, 4, 5 were completed and deleted; working tree is empty
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

describe("Watermark Resolver - Branch-Aware Sub-Task Namespacing (ADR-9)", () => {
  // @verifies ADR-9
  it("[ADR-9] should allocate first sub-task ID under parent on task branch", async () => {
    const details = await resolveWatermark({
      activeIds: ["1", "2", "3"],
      deletedIds: [],
      branch: "task/2-task-id-allocation-and-rule-alignment",
    });

    expect(details.strategy).toBe("subtask");
    expect(details.parentId).toBe("2");
    expect(details.sequence).toBe(1);
    expect(details.nextId).toBe("2-1");
    expect(details.fullTaskId).toBe("TASK-2-1");
  });

  // @verifies ADR-9
  it("[ADR-9] should increment sub-task sequence monotonically for existing sub-tasks", async () => {
    const details = await resolveWatermark({
      activeIds: ["2-1"],
      deletedIds: [],
      branch: "task/2-task-id-allocation-and-rule-alignment",
    });

    expect(details.strategy).toBe("subtask");
    expect(details.parentId).toBe("2");
    expect(details.sequence).toBe(2);
    expect(details.nextId).toBe("2-2");
    expect(details.fullTaskId).toBe("TASK-2-2");
  });

  // @verifies ADR-9, RULE-21
  it("[ADR-9][RULE-21] should respect deleted sub-tasks in git history to prevent subtask reuse", async () => {
    const details = await resolveWatermark({
      activeIds: [],
      deletedIds: ["2-1", "2-2"],
      branch: "task/2-something",
    });

    expect(details.strategy).toBe("subtask");
    expect(details.parentId).toBe("2");
    expect(details.sequence).toBe(3);
    expect(details.nextId).toBe("2-3");
    expect(details.fullTaskId).toBe("TASK-2-3");
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

describe("Watermark Resolver - Author / Agent Prefix Namespacing (ADR-9)", () => {
  // @verifies ADR-9
  it("[ADR-9] should allocate first prefixed ID when explicit prefix is provided", async () => {
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
    expect(details.fullTaskId).toBe("TASK-J1");
  });

  // @verifies ADR-9
  it("[ADR-9] should advance from highest existing prefixed sequence (e.g. J101 -> J102)", async () => {
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
    expect(details.fullTaskId).toBe("TASK-J102");
  });

  // @verifies ADR-9
  it("[ADR-9] should fall back to trunk monotonic integer on feature branches without prefix", async () => {
    const details = await resolveWatermark({
      activeIds: ["1", "2", "3"],
      deletedIds: ["4"],
      branch: "feature/no-prefix",
    });

    expect(details.strategy).toBe("trunk");
    expect(details.nextId).toBe("5");
    expect(details.fullTaskId).toBe("TASK-5");
  });

  // @verifies ADR-9
  it("[ADR-9] should allow forceTrunk to bypass branch subtask namespacing", async () => {
    const details = await resolveWatermark({
      activeIds: ["1", "2"],
      deletedIds: ["3"],
      branch: "task/4-resolver",
      forceTrunk: true,
    });

    expect(details.strategy).toBe("trunk");
    expect(details.nextId).toBe("4");
    expect(details.fullTaskId).toBe("TASK-4");
  });
});

describe("Watermark Resolver - Live Integration on Modie Repository", () => {
  // @verifies ADR-6, ADR-9, RULE-21
  it("[ADR-6][ADR-9][RULE-21] should resolve live watermark on modie repository", async () => {
    const liveDetails = await resolveWatermark();
    expect(liveDetails.activeIds.length).toBeGreaterThanOrEqual(0);
    expect(liveDetails.deletedIds).toContain("2");
    expect(liveDetails.deletedIds).toContain("3");
    expect(typeof liveDetails.nextId).toBe("string");

    // Resolving for trunk dev branch
    const trunkDetails = await resolveWatermark({ branch: "dev" });
    expect(trunkDetails.strategy).toBe("trunk");
    const allKnown = [...trunkDetails.activeIds, ...trunkDetails.deletedIds];
    expect(allKnown).toContain("1");
    expect(allKnown).toContain("2");
    expect(allKnown).toContain("3");
    expect(allKnown).toContain("4");
    expect(allKnown).toContain("5");
    const knownInts = allKnown
      .filter((id) => /^[0-9]+$/.test(id))
      .map((id) => parseInt(id, 10));
    const expectedNextInt = Math.max(...knownInts) + 1;
    expect(trunkDetails.nextId).toBe(String(expectedNextInt));
    expect(trunkDetails.fullTaskId).toBe(`TASK-${expectedNextInt}`);
  });
});

describe("Watermark Resolver - Multi-Subtype Monotonic Allocation (ADR-1, ADR-2, RULE-1)", () => {
  // @verifies ADR-1, ADR-2, RULE-1
  it("[ADR-1][ADR-2][RULE-1] should allocate next RULE ID monotonically across active and deleted IDs", async () => {
    const details = await resolveWatermark({
      subtype: "RULE",
      activeIds: ["1", "2", "3"],
      deletedIds: ["4"],
    });

    expect(details.subtype).toBe("RULE");
    expect(details.nextId).toBe("5");
    expect(details.tag).toBe("RULE-5");
    expect(details.strategy).toBe("trunk");
  });

  // @verifies ADR-1, ADR-2, RULE-1
  it("[ADR-1][ADR-2][RULE-1] should allocate next ADR ID monotonically across active and deleted IDs", async () => {
    const details = await resolveWatermark({
      subtype: "ADR",
      activeIds: ["1", "2"],
      deletedIds: [],
    });

    expect(details.subtype).toBe("ADR");
    expect(details.nextId).toBe("3");
    expect(details.tag).toBe("ADR-3");
    expect(details.strategy).toBe("trunk");
  });

  // @verifies ADR-1, ADR-2, RULE-1
  it("[ADR-1][ADR-2][RULE-1] should resolve live RULE and ADR watermarks accurately on modie repository", async () => {
    const ruleDetails = await resolveWatermark({ subtype: "RULE" });
    expect(ruleDetails.subtype).toBe("RULE");
    const ruleNum = parseInt(ruleDetails.nextId, 10);
    // Highest rule on disk is currently at least 29
    expect(ruleNum).toBeGreaterThanOrEqual(30);
    expect(ruleDetails.tag).toBe(`RULE-${ruleNum}`);

    const adrDetails = await resolveWatermark({ subtype: "ADR" });
    expect(adrDetails.subtype).toBe("ADR");
    const adrNum = parseInt(adrDetails.nextId, 10);
    expect(adrNum).toBeGreaterThanOrEqual(10);
    expect(adrDetails.tag).toBe(`ADR-${adrNum}`);
  });
});

describe("Watermark Resolver - Multi-Branch Collision Guard & Discovery (RULE-33)", () => {
  const execFileAsync = promisify(execFile);

  // @verifies RULE-33, ADR-6, ADR-9
  it("[RULE-33][ADR-6][ADR-9] should incorporate active IDs from other branches during ID allocation", async () => {
    // Current branch has TASK-1 and TASK-2 active; another branch has TASK-4 and TASK-5 active
    const details = await resolveWatermark({
      activeIds: ["1", "2"],
      otherBranchActiveIds: ["4", "5"],
      deletedIds: ["3"],
      branch: "dev",
    });

    expect(details.strategy).toBe("trunk");
    expect(details.nextId).toBe("6");
    expect(details.fullTaskId).toBe("TASK-6");
    expect(details.otherBranchActiveIds).toEqual(["4", "5"]);
  });

  // @verifies RULE-1, RULE-33, ADR-1, ADR-2
  it("[RULE-1][RULE-33][ADR-1][ADR-2] should allocate monotonic RULE and ADR IDs skipping other branch IDs", async () => {
    const ruleDetails = await resolveWatermark({
      subtype: "RULE",
      activeIds: ["1"],
      otherBranchActiveIds: ["2", "5"],
      deletedIds: [],
    });

    expect(ruleDetails.nextId).toBe("6");
    expect(ruleDetails.tag).toBe("RULE-6");

    const adrDetails = await resolveWatermark({
      subtype: "ADR",
      activeIds: ["1", "2"],
      otherBranchActiveIds: ["3", "7"],
      deletedIds: [],
    });

    expect(adrDetails.nextId).toBe("8");
    expect(adrDetails.tag).toBe("ADR-8");
  });

  // @verifies RULE-33
  it("[RULE-33] should discover active artifacts across git branches using git tree queries", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-multibranch-test-"));

    try {
      await execFileAsync("git", ["init", "-q", "-b", "main"], { cwd: tempDir });
      await execFileAsync("git", ["config", "user.name", "Tester"], { cwd: tempDir });
      await execFileAsync("git", ["config", "user.email", "tester@test.local"], { cwd: tempDir });

      // Initial commit on main
      await writeFile(join(tempDir, "README.md"), "# Multi-Branch Test\n");
      await execFileAsync("git", ["add", "README.md"], { cwd: tempDir });
      await execFileAsync("git", ["commit", "-m", "chore: init"], { cwd: tempDir });

      // Create branch feature/new-rule
      await execFileAsync("git", ["checkout", "-b", "feature/new-rule"], { cwd: tempDir });
      await mkdir(join(tempDir, ".modie", "rules"), { recursive: true });
      await writeFile(
        join(tempDir, ".modie", "rules", "sample-rule.RULE-50.md"),
        "# Sample Rule 50\n",
      );
      await execFileAsync("git", ["add", "-A"], { cwd: tempDir });
      await execFileAsync("git", ["commit", "-m", "feat: add RULE-50"], { cwd: tempDir });

      // Switch back to main
      await execFileAsync("git", ["checkout", "main"], { cwd: tempDir });

      // Inspect active artifacts across other branches
      const artifacts = await inspectMultiBranchActiveArtifacts(
        tempDir,
        "RULE",
        { excludeCurrent: true },
      );
      expect(artifacts.length).toBe(1);
      expect(artifacts[0]?.tag).toBe("RULE-50");
      expect(artifacts[0]?.id).toBe("50");

      const activeIds = await inspectMultiBranchActiveArtifactIds(
        tempDir,
        "RULE",
        { excludeCurrent: true },
      );
      expect(activeIds).toEqual(["50"]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

