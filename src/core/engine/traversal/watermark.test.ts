/**
 * Unit tests for the task ID watermark resolver and active scanner.
 */

import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createFixtureWorkspace } from "../../platform/testing/index.ts";
import { MockVcsAdapter } from "../../platform/vcs/mock-adapter.ts";
import { formatArtifactTag, parseTaskBranch } from "../../domain/index.ts";
import {
  allocateTaskStrategy,
  detectGitBranch,
  inspectGitDeletedArtifactIds,
  inspectGitDeletedArtifacts,
  inspectMultiBranchActiveArtifactIds,
  inspectMultiBranchActiveArtifacts,
  nextSequence,
  prefixedAllocationStrategy,
  resolveNextArtifactId,
  resolveWatermark,
  scanActiveArtifactIds,
  scanActiveTasks,
  subtaskAllocationStrategy,
  trunkAllocationStrategy,
} from "./index.ts";

async function withWatermarkFixture(
  options: {
    branch?: string;
    activeFiles?: string[];
    deletedFiles?: string[];
    treeFiles?: Record<string, string[]>;
    config?: Record<string, string>;
  },
  fn: (cwd: string, vcs: MockVcsAdapter) => Promise<void>,
) {
  const dir = await mkdtemp(join(tmpdir(), "modie-watermark-fixture-"));
  const vcs = new MockVcsAdapter({
    insideWorkTree: true,
    currentBranch: options.branch ?? "dev",
    branches: Object.keys(options.treeFiles ?? {}).concat([
      options.branch ?? "dev",
    ]),
    deletedFilesList: options.deletedFiles ?? [],
    treeFiles: options.treeFiles ?? {},
    config: options.config,
  });

  if (options.activeFiles) {
    for (const f of options.activeFiles) {
      const full = join(dir, f);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, "# content");
    }
  }

  try {
    await fn(dir, vcs);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("Watermark Resolver - Active Task Scanner (RULE-1, ADR-6, RULE-34, RULE-35)", () => {
  // @verifies RULE-1, ADR-6, RULE-34, RULE-35
  it("[RULE-1][ADR-6][RULE-34][RULE-35] should recursively scan and detect active task files on disk", async () => {
    const workspace = await createFixtureWorkspace("active-scan-");

    // Create valid task files
    await workspace.createTask({
      id: 1,
      slug: "create-task-cli",
      scopeDir: "src",
    });
    await workspace.createTask({
      id: 4,
      slug: "watermark-resolver",
      scopeDir: "src/core",
    });

    const ignoredTaskTag = formatArtifactTag("TASK", 999);
    // Create non-task files and files in ignored directories
    await workspace.writeFile("src/README.md", "# Readme");
    await workspace.writeFile(
      `node_modules/pkg/ignored.${ignoredTaskTag}.md`,
      "# Ignored",
    );

    const tasks = await scanActiveTasks(workspace.cwd);
    expect(tasks.length).toBe(2);

    const taskIds = await scanActiveArtifactIds(workspace.cwd, "TASK");
    expect(taskIds.sort()).toEqual(["1", "4"]);

    await workspace.cleanup();
  });

  // @verifies ADR-6, RULE-34
  it("[ADR-6][RULE-34] should return empty array when no active tasks exist on disk", async () => {
    const workspace = await createFixtureWorkspace("empty-scan-");
    const taskIds = await scanActiveArtifactIds(workspace.cwd, "TASK");
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
      taskId: "2",
      slug: "task-id-allocation-and-rule-alignment",
    });

    expect(parseTaskBranch("task/4-task-id-watermark-resolver")).toEqual({
      taskId: "4",
      slug: "task-id-watermark-resolver",
    });

    expect(parseTaskBranch("task/2-1-subtask-test")).toEqual({
      taskId: "2-1",
      slug: "subtask-test",
    });

    expect(parseTaskBranch("task/42")).toEqual({
      taskId: "42",
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

    const deletedTasks = await inspectGitDeletedArtifacts(
      workspace.cwd,
      "TASK",
    );
    const deletedIds = await inspectGitDeletedArtifactIds(
      workspace.cwd,
      "TASK",
    );

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
    const expectedTag = formatArtifactTag("TASK", 1);
    await withWatermarkFixture({ branch: "dev" }, async (cwd, vcs) => {
      const details = await resolveWatermark({ cwd, vcs });
      expect(details.strategy).toBe("trunk");
      expect(details.nextId).toBe("1");
      expect(details.fullTaskId).toBe(expectedTag);
      expect(details.sequence).toBe(1);
    });
  });

  // @verifies ADR-6, ADR-9, RULE-21, RULE-35
  it("[ADR-6][ADR-9][RULE-21][RULE-35] should compute monotonic watermark across active and deleted tasks", async () => {
    const expectedTag = formatArtifactTag("TASK", 4);
    await withWatermarkFixture(
      {
        branch: "main",
        activeFiles: [`.modie/tasks/task-one.${formatArtifactTag("TASK", 1)}.md`],
        deletedFiles: [
          `task-two.${formatArtifactTag("TASK", 2)}.md`,
          `task-three.${formatArtifactTag("TASK", 3)}.md`,
        ],
      },
      async (cwd, vcs) => {
        const details = await resolveWatermark({ cwd, vcs });
        expect(details.strategy).toBe("trunk");
        expect(details.nextId).toBe("4");
        expect(details.fullTaskId).toBe(expectedTag);
      },
    );
  });

  // @verifies ADR-6, RULE-21
  it("[ADR-6][RULE-21] should advance monotonically when ALL active tasks on disk are deleted", async () => {
    await withWatermarkFixture(
      {
        branch: "dev",
        deletedFiles: [
          `task-1.${formatArtifactTag("TASK", 1)}.md`,
          `task-2.${formatArtifactTag("TASK", 2)}.md`,
          `task-3.${formatArtifactTag("TASK", 3)}.md`,
          `task-4.${formatArtifactTag("TASK", 4)}.md`,
          `task-5.${formatArtifactTag("TASK", 5)}.md`,
        ],
      },
      async (cwd, vcs) => {
        const nextId = await resolveNextArtifactId("TASK", { cwd, vcs });
        expect(nextId).toBe("6");
      },
    );
  });

  // @verifies ADR-9
  it("[ADR-9] should handle non-contiguous task IDs safely without collision", async () => {
    await withWatermarkFixture(
      {
        branch: "master",
        activeFiles: [
          `.modie/tasks/task-1.${formatArtifactTag("TASK", 1)}.md`,
          `.modie/tasks/task-5.${formatArtifactTag("TASK", 5)}.md`,
          `.modie/tasks/task-8.${formatArtifactTag("TASK", 8)}.md`,
        ],
        deletedFiles: [
          `task-2.${formatArtifactTag("TASK", 2)}.md`,
          `task-3.${formatArtifactTag("TASK", 3)}.md`,
        ],
      },
      async (cwd, vcs) => {
        const nextId = await resolveNextArtifactId("TASK", { cwd, vcs });
        expect(nextId).toBe("9");
      },
    );
  });
});

describe("Watermark Resolver - Branch-Aware Sub-Task Namespacing (ADR-9, RULE-21, RULE-35)", () => {
  // @verifies ADR-9, RULE-35
  it("[ADR-9][RULE-35] should allocate first sub-task ID under parent on task branch", async () => {
    const expectedTag = formatArtifactTag("TASK", "2-1");
    await withWatermarkFixture(
      {
        branch: "task/2-task-id-allocation-and-rule-alignment",
        activeFiles: [
          `.modie/tasks/task-1.${formatArtifactTag("TASK", 1)}.md`,
          `.modie/tasks/task-2.${formatArtifactTag("TASK", 2)}.md`,
          `.modie/tasks/task-3.${formatArtifactTag("TASK", 3)}.md`,
        ],
      },
      async (cwd, vcs) => {
        const details = await resolveWatermark({ cwd, vcs });
        expect(details.strategy).toBe("subtask");
        expect(details.parentId).toBe("2");
        expect(details.sequence).toBe(1);
        expect(details.nextId).toBe("2-1");
        expect(details.fullTaskId).toBe(expectedTag);
      },
    );
  });

  // @verifies ADR-9, RULE-35
  it("[ADR-9][RULE-35] should increment sub-task sequence monotonically for existing sub-tasks", async () => {
    const expectedTag = formatArtifactTag("TASK", "2-2");
    await withWatermarkFixture(
      {
        branch: "task/2-task-id-allocation-and-rule-alignment",
        activeFiles: [`.modie/tasks/task-sub.${formatArtifactTag("TASK", "2-1")}.md`],
      },
      async (cwd, vcs) => {
        const details = await resolveWatermark({ cwd, vcs });
        expect(details.strategy).toBe("subtask");
        expect(details.parentId).toBe("2");
        expect(details.sequence).toBe(2);
        expect(details.nextId).toBe("2-2");
        expect(details.fullTaskId).toBe(expectedTag);
      },
    );
  });

  // @verifies ADR-9, RULE-21, RULE-35
  it("[ADR-9][RULE-21][RULE-35] should respect deleted sub-tasks in git history to prevent subtask reuse", async () => {
    const expectedTag = formatArtifactTag("TASK", "2-3");
    await withWatermarkFixture(
      {
        branch: "task/2-something",
        deletedFiles: [
          `sub-1.${formatArtifactTag("TASK", "2-1")}.md`,
          `sub-2.${formatArtifactTag("TASK", "2-2")}.md`,
        ],
      },
      async (cwd, vcs) => {
        const details = await resolveWatermark({ cwd, vcs });
        expect(details.strategy).toBe("subtask");
        expect(details.parentId).toBe("2");
        expect(details.sequence).toBe(3);
        expect(details.nextId).toBe("2-3");
        expect(details.fullTaskId).toBe(expectedTag);
      },
    );
  });

  // @verifies ADR-9
  it("[ADR-9] should isolate sub-task namespaces between different parent branches", async () => {
    await withWatermarkFixture(
      {
        branch: "task/2-parent-two",
        activeFiles: [
          `.modie/tasks/sub-1.${formatArtifactTag("TASK", "2-1")}.md`,
          `.modie/tasks/sub-2.${formatArtifactTag("TASK", "3-1")}.md`,
          `.modie/tasks/sub-3.${formatArtifactTag("TASK", "3-2")}.md`,
        ],
      },
      async (cwd, vcs) => {
        const idForParent2 = await resolveNextArtifactId("TASK", { cwd, vcs });
        expect(idForParent2).toBe("2-2");
      },
    );

    await withWatermarkFixture(
      {
        branch: "task/3-parent-three",
        activeFiles: [
          `.modie/tasks/sub-1.${formatArtifactTag("TASK", "2-1")}.md`,
          `.modie/tasks/sub-2.${formatArtifactTag("TASK", "3-1")}.md`,
          `.modie/tasks/sub-3.${formatArtifactTag("TASK", "3-2")}.md`,
        ],
      },
      async (cwd, vcs) => {
        const idForParent3 = await resolveNextArtifactId("TASK", { cwd, vcs });
        expect(idForParent3).toBe("3-3");
      },
    );
  });
});

describe("Watermark Resolver - Author / Agent Prefix Namespacing (ADR-9, RULE-35)", () => {
  // @verifies ADR-9, RULE-35
  it("[ADR-9][RULE-35] should allocate first prefixed ID when explicit prefix is provided", async () => {
    const expectedTag = formatArtifactTag("TASK", "J1");
    await withWatermarkFixture(
      {
        branch: "feature/awesome-ui",
        activeFiles: [
          `.modie/tasks/task-1.${formatArtifactTag("TASK", 1)}.md`,
          `.modie/tasks/task-2.${formatArtifactTag("TASK", 2)}.md`,
        ],
      },
      async (cwd, vcs) => {
        const details = await resolveWatermark({ cwd, vcs, prefix: "J" });
        expect(details.strategy).toBe("prefixed");
        expect(details.prefix).toBe("J");
        expect(details.sequence).toBe(1);
        expect(details.nextId).toBe("J1");
        expect(details.fullTaskId).toBe(expectedTag);
      },
    );
  });

  // @verifies ADR-9, RULE-35
  it("[ADR-9][RULE-35] should advance from highest existing prefixed sequence (e.g. J101 -> J102)", async () => {
    const expectedTag = formatArtifactTag("TASK", "J102");
    await withWatermarkFixture(
      {
        branch: "feature/awesome-ui",
        activeFiles: [".modie/tasks/task-j101.TASK-J101.md"],
      },
      async (cwd, vcs) => {
        const details = await resolveWatermark({ cwd, vcs, prefix: "J" });
        expect(details.strategy).toBe("prefixed");
        expect(details.prefix).toBe("J");
        expect(details.sequence).toBe(102);
        expect(details.nextId).toBe("J102");
        expect(details.fullTaskId).toBe(expectedTag);
      },
    );
  });

  // @verifies ADR-9, RULE-35
  it("[ADR-9][RULE-35] should fall back to trunk monotonic integer on feature branches without prefix", async () => {
    const expectedTag = formatArtifactTag("TASK", 5);
    await withWatermarkFixture(
      {
        branch: "feature/no-prefix",
        activeFiles: [
          `.modie/tasks/task-1.${formatArtifactTag("TASK", 1)}.md`,
          `.modie/tasks/task-2.${formatArtifactTag("TASK", 2)}.md`,
          `.modie/tasks/task-3.${formatArtifactTag("TASK", 3)}.md`,
        ],
        deletedFiles: [`task-4.${formatArtifactTag("TASK", 4)}.md`],
      },
      async (cwd, vcs) => {
        const details = await resolveWatermark({ cwd, vcs });
        expect(details.strategy).toBe("trunk");
        expect(details.nextId).toBe("5");
        expect(details.fullTaskId).toBe(expectedTag);
      },
    );
  });

  // @verifies ADR-9, RULE-35
  it("[ADR-9][RULE-35] should allow forceTrunk to bypass branch subtask namespacing", async () => {
    const expectedTag = formatArtifactTag("TASK", 4);
    await withWatermarkFixture(
      {
        branch: "task/4-resolver",
        activeFiles: [
          `.modie/tasks/task-1.${formatArtifactTag("TASK", 1)}.md`,
          `.modie/tasks/task-2.${formatArtifactTag("TASK", 2)}.md`,
        ],
        deletedFiles: [`task-3.${formatArtifactTag("TASK", 3)}.md`],
      },
      async (cwd, vcs) => {
        const details = await resolveWatermark({ cwd, vcs, forceTrunk: true });
        expect(details.strategy).toBe("trunk");
        expect(details.nextId).toBe("4");
        expect(details.fullTaskId).toBe(expectedTag);
      },
    );
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
    expect(liveDetails.fullTaskId).toBe(formatArtifactTag("TASK", 4));

    // Resolving for trunk dev branch
    const trunkDetails = await resolveWatermark({
      branch: "dev",
      cwd: workspace.cwd,
    });
    expect(trunkDetails.strategy).toBe("trunk");
    expect(trunkDetails.nextId).toBe("4");
    expect(trunkDetails.fullTaskId).toBe(formatArtifactTag("TASK", 4));

    await workspace.cleanup();
  });
});

describe("Watermark Resolver - Multi-Subtype Monotonic Allocation (ADR-1, ADR-2, RULE-1, RULE-34, RULE-35)", () => {
  // @verifies ADR-1, ADR-2, RULE-1, RULE-35
  it("[ADR-1][ADR-2][RULE-1][RULE-35] should allocate next RULE ID monotonically across active and deleted IDs", async () => {
    const expectedTag = formatArtifactTag("RULE", 5);
    await withWatermarkFixture(
      {
        branch: "main",
        activeFiles: [
          `.modie/rules/rule-1.${formatArtifactTag("RULE", 1)}.md`,
          `.modie/rules/rule-2.${formatArtifactTag("RULE", 2)}.md`,
          `.modie/rules/rule-3.${formatArtifactTag("RULE", 3)}.md`,
        ],
        deletedFiles: [`rule-4.${formatArtifactTag("RULE", 4)}.md`],
      },
      async (cwd, vcs) => {
        const details = await resolveWatermark({
          subtype: "RULE",
          cwd,
          vcs,
        });
        expect(details.subtype).toBe("RULE");
        expect(details.nextId).toBe("5");
        expect(details.tag).toBe(expectedTag);
        expect(details.strategy).toBe("trunk");
      },
    );
  });

  // @verifies ADR-1, ADR-2, RULE-1, RULE-35
  it("[ADR-1][ADR-2][RULE-1][RULE-35] should allocate next ADR ID monotonically across active and deleted IDs", async () => {
    const expectedTag = formatArtifactTag("ADR", 3);
    await withWatermarkFixture(
      {
        branch: "main",
        activeFiles: [
          `.modie/adrs/adr-1.${formatArtifactTag("ADR", 1)}.md`,
          `.modie/adrs/adr-2.${formatArtifactTag("ADR", 2)}.md`,
        ],
      },
      async (cwd, vcs) => {
        const details = await resolveWatermark({
          subtype: "ADR",
          cwd,
          vcs,
        });
        expect(details.subtype).toBe("ADR");
        expect(details.nextId).toBe("3");
        expect(details.tag).toBe(expectedTag);
        expect(details.strategy).toBe("trunk");
      },
    );
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

    const ruleDetails = await resolveWatermark({
      subtype: "RULE",
      cwd: workspace.cwd,
    });
    expect(ruleDetails.subtype).toBe("RULE");
    expect(ruleDetails.nextId).toBe("3");
    expect(ruleDetails.tag).toBe(formatArtifactTag("RULE", 3));

    // Active ADR 1
    await workspace.createAdr({ id: 1, slug: "first-adr" });
    const adrDetails = await resolveWatermark({
      subtype: "ADR",
      cwd: workspace.cwd,
    });
    expect(adrDetails.subtype).toBe("ADR");
    expect(adrDetails.nextId).toBe("2");
    expect(adrDetails.tag).toBe(formatArtifactTag("ADR", 2));

    await workspace.cleanup();
  });
});

describe("Watermark Resolver - Multi-Branch Collision Guard & Discovery (RULE-1, RULE-33, RULE-34, RULE-35, ADR-1, ADR-2, ADR-6, ADR-9)", () => {
  // @verifies RULE-33, ADR-6, ADR-9, RULE-35
  it("[RULE-33][ADR-6][ADR-9][RULE-35] should incorporate active IDs from other branches during ID allocation", async () => {
    const expectedTag = formatArtifactTag("TASK", 6);
    await withWatermarkFixture(
      {
        branch: "dev",
        activeFiles: [
          `.modie/tasks/task-1.${formatArtifactTag("TASK", 1)}.md`,
          `.modie/tasks/task-2.${formatArtifactTag("TASK", 2)}.md`,
        ],
        deletedFiles: [`task-3.${formatArtifactTag("TASK", 3)}.md`],
        treeFiles: {
          "feature/other": [
            `src/.modie/tasks/task-4.${formatArtifactTag("TASK", 4)}.md`,
            `src/.modie/tasks/task-5.${formatArtifactTag("TASK", 5)}.md`,
          ],
        },
      },
      async (cwd, vcs) => {
        const details = await resolveWatermark({ cwd, vcs });
        expect(details.strategy).toBe("trunk");
        expect(details.nextId).toBe("6");
        expect(details.fullTaskId).toBe(expectedTag);
        expect(details.otherBranchActiveIds).toEqual(["4", "5"]);
      },
    );
  });

  // @verifies RULE-1, RULE-33, ADR-1, ADR-2, RULE-35
  it("[RULE-1][RULE-33][ADR-1][ADR-2][RULE-35] should allocate monotonic RULE and ADR IDs skipping other branch IDs", async () => {
    await withWatermarkFixture(
      {
        branch: "main",
        activeFiles: [`.modie/rules/rule-1.${formatArtifactTag("RULE", 1)}.md`],
        treeFiles: {
          "feature/other": [
            `src/.modie/rules/rule-2.${formatArtifactTag("RULE", 2)}.md`,
            `src/.modie/rules/rule-5.${formatArtifactTag("RULE", 5)}.md`,
          ],
        },
      },
      async (cwd, vcs) => {
        const ruleDetails = await resolveWatermark({
          subtype: "RULE",
          cwd,
          vcs,
        });
        expect(ruleDetails.nextId).toBe("6");
        expect(ruleDetails.tag).toBe(formatArtifactTag("RULE", 6));
      },
    );

    await withWatermarkFixture(
      {
        branch: "main",
        activeFiles: [
          `.modie/adrs/adr-1.${formatArtifactTag("ADR", 1)}.md`,
          `.modie/adrs/adr-2.${formatArtifactTag("ADR", 2)}.md`,
        ],
        treeFiles: {
          "feature/other": [
            `src/.modie/adrs/adr-3.${formatArtifactTag("ADR", 3)}.md`,
            `src/.modie/adrs/adr-7.${formatArtifactTag("ADR", 7)}.md`,
          ],
        },
      },
      async (cwd, vcs) => {
        const adrDetails = await resolveWatermark({
          subtype: "ADR",
          cwd,
          vcs,
        });
        expect(adrDetails.nextId).toBe("8");
        expect(adrDetails.tag).toBe(formatArtifactTag("ADR", 8));
      },
    );
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

describe("Sequence Calculator & Strategy Handlers (RULE-1, ADR-6, ADR-9, RULE-35)", () => {
  // @verifies RULE-1, ADR-9, RULE-35
  it("[RULE-1][ADR-9][RULE-35] should calculate next sequence from empty known IDs as sequence 1", () => {
    const alloc = nextSequence([], {
      match: /^[0-9]+$/,
      format: (n) => String(n),
    });
    expect(alloc.sequence).toBe(1);
    expect(alloc.id).toBe("1");
    expect(String(alloc)).toBe("1");
  });

  // @verifies RULE-1, ADR-9, RULE-35
  it("[RULE-1][ADR-9][RULE-35] should calculate max + 1 and skip existing collisions", () => {
    const alloc = nextSequence(["1", "2", "3", "5"], {
      match: /^[0-9]+$/,
      format: (n) => String(n),
    });
    // Max is 5, max + 1 = 6 (no collision)
    expect(alloc.sequence).toBe(6);
    expect(alloc.id).toBe("6");

    // Collision case: if 6 were also present
    const collisionAlloc = nextSequence(["1", "2", "3", "4"], {
      match: /^[0-9]+$/,
      format: (n) => String(n),
    });
    expect(collisionAlloc.sequence).toBe(5);
    expect(collisionAlloc.id).toBe("5");
  });

  // @verifies ADR-9, RULE-35
  it("[ADR-9][RULE-35] should correctly extract sequence with prefix regex and format function", () => {
    const alloc = nextSequence(["A1", "A2", "A99", "B100"], {
      match: /^A([0-9]+)$/i,
      format: (n) => `A${n}`,
    });
    expect(alloc.sequence).toBe(100);
    expect(alloc.id).toBe("A100");
  });

  // @verifies RULE-1, ADR-6, ADR-9
  it("[RULE-1][ADR-6][ADR-9] should allocate via trunk strategy", () => {
    const result = trunkAllocationStrategy.allocate(["10", "20", "5"]);
    expect(result.strategy).toBe("trunk");
    expect(result.sequence).toBe(21);
    expect(result.nextId).toBe("21");
  });

  // @verifies ADR-9
  it("[ADR-9] should allocate via subtask strategy under parent ID", () => {
    const result = subtaskAllocationStrategy.allocate(["4-1", "4-2"], "4");
    expect(result.strategy).toBe("subtask");
    expect(result.parentId).toBe("4");
    expect(result.sequence).toBe(3);
    expect(result.nextId).toBe("4-3");
  });

  // @verifies ADR-9
  it("[ADR-9] should allocate via prefixed strategy", () => {
    const result = prefixedAllocationStrategy.allocate(["J101", "J102"], "J");
    expect(result.strategy).toBe("prefixed");
    expect(result.prefix).toBe("J");
    expect(result.sequence).toBe(103);
    expect(result.nextId).toBe("J103");
  });

  // @verifies ADR-9, RULE-35
  it("[ADR-9][RULE-35] should delegate strategy selection appropriately in allocateTaskStrategy", () => {
    const trunkRes = allocateTaskStrategy(["1", "2"], {});
    expect(trunkRes.strategy).toBe("trunk");
    expect(trunkRes.nextId).toBe("3");

    const prefixRes = allocateTaskStrategy(["J1"], { prefix: "J" });
    expect(prefixRes.strategy).toBe("prefixed");
    expect(prefixRes.nextId).toBe("J2");

    const subtaskRes = allocateTaskStrategy(["5-1"], {
      taskBranchInfo: { taskId: "5" },
    });
    expect(subtaskRes.strategy).toBe("subtask");
    expect(subtaskRes.nextId).toBe("5-2");

    const forcedTrunkRes = allocateTaskStrategy(["5-1", "10"], {
      forceTrunk: true,
      prefix: "J",
      taskBranchInfo: { taskId: "5" },
    });
    expect(forcedTrunkRes.strategy).toBe("trunk");
    expect(forcedTrunkRes.nextId).toBe("11");
  });
});
