import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createFixtureWorkspace,
  type FixtureWorkspace,
} from "../../platform/testing/index.ts";
import {
  ActiveSubtaskPendingError,
  ArtifactCollisionError,
  ForeignBranchAncestryError,
  TaskIncompleteError,
} from "./errors.ts";
import {
  assertNoActiveSubtasks,
  assertNoCollisions,
  assertSourceBranchExists,
  assertTargetBranchExists,
  assertTaskCompleted,
  computeTaskBranchTopology,
  detectArtifactCollisions,
  executeBranchMerge,
  mergeTaskBranch,
  resolveMergeTarget,
  startTaskBranch,
} from "./branching.ts";
import { defaultVcsAdapter } from "../../platform/vcs/git-cli-adapter.ts";
import {
  formatArtifactTag,
  formatTaskBranch,
  parseSubtaskId,
  taskBranchBaseConfigKey,
} from "../../domain/index.ts";

describe("Task Branching Service (RULE-28)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-branching-test-");
    await workspace.initGit({ defaultBranch: "main", initialCommit: true });

    // Create dev trunk branch
    await Bun.$`git checkout -b dev`.cwd(workspace.cwd).quiet();

    // Create .modie/config.json with protected branches: ["main"] and trunk: "dev"
    await workspace.writeFile(
      ".modie/config.json",
      JSON.stringify({
        git: {
          trunk: "dev",
          protectedBranches: ["main"],
        },
      }),
    );
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  it("should format canonical task branch names", () => {
    expect(formatTaskBranch("11", "branching-automation")).toBe(
      "task/11-branching-automation",
    );
    expect(formatTaskBranch("TASK-2-1", "create-template")).toBe(
      "task/2-1-create-template",
    );
  });

  it("should parse subtask parent ID and sequence tokens per ADR-9", () => {
    expect(parseSubtaskId("2-1")).toEqual({ parentId: "2", sequence: "1" });
    expect(parseSubtaskId("TASK-11-2")).toEqual({
      parentId: "11",
      sequence: "2",
    });
    expect(parseSubtaskId("TASK-J101-3")).toEqual({
      parentId: "J101",
      sequence: "3",
    });
    expect(parseSubtaskId("11")).toBeNull();
    expect(parseSubtaskId("TASK-11")).toBeNull();
  });

  it("should compute topology for a root task from trunk", async () => {
    const task = await workspace.createTask({
      id: 100,
      slug: "root-feat",
      criteria: ["Item"],
    });

    const topo = await computeTaskBranchTopology(task.tag, {
      cwd: workspace.cwd,
    });
    expect(topo.taskId).toBe(task.id);
    expect(topo.slug).toBe(task.slug);
    expect(topo.branchName).toBe(`task/100-${task.slug}`);
    expect(topo.isSubtask).toBe(false);
    expect(topo.expectedBaseBranch).toBe("dev");
    expect(topo.isCurrentBranchProtected).toBe(false);
    expect(topo.trunkBranch).toBe("dev");
    expect(topo.protectedBranches).toEqual(["main"]);
  });

  it("should guard against starting a task from a protected branch", async () => {
    const task = await workspace.createTask({
      id: 101,
      slug: "protected-test",
      criteria: ["Item"],
    });

    // Switch to protected branch 'main'
    await Bun.$`git checkout main`.cwd(workspace.cwd).quiet();

    await expect(
      startTaskBranch(task.tag, { cwd: workspace.cwd }),
    ).rejects.toThrow(/Cannot start task from protected branch "main"/);
  });

  it("should create and checkout a root task branch from trunk", async () => {
    const task = await workspace.createTask({
      id: 102,
      slug: "feat",
      criteria: ["Item"],
    });

    const res = await startTaskBranch(task.tag, { cwd: workspace.cwd });
    const expectedBranch = `task/102-${task.slug}`;
    expect(res.branchName).toBe(expectedBranch);
    expect(res.baseBranch).toBe("dev");
    expect(res.created).toBe(true);

    const current = await Bun.$`git branch --show-current`
      .cwd(workspace.cwd)
      .text();
    expect(current.trim()).toBe(expectedBranch);
  });

  it("should prevent starting a subtask if the parent task branch does not exist", async () => {
    const parent = await workspace.createTask({
      id: 102,
      slug: "feat",
      criteria: ["Item"],
    });
    const subtask = await workspace.createTask({
      id: "102-1",
      slug: "child",
      depends_on: [parent.tag],
      criteria: ["Item"],
    });

    await expect(
      startTaskBranch(subtask.tag, { cwd: workspace.cwd }),
    ).rejects.toThrow(
      /Parent task branch "task\/102-feat" does not exist in local git branches.*RULE-28/,
    );
  });

  it("should branch a subtask directly from its parent task branch per RULE-28", async () => {
    const parent = await workspace.createTask({
      id: 103,
      slug: "parent",
      criteria: ["Item"],
    });
    await workspace.gitCommit("docs: add parent task");

    // Start parent branch
    await startTaskBranch(parent.tag, { cwd: workspace.cwd });

    // Create subtask file
    const subtask = await workspace.createTask({
      id: "103-1",
      slug: "sub",
      depends_on: [parent.tag],
      criteria: ["Item"],
    });
    await workspace.gitCommit("docs: add subtask");

    // Start subtask branch
    const res = await startTaskBranch(subtask.tag, { cwd: workspace.cwd });
    expect(res.branchName).toBe(`task/103-1-${subtask.slug}`);
    expect(res.baseBranch).toBe(`task/103-${parent.slug}`);
    expect(res.isSubtask).toBe(true);

    const current = await Bun.$`git branch --show-current`
      .cwd(workspace.cwd)
      .text();
    expect(current.trim()).toBe(`task/103-1-${subtask.slug}`);
  });

  it("should reject merging a subtask directly into trunk dev per RULE-28", async () => {
    const parent = await workspace.createTask({
      id: 104,
      slug: "parent",
      criteria: ["Item"],
    });
    await workspace.gitCommit("docs: parent");
    await startTaskBranch(parent.tag, { cwd: workspace.cwd });

    const subtask = await workspace.createTask({
      id: "104-1",
      slug: "sub",
      depends_on: [parent.tag],
      criteria: [{ text: "Item", completed: true }],
    });
    await workspace.gitCommit(`feat(${subtask.tag}): sub`);
    await startTaskBranch(subtask.tag, { cwd: workspace.cwd });

    // Mark completed in git
    await workspace.remove(subtask);
    await Bun.$`git add -u`.cwd(workspace.cwd).quiet();
    await workspace.gitCommit(
      `chore(task): delete completed ${subtask.tag} artifact`,
    );

    // Attempting to merge subtask into dev trunk must be rejected per RULE-28
    await expect(
      mergeTaskBranch(subtask.tag, { target: "dev", cwd: workspace.cwd }),
    ).rejects.toThrow(
      /Subtask branch "task\/104-1-sub" cannot be merged directly into trunk branch "dev" per RULE-28/,
    );
  });

  it("should reject merging any task branch into a protected branch", async () => {
    const task = await workspace.createTask({
      id: 105,
      slug: "root",
      criteria: [{ text: "Item", completed: true }],
    });
    await workspace.gitCommit(`feat(${task.tag}): root`);
    await startTaskBranch(task.tag, { cwd: workspace.cwd });

    // Complete in git
    await workspace.remove(task);
    await Bun.$`git add -u`.cwd(workspace.cwd).quiet();
    await workspace.gitCommit(
      `chore(task): delete completed ${task.tag} artifact`,
    );

    // Attempting to merge into protected branch "main" must be rejected
    await expect(
      mergeTaskBranch(task.tag, { target: "main", cwd: workspace.cwd }),
    ).rejects.toThrow(
      /Cannot merge root task branch.*directly into protected branch "main"/,
    );
  });

  it("should successfully merge a subtask back into its parent branch and delete the subtask branch", async () => {
    const parent = await workspace.createTask({
      id: 106,
      slug: "parent",
      criteria: ["Item"],
    });
    await workspace.gitCommit("docs: parent");
    await startTaskBranch(parent.tag, { cwd: workspace.cwd });

    const subtask = await workspace.createTask({
      id: "106-1",
      slug: "sub",
      depends_on: [parent.tag],
      criteria: [{ text: "Item", completed: true }],
    });
    await workspace.gitCommit(`feat(${subtask.tag}): sub`);
    await startTaskBranch(subtask.tag, { cwd: workspace.cwd });

    // Code mutation on subtask branch
    await workspace.writeFile("subtask.txt", "subtask code\n");
    await Bun.$`git add subtask.txt`.cwd(workspace.cwd).quiet();
    await workspace.gitCommit("feat: subtask implementation");

    // Complete subtask artifact per RULE-21
    await workspace.remove(subtask);
    await Bun.$`git add -u`.cwd(workspace.cwd).quiet();
    await workspace.gitCommit(
      `chore(task): delete completed ${subtask.tag} artifact`,
    );

    // Merge subtask branch back into parent
    const mergeRes = await mergeTaskBranch(subtask.tag, { cwd: workspace.cwd });
    expect(mergeRes.sourceBranch).toBe(`task/106-1-${subtask.slug}`);
    expect(mergeRes.targetBranch).toBe(`task/106-${parent.slug}`);
    expect(mergeRes.deletedSourceBranch).toBe(true);

    const curBranch = await Bun.$`git branch --show-current`
      .cwd(workspace.cwd)
      .text();
    expect(curBranch.trim()).toBe(`task/106-${parent.slug}`);

    const branchList = await Bun.$`git branch --list task/106-1-sub`
      .cwd(workspace.cwd)
      .text();
    expect(branchList.trim()).toBe("");
  });

  // @verifies RULE-33
  it("[RULE-33] should detect artifact collisions when concurrent branches introduce the same artifact tag", async () => {
    const rule99Tag = formatArtifactTag("RULE", 99);
    // On dev, create and commit RULE-99
    await workspace.createRule({
      id: 99,
      slug: "rule-a",
      body: "Rule 99 on Dev",
    });
    await workspace.gitCommit(`feat: add ${rule99Tag} on dev`);

    // Create branch feature/concurrent from HEAD~1
    await Bun.$`git checkout -b feature/concurrent HEAD~1`
      .cwd(workspace.cwd)
      .quiet();
    await workspace.createRule({
      id: 99,
      slug: "rule-b",
      body: "Rule 99 on Feature",
    });
    await workspace.gitCommit(`feat: add ${rule99Tag} on feature`);

    const collisions = await detectArtifactCollisions(
      "feature/concurrent",
      "dev",
      workspace.cwd,
    );
    expect(collisions.length).toBe(1);
    expect(collisions[0]?.tag).toBe(rule99Tag);
    expect(collisions[0]?.reason).toBe("duplicate_tag");
  });

  // @verifies RULE-28, RULE-33
  it("[RULE-28][RULE-33] should reject task branch merge when artifact collision exists on target branch", async () => {
    const adr50Tag = formatArtifactTag("ADR", 50);
    // 1. On dev, create and commit ADR-50
    await workspace.createAdr({
      id: 50,
      slug: "adr-a",
      context: "ADR 50 on Dev",
    });
    await workspace.gitCommit(`feat: add ${adr50Tag} on dev`);

    // 2. Branch task/107-test from before ADR-50 was added
    await Bun.$`git checkout -b task/107-test HEAD~1`
      .cwd(workspace.cwd)
      .quiet();

    // Create completed task artifact so completion check passes
    const task = await workspace.createTask({
      id: 107,
      slug: "test",
      criteria: [{ text: "Item", completed: true }],
    });
    // And introduce conflicting ADR-50
    await workspace.createAdr({
      id: 50,
      slug: "adr-b",
      context: "ADR 50 on Task Branch",
    });
    await workspace.gitCommit(
      `feat(${task.tag}): task and conflicting ${adr50Tag}`,
    );

    // Delete task artifact per RULE-21 completion record
    await workspace.remove(task);
    await Bun.$`git add -u`.cwd(workspace.cwd).quiet();
    await workspace.gitCommit(
      `chore(task): delete completed ${task.tag} artifact`,
    );

    // 3. Merging task/107-test into dev must throw artifact collision error
    await expect(
      mergeTaskBranch(task.tag, { target: "dev", cwd: workspace.cwd }),
    ).rejects.toThrow(/artifact collision\(s\) detected/);

    // 4. Passing force should allow bypassing the collision guard
    const result = await mergeTaskBranch(task.tag, {
      target: "dev",
      force: true,
      cwd: workspace.cwd,
    });
    expect(result.sourceBranch).toBe("task/107-test");
    expect(result.targetBranch).toBe("dev");
  });

  // @verifies RULE-33
  it("[RULE-33] should allow merge when task branch archives an artifact without target branch conflict", async () => {
    const rule24Tag = formatArtifactTag("RULE", 24);
    // 1. Commit active RULE-24 on dev before branching
    const rule24 = await workspace.createRule({
      id: 24,
      slug: "explore",
      body: "Active Rule 24",
    });
    await workspace.gitCommit(`feat: add ${rule24Tag} on dev`);

    // 2. Create task branch task/108-archive from dev
    await Bun.$`git checkout -b task/108-archive`.cwd(workspace.cwd).quiet();

    // Create completed task artifact
    const task = await workspace.createTask({
      id: 108,
      slug: "archive",
      criteria: [{ text: "Item", completed: true }],
    });
    // Archive RULE-24 on task branch
    const archivedFilename = `explore.${rule24Tag}.ARCHIVED.md`;
    await Bun.$`git mv ${rule24.filepath} ${workspace.resolve(".modie", "rules", archivedFilename)}`
      .cwd(workspace.cwd)
      .quiet();
    await workspace.gitCommit(`refactor: archive ${rule24Tag}`);

    // Complete task artifact
    await workspace.remove(task);
    await Bun.$`git add -u`.cwd(workspace.cwd).quiet();
    await workspace.gitCommit(
      `chore(task): delete completed ${task.tag} artifact`,
    );

    // 3. Merging should succeed without collision because dev did not rename RULE-24
    const collisions = await detectArtifactCollisions(
      "task/108-archive",
      "dev",
      workspace.cwd,
    );
    expect(collisions.length).toBe(0);

    const mergeResult = await mergeTaskBranch(task.tag, {
      target: "dev",
      cwd: workspace.cwd,
    });
    expect(mergeResult.sourceBranch).toBe("task/108-archive");
    expect(mergeResult.targetBranch).toBe("dev");
  });

  // @verifies RULE-33
  it("[RULE-33] should detect divergent_filepath collision when both branches rename the same artifact to different paths", async () => {
    const rule30Tag = formatArtifactTag("RULE", 30);
    // 1. Commit active RULE-30 at base
    const rule30 = await workspace.createRule({
      id: 30,
      slug: "rule",
      body: "Base Rule 30",
    });
    await workspace.gitCommit(`feat: add ${rule30Tag} at base`);

    // 2. On dev, rename RULE-30 to dev-location
    const devPath = workspace.resolve(
      ".modie",
      "rules",
      `rule-dev.${rule30Tag}.md`,
    );
    await Bun.$`git mv ${rule30.filepath} ${devPath}`
      .cwd(workspace.cwd)
      .quiet();
    await workspace.gitCommit(`refactor: move ${rule30Tag} on dev`);

    // 3. Branch from HEAD~1 (base) and rename to feature-location
    await Bun.$`git checkout -b feature/divergent HEAD~1`
      .cwd(workspace.cwd)
      .quiet();
    const featPath = workspace.resolve(
      ".modie",
      "rules",
      `rule-feature.${rule30Tag}.md`,
    );
    await Bun.$`git mv ${rule30.filepath} ${featPath}`
      .cwd(workspace.cwd)
      .quiet();
    await workspace.gitCommit(`refactor: move ${rule30Tag} on feature`);

    // 4. Collision guard should detect divergent_filepath
    const collisions = await detectArtifactCollisions(
      "feature/divergent",
      "dev",
      workspace.cwd,
    );
    expect(collisions.length).toBe(1);
    expect(collisions[0]?.tag).toBe(rule30Tag);
    expect(collisions[0]?.reason).toBe("divergent_filepath");
  });

  describe("Pre-Merge Guard Decomposition & Domain Errors (RULE-21, RULE-22, RULE-28, RULE-33)", () => {
    it("assertSourceBranchExists should verify branch existence", async () => {
      await expect(
        assertSourceBranchExists(
          defaultVcsAdapter,
          "non-existent-branch",
          "999",
          workspace.cwd,
        ),
      ).rejects.toThrow(/Task branch "non-existent-branch" does not exist/);

      await expect(
        assertSourceBranchExists(
          defaultVcsAdapter,
          "dev",
          "999",
          workspace.cwd,
        ),
      ).resolves.toBeUndefined();
    });

    it("assertTargetBranchExists should verify target branch existence", async () => {
      await expect(
        assertTargetBranchExists(
          defaultVcsAdapter,
          "non-existent-target",
          workspace.cwd,
        ),
      ).rejects.toThrow(/Branch does not exist in local git repository/);

      await expect(
        assertTargetBranchExists(defaultVcsAdapter, "dev", workspace.cwd),
      ).resolves.toBeUndefined();
    });

    it("assertTaskCompleted should throw typed TaskIncompleteError with diagnostic details", async () => {
      // 1. Incomplete criteria
      const taskIncomplete = await workspace.createTask({
        id: 201,
        slug: "incomplete",
        criteria: [
          { text: "Done item", completed: true },
          { text: "Pending item", completed: false },
        ],
      });

      let thrownError: unknown;
      try {
        await assertTaskCompleted(
          taskIncomplete.tag,
          "201",
          "task/201-incomplete",
          { cwd: workspace.cwd, vcs: defaultVcsAdapter },
        );
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(TaskIncompleteError);
      const incErr = thrownError as TaskIncompleteError;
      expect(incErr.taskId).toBe("201");
      expect(incErr.reason).toBe("incomplete_criteria");
      expect(incErr.incompleteCriteriaCount).toBe(1);

      // 2. All criteria complete, but artifact still on disk (not deleted per ceremony)
      const taskUnfinished = await workspace.createTask({
        id: 202,
        slug: "unfinished",
        criteria: [{ text: "Done item", completed: true }],
      });

      thrownError = null;
      try {
        await assertTaskCompleted(
          taskUnfinished.tag,
          "202",
          "task/202-unfinished",
          { cwd: workspace.cwd, vcs: defaultVcsAdapter },
        );
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(TaskIncompleteError);
      const unfinErr = thrownError as TaskIncompleteError;
      expect(unfinErr.taskId).toBe("202");
      expect(unfinErr.reason).toBe("artifact_not_completed");

      // 3. Artifact deleted on disk, but NOT in git history
      await workspace.remove(taskUnfinished);
      thrownError = null;
      try {
        await assertTaskCompleted(undefined, "202", "task/202-unfinished", {
          cwd: workspace.cwd,
          vcs: defaultVcsAdapter,
        });
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(TaskIncompleteError);
      const noRecErr = thrownError as TaskIncompleteError;
      expect(noRecErr.taskId).toBe("202");
      expect(noRecErr.reason).toBe("no_completion_record");

      // 4. Force bypasses checks
      await expect(
        assertTaskCompleted(taskIncomplete.tag, "201", "task/201-incomplete", {
          cwd: workspace.cwd,
          vcs: defaultVcsAdapter,
          force: true,
        }),
      ).resolves.toBeUndefined();
    });

    it("resolveMergeTarget should resolve and guard subtask and root task targets", async () => {
      const subtaskTopology = {
        taskId: "10-1",
        slug: "sub",
        branchName: "task/10-1-sub",
        currentBranch: "task/10-1-sub",
        isCurrentBranchProtected: false,
        isSubtask: true,
        parentId: "10",
        parentBranchName: "task/10-parent",
        trunkBranch: "dev",
        expectedBaseBranch: "task/10-parent",
        protectedBranches: ["main"],
      };

      // Subtask default resolves to parent branch
      expect(resolveMergeTarget(subtaskTopology)).toBe("task/10-parent");

      // Subtask cannot merge directly into trunk per RULE-28
      expect(() =>
        resolveMergeTarget(subtaskTopology, { target: "dev" }),
      ).toThrow(/Subtask branch .* cannot be merged directly into trunk/);

      // Force allows subtask trunk override
      expect(
        resolveMergeTarget(subtaskTopology, { target: "dev", force: true }),
      ).toBe("dev");

      // Subtask cannot merge into protected branch
      expect(() =>
        resolveMergeTarget(subtaskTopology, { target: "main" }),
      ).toThrow(/Cannot merge subtask branch .* into protected branch/);

      const rootTopology = {
        taskId: "10",
        slug: "parent",
        branchName: "task/10-parent",
        currentBranch: "task/10-parent",
        isCurrentBranchProtected: false,
        isSubtask: false,
        trunkBranch: "dev",
        expectedBaseBranch: "dev",
        protectedBranches: ["main"],
      };

      // Root default resolves to trunk when no recordedBaseBranch exists
      expect(resolveMergeTarget(rootTopology)).toBe("dev");

      // Root with recordedBaseBranch resolves to recorded origin unless overridden
      const featureOriginTopology = {
        ...rootTopology,
        recordedBaseBranch: "feat/abc",
        expectedBaseBranch: "feat/abc",
      };
      expect(resolveMergeTarget(featureOriginTopology)).toBe("feat/abc");
      expect(
        resolveMergeTarget(featureOriginTopology, { target: "dev" }),
      ).toBe("dev");

      // Root cannot merge into protected branch (even if recordedBaseBranch is protected)
      expect(() =>
        resolveMergeTarget(rootTopology, { target: "main" }),
      ).toThrow(
        /Cannot merge root task branch .* directly into protected branch/,
      );
      expect(() =>
        resolveMergeTarget({
          ...rootTopology,
          recordedBaseBranch: "main",
        }),
      ).toThrow(
        /Cannot merge root task branch .* directly into protected branch/,
      );
    });

    it("assertNoActiveSubtasks should throw typed ActiveSubtaskPendingError when child branches exist", async () => {
      const parentTopology = {
        taskId: "210",
        slug: "parent",
        branchName: "task/210-parent",
        currentBranch: "task/210-parent",
        isCurrentBranchProtected: false,
        isSubtask: false,
        trunkBranch: "dev",
        expectedBaseBranch: "dev",
        protectedBranches: ["main"],
      };

      // Create an active child subtask branch
      await Bun.$`git branch task/210-1-child`.cwd(workspace.cwd).quiet();

      let thrown: unknown;
      try {
        await assertNoActiveSubtasks(
          defaultVcsAdapter,
          parentTopology,
          workspace.cwd,
        );
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(ActiveSubtaskPendingError);
      const subtaskErr = thrown as ActiveSubtaskPendingError;
      expect(subtaskErr.parentTaskId).toBe("210");
      expect(subtaskErr.activeSubtaskBranches).toContain("task/210-1-child");

      // Force should bypass
      await expect(
        assertNoActiveSubtasks(
          defaultVcsAdapter,
          parentTopology,
          workspace.cwd,
          { force: true },
        ),
      ).resolves.toBeUndefined();

      // Clean up child branch
      await Bun.$`git branch -D task/210-1-child`.cwd(workspace.cwd).quiet();
      await expect(
        assertNoActiveSubtasks(
          defaultVcsAdapter,
          parentTopology,
          workspace.cwd,
        ),
      ).resolves.toBeUndefined();
    });

    it("assertNoCollisions should throw typed ArtifactCollisionError on collision", async () => {
      const ruleTag = formatArtifactTag("RULE", 88);
      await workspace.createRule({ id: 88, slug: "a", body: "On dev" });
      await workspace.gitCommit(`feat: ${ruleTag} on dev`);

      await Bun.$`git checkout -b task/conflict HEAD~1`
        .cwd(workspace.cwd)
        .quiet();
      await workspace.createRule({ id: 88, slug: "b", body: "On branch" });
      await workspace.gitCommit(`feat: conflicting ${ruleTag}`);

      let thrown: unknown;
      try {
        await assertNoCollisions(
          defaultVcsAdapter,
          "task/conflict",
          "dev",
          workspace.cwd,
        );
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(ArtifactCollisionError);
      const colErr = thrown as ArtifactCollisionError;
      expect(colErr.sourceBranch).toBe("task/conflict");
      expect(colErr.targetBranch).toBe("dev");
      expect(colErr.collisions.length).toBe(1);
      expect(colErr.collisions[0]?.tag).toBe(ruleTag);

      // Force should bypass
      await expect(
        assertNoCollisions(
          defaultVcsAdapter,
          "task/conflict",
          "dev",
          workspace.cwd,
          { force: true },
        ),
      ).resolves.toBeUndefined();
    });

    // @verifies RULE-28, RULE-34, RULE-35
    it("[RULE-28][RULE-34][RULE-35] should explicitly reject multi-level task IDs in topology, start, and merge", async () => {
      const deepTag = formatArtifactTag("TASK", "300-1-1");
      const deepTask = await workspace.createTask({
        id: "300-1-1",
        slug: "too-deep",
        criteria: [{ text: "Done", completed: true }],
      });
      await workspace.gitCommit(`feat(${deepTag}): add deep task`);

      await expect(
        computeTaskBranchTopology(deepTask.tag, { cwd: workspace.cwd }),
      ).rejects.toThrow(/exceeds the maximum subtask depth of 1 per RULE-28/);

      await expect(
        startTaskBranch(deepTask.tag, { cwd: workspace.cwd }),
      ).rejects.toThrow(/exceeds the maximum subtask depth of 1 per RULE-28/);

      await expect(
        mergeTaskBranch(deepTask.tag, { cwd: workspace.cwd }),
      ).rejects.toThrow(/exceeds the maximum subtask depth of 1 per RULE-28/);
    });

    // @verifies RULE-28, RULE-34, RULE-35
    it("[RULE-28][RULE-34][RULE-35] should block merging into trunk when source branch contains unmerged commits from another active task branch", async () => {
      // 1. Start TASK-301 from dev and add an unmerged commit
      const taskA = await workspace.createTask({
        id: 301,
        slug: "parent-a",
        criteria: [{ text: "Item", completed: true }],
      });
      await workspace.gitCommit(`docs: add ${taskA.tag}`);
      await startTaskBranch(taskA.tag, { cwd: workspace.cwd });
      await workspace.writeFile("parent-work.txt", "unmerged parent work\n");
      await Bun.$`git add parent-work.txt`.cwd(workspace.cwd).quiet();
      await workspace.gitCommit("feat: unmerged work on task 301");

      // 2. Branch TASK-302 from TASK-301 instead of dev (carrying task 301's commit)
      const taskB = await workspace.createTask({
        id: 302,
        slug: "leaked-child",
        criteria: [{ text: "Item", completed: true }],
      });
      await Bun.$`git checkout -b task/302-${taskB.slug}`
        .cwd(workspace.cwd)
        .quiet();
      await workspace.gitCommit(`feat(${taskB.tag}): task on leaked branch`);
      await workspace.remove(taskB);
      await Bun.$`git add -u`.cwd(workspace.cwd).quiet();
      await workspace.gitCommit(
        `chore(task): delete completed ${taskB.tag} artifact`,
      );

      // 3. Merging TASK-302 into dev must throw ForeignBranchAncestryError
      let thrown: unknown;
      try {
        await mergeTaskBranch(taskB.tag, { cwd: workspace.cwd });
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(ForeignBranchAncestryError);
      const ancErr = thrown as ForeignBranchAncestryError;
      expect(ancErr.sourceBranch).toBe(`task/302-${taskB.slug}`);
      expect(ancErr.targetBranch).toBe("dev");
      expect(ancErr.foreignTaskBranch).toBe(`task/301-${taskA.slug}`);

      // 4. Independent branch started cleanly from dev should NOT trigger false positive
      await Bun.$`git checkout dev`.cwd(workspace.cwd).quiet();
      const taskC = await workspace.createTask({
        id: 303,
        slug: "clean-root",
        criteria: [{ text: "Item", completed: true }],
      });
      await workspace.gitCommit(`docs: add ${taskC.tag}`);
      await startTaskBranch(taskC.tag, { cwd: workspace.cwd });
      await workspace.remove(taskC);
      await Bun.$`git add -u`.cwd(workspace.cwd).quiet();
      await workspace.gitCommit(
        `chore(task): delete completed ${taskC.tag} artifact`,
      );

      const cleanMerge = await mergeTaskBranch(taskC.tag, {
        cwd: workspace.cwd,
      });
      expect(cleanMerge.targetBranch).toBe("dev");

      // 5. --force allows overriding the ancestry guard
      const forcedMerge = await mergeTaskBranch(taskB.tag, {
        cwd: workspace.cwd,
        force: true,
      });
      expect(forcedMerge.targetBranch).toBe("dev");
    });

    // @verifies RULE-28, RULE-34, RULE-35
    it("[RULE-28][RULE-34][RULE-35] should reject invalid --base targets and mis-parented existing subtask branches on startTaskBranch", async () => {
      const parent = await workspace.createTask({
        id: 304,
        slug: "root-parent",
        criteria: ["Item"],
      });
      await workspace.gitCommit(`docs: add ${parent.tag}`);
      await startTaskBranch(parent.tag, { cwd: workspace.cwd });

      const subTag = formatArtifactTag("TASK", "304-1");
      const sub = await workspace.createTask({
        id: "304-1",
        slug: "child-sub",
        depends_on: [parent.tag],
        criteria: ["Item"],
      });
      await workspace.gitCommit(`docs: add ${subTag}`);
      await startTaskBranch(sub.tag, { cwd: workspace.cwd });

      const rootOther = await workspace.createTask({
        id: 305,
        slug: "other-root",
        criteria: ["Item"],
      });
      await workspace.gitCommit(`docs: add ${rootOther.tag}`);

      // Cannot use a protected branch as --base
      await expect(
        startTaskBranch(rootOther.tag, { base: "main", cwd: workspace.cwd }),
      ).rejects.toThrow(/from protected base branch "main"/);

      // Cannot use a subtask branch as --base
      await expect(
        startTaskBranch(rootOther.tag, {
          base: `task/304-1-${sub.slug}`,
          cwd: workspace.cwd,
        }),
      ).rejects.toThrow(/from subtask branch .* Subtasks cannot spawn nested/);

      // Cannot start a subtask with --base pointing to dev instead of parent
      const sub2Tag = formatArtifactTag("TASK", "304-2");
      await Bun.$`git checkout task/304-${parent.slug}`
        .cwd(workspace.cwd)
        .quiet();
      const sub2 = await workspace.createTask({
        id: "304-2",
        slug: "wrong-base-sub",
        depends_on: [parent.tag],
        criteria: ["Item"],
      });
      await workspace.gitCommit(`docs: add ${sub2Tag}`);

      await expect(
        startTaskBranch(sub2.tag, { base: "dev", cwd: workspace.cwd }),
      ).rejects.toThrow(/Subtasks must branch from their parent task branch/);

      // Pre-existing subtask branch containing trunk history absent from parent must be rejected
      await Bun.$`git checkout dev`.cwd(workspace.cwd).quiet();
      await workspace.writeFile("trunk-advance.txt", "trunk commit\n");
      await Bun.$`git add trunk-advance.txt`.cwd(workspace.cwd).quiet();
      await workspace.gitCommit("feat: advance dev ahead of parent");
      await Bun.$`git branch task/304-2-${sub2.slug} dev`
        .cwd(workspace.cwd)
        .quiet();

      await expect(
        startTaskBranch(sub2.tag, { cwd: workspace.cwd }),
      ).rejects.toThrow(/contains trunk history .* not present in parent branch/);
    });

    // @verifies RULE-28, RULE-34, RULE-35
    it("[RULE-28][RULE-34][RULE-35] should block start and merge when tracked working tree has uncommitted changes", async () => {
      const task = await workspace.createTask({
        id: 306,
        slug: "dirty-tree",
        criteria: [{ text: "Item", completed: true }],
      });
      await workspace.writeFile("tracked.txt", "v1\n");
      await Bun.$`git add tracked.txt`.cwd(workspace.cwd).quiet();
      await workspace.gitCommit(`docs: add ${task.tag} and tracked.txt`);

      await startTaskBranch(task.tag, { cwd: workspace.cwd });
      await workspace.remove(task);
      await Bun.$`git add -u`.cwd(workspace.cwd).quiet();
      await workspace.gitCommit(
        `chore(task): delete completed ${task.tag} artifact`,
      );

      // Introduce dirty tracked modification
      await workspace.writeFile("tracked.txt", "uncommitted v2\n");

      await expect(
        mergeTaskBranch(task.tag, { cwd: workspace.cwd }),
      ).rejects.toThrow(/Cannot merge task branch with uncommitted tracked/);

      // Switching back to dev via startTaskBranch on another task should also block
      const otherTask = await workspace.createTask({
        id: 307,
        slug: "clean-switch",
        criteria: ["Item"],
      });
      await expect(
        startTaskBranch(otherTask.tag, { base: "dev", cwd: workspace.cwd }),
      ).rejects.toThrow(/Cannot start task branch with uncommitted tracked/);

      // Restoring tracked file allows merge to proceed
      await Bun.$`git checkout -- tracked.txt`.cwd(workspace.cwd).quiet();
      const mergeRes = await mergeTaskBranch(task.tag, { cwd: workspace.cwd });
      expect(mergeRes.targetBranch).toBe("dev");
    });
  });

  describe("Current-Branch Origin Tracking & Merge-Back Automation (RULE-28, RULE-34, RULE-35)", () => {
    // @verifies RULE-28, RULE-34, RULE-35
    it("[RULE-28][RULE-34][RULE-35] should complete a multi-task loop on a zero-commit feature branch and clean up branch config", async () => {
      // Create feat/abc sharing dev's exact HEAD commit
      await Bun.$`git checkout -b feat/abc`.cwd(workspace.cwd).quiet();
      const featHeadBefore = (
        await Bun.$`git rev-parse HEAD`.cwd(workspace.cwd).text()
      ).trim();
      const devHeadBefore = (
        await Bun.$`git rev-parse dev`.cwd(workspace.cwd).text()
      ).trim();
      expect(featHeadBefore).toBe(devHeadBefore);

      // Task 1 started on feat/abc
      const task1 = await workspace.createTask({
        id: 401,
        slug: "feat-step-one",
        criteria: [{ text: "Deliver step 1", completed: true }],
      });
      await workspace.gitCommit(`docs: add ${task1.tag}`);

      const start1 = await startTaskBranch(task1.tag, { cwd: workspace.cwd });
      expect(start1.baseBranch).toBe("feat/abc");
      expect(start1.targetBranch).toBe("feat/abc");
      expect(start1.created).toBe(true);

      const recorded1 = await defaultVcsAdapter.getConfig(
        taskBranchBaseConfigKey(start1.branchName),
        workspace.cwd,
      );
      expect(recorded1).toBe("feat/abc");

      await workspace.writeFile("step1.txt", "step 1\n");
      await Bun.$`git add step1.txt`.cwd(workspace.cwd).quiet();
      await workspace.gitCommit("feat: step 1");
      await workspace.remove(task1);
      await Bun.$`git add -u`.cwd(workspace.cwd).quiet();
      await workspace.gitCommit(
        `chore(task): delete completed ${task1.tag} artifact`,
      );

      // Merge task 1 without explicit target -> merges back into feat/abc, not dev
      const merge1 = await mergeTaskBranch(task1.tag, { cwd: workspace.cwd });
      expect(merge1.targetBranch).toBe("feat/abc");
      expect(merge1.deletedSourceBranch).toBe(true);

      const currentAfter1 = (
        await Bun.$`git branch --show-current`.cwd(workspace.cwd).text()
      ).trim();
      expect(currentAfter1).toBe("feat/abc");
      expect(
        await defaultVcsAdapter.getConfig(
          taskBranchBaseConfigKey(start1.branchName),
          workspace.cwd,
        ),
      ).toBeNull();

      // dev must remain untouched at original HEAD
      const devHeadAfter1 = (
        await Bun.$`git rev-parse dev`.cwd(workspace.cwd).text()
      ).trim();
      expect(devHeadAfter1).toBe(devHeadBefore);

      // Task 2 started from feat/abc sees task 1's work and merges back to feat/abc
      const task2 = await workspace.createTask({
        id: 402,
        slug: "feat-step-two",
        criteria: [{ text: "Deliver step 2", completed: true }],
      });
      await workspace.gitCommit(`docs: add ${task2.tag}`);

      const start2 = await startTaskBranch(task2.tag, { cwd: workspace.cwd });
      expect(start2.baseBranch).toBe("feat/abc");
      expect(start2.targetBranch).toBe("feat/abc");
      expect(await workspace.readFile("step1.txt")).toBe("step 1\n");

      await workspace.remove(task2);
      await Bun.$`git add -u`.cwd(workspace.cwd).quiet();
      await workspace.gitCommit(
        `chore(task): delete completed ${task2.tag} artifact`,
      );

      const merge2 = await mergeTaskBranch(task2.tag, { cwd: workspace.cwd });
      expect(merge2.targetBranch).toBe("feat/abc");
      expect(
        (await Bun.$`git rev-parse dev`.cwd(workspace.cwd).text()).trim(),
      ).toBe(devHeadBefore);
    });

    // @verifies RULE-28, RULE-34, RULE-35
    it("[RULE-28][RULE-34][RULE-35] should fall back to trunk on detached HEAD and allow base override on protected branch", async () => {
      await Bun.$`git checkout -b feat/override-base`.cwd(workspace.cwd).quiet();
      await workspace.writeFile("override.txt", "from feature\n");
      await Bun.$`git add override.txt`.cwd(workspace.cwd).quiet();
      await workspace.gitCommit("feat: feature commit");

      // Detached HEAD falls back to configured trunk (dev)
      await Bun.$`git checkout --detach dev`.cwd(workspace.cwd).quiet();
      const detachedTask = await workspace.createTask({
        id: 403,
        slug: "detached-root",
        criteria: ["Item"],
      });
      await workspace.gitCommit(`docs: add ${detachedTask.tag}`);

      const detachedStart = await startTaskBranch(detachedTask.tag, {
        cwd: workspace.cwd,
      });
      expect(detachedStart.baseBranch).toBe("dev");
      expect(detachedStart.targetBranch).toBe("dev");
      expect(
        await defaultVcsAdapter.getConfig(
          taskBranchBaseConfigKey(detachedStart.branchName),
          workspace.cwd,
        ),
      ).toBe("dev");

      // Protected branch main rejects start without override, succeeds with explicit base
      await Bun.$`git checkout main`.cwd(workspace.cwd).quiet();
      const protTask = await workspace.createTask({
        id: 404,
        slug: "protected-override",
        criteria: ["Item"],
      });

      await expect(
        startTaskBranch(protTask.tag, { cwd: workspace.cwd }),
      ).rejects.toThrow(/Cannot start task from protected branch "main"/);

      const overrideStart = await startTaskBranch(protTask.tag, {
        base: "feat/override-base",
        cwd: workspace.cwd,
      });
      expect(overrideStart.baseBranch).toBe("feat/override-base");
      expect(overrideStart.targetBranch).toBe("feat/override-base");
    });

    // @verifies RULE-28, RULE-34, RULE-35
    it("[RULE-28][RULE-34][RULE-35] should reject starting a root task while on another active task branch unless base is specified", async () => {
      const firstTask = await workspace.createTask({
        id: 405,
        slug: "active-root",
        criteria: ["Item"],
      });
      const secondTask = await workspace.createTask({
        id: 406,
        slug: "chained-root",
        criteria: ["Item"],
      });
      await workspace.gitCommit(`docs: add ${firstTask.tag} and ${secondTask.tag}`);

      const firstStart = await startTaskBranch(firstTask.tag, {
        cwd: workspace.cwd,
      });
      expect(firstStart.created).toBe(true);

      // Re-starting the currently checked-out task branch remains idempotent
      const reStart = await startTaskBranch(firstTask.tag, {
        cwd: workspace.cwd,
      });
      expect(reStart.created).toBe(false);
      expect(reStart.branchName).toBe(firstStart.branchName);

      // Starting another root task while on task/405-active-root is rejected
      await expect(
        startTaskBranch(secondTask.tag, { cwd: workspace.cwd }),
      ).rejects.toThrow(
        /Cannot start root task .* while checked out on active task branch "task\/405-active-root"/,
      );

      // Explicit base override succeeds
      const explicitStart = await startTaskBranch(secondTask.tag, {
        base: "dev",
        cwd: workspace.cwd,
      });
      expect(explicitStart.created).toBe(true);
      expect(explicitStart.baseBranch).toBe("dev");
    });

    // @verifies RULE-28, RULE-34, RULE-35
    it("[RULE-28][RULE-34][RULE-35] should fail loudly if recorded modieBase no longer exists and fall back to trunk only when unrecorded", async () => {
      // 1. Create feat/ephemeral, start task from it, complete task, then delete feat/ephemeral
      await Bun.$`git checkout -b feat/ephemeral`.cwd(workspace.cwd).quiet();
      const task = await workspace.createTask({
        id: 407,
        slug: "deleted-origin",
        criteria: [{ text: "Done", completed: true }],
      });
      await workspace.gitCommit(`docs: add ${task.tag}`);

      const started = await startTaskBranch(task.tag, { cwd: workspace.cwd });
      expect(started.baseBranch).toBe("feat/ephemeral");

      await workspace.remove(task);
      await Bun.$`git add -u`.cwd(workspace.cwd).quiet();
      await workspace.gitCommit(
        `chore(task): delete completed ${task.tag} artifact`,
      );

      // Delete the origin branch locally
      await Bun.$`git branch -D feat/ephemeral`.cwd(workspace.cwd).quiet();

      // Merging without target must fail loudly, not silently merge into dev
      await expect(
        mergeTaskBranch(task.tag, { cwd: workspace.cwd }),
      ).rejects.toThrow(
        /Cannot merge into recorded origin branch "feat\/ephemeral": Branch no longer exists locally/,
      );

      // Explicit target override recovers and completes merge
      const recovered = await mergeTaskBranch(task.tag, {
        target: "dev",
        cwd: workspace.cwd,
      });
      expect(recovered.targetBranch).toBe("dev");

      // 2. Legacy task branch without modieBase falls back to configured trunk
      const legacyTask = await workspace.createTask({
        id: 408,
        slug: "legacy-no-config",
        criteria: [{ text: "Done", completed: true }],
      });
      await Bun.$`git checkout -b task/408-legacy-no-config`
        .cwd(workspace.cwd)
        .quiet();
      await workspace.gitCommit(`feat(${legacyTask.tag}): add legacy`);
      await workspace.remove(legacyTask);
      await Bun.$`git add -u`.cwd(workspace.cwd).quiet();
      await workspace.gitCommit(
        `chore(task): delete completed ${legacyTask.tag} artifact`,
      );

      const legacyMerge = await mergeTaskBranch(legacyTask.tag, {
        cwd: workspace.cwd,
      });
      expect(legacyMerge.targetBranch).toBe("dev");
    });

    // @verifies RULE-28, RULE-34, RULE-35
    it("[RULE-28][RULE-34][RULE-35] should enforce foreign task ancestry guard when merging into feature branch targets", async () => {
      await Bun.$`git checkout -b feat/guarded`.cwd(workspace.cwd).quiet();
      await workspace.writeFile("base.txt", "feature base\n");
      await Bun.$`git add base.txt`.cwd(workspace.cwd).quiet();
      await workspace.gitCommit("feat: base");

      // Task A branched from feat/guarded with unmerged commit
      const taskA = await workspace.createTask({
        id: 409,
        slug: "foreign-a",
        criteria: ["Item"],
      });
      await workspace.gitCommit(`docs: add ${taskA.tag}`);
      await startTaskBranch(taskA.tag, { cwd: workspace.cwd });
      await workspace.writeFile("foreign.txt", "foreign commit\n");
      await Bun.$`git add foreign.txt`.cwd(workspace.cwd).quiet();
      await workspace.gitCommit("feat: foreign unmerged work");

      // Task B improperly branched from taskA instead of feat/guarded, with modieBase=feat/guarded
      const taskB = await workspace.createTask({
        id: 410,
        slug: "leaked-b",
        criteria: [{ text: "Done", completed: true }],
      });
      await Bun.$`git checkout -b task/410-leaked-b`.cwd(workspace.cwd).quiet();
      await defaultVcsAdapter.setConfig(
        taskBranchBaseConfigKey("task/410-leaked-b"),
        "feat/guarded",
        workspace.cwd,
      );
      await workspace.gitCommit(`feat(${taskB.tag}): task B`);
      await workspace.remove(taskB);
      await Bun.$`git add -u`.cwd(workspace.cwd).quiet();
      await workspace.gitCommit(
        `chore(task): delete completed ${taskB.tag} artifact`,
      );

      let thrown: unknown;
      try {
        await mergeTaskBranch(taskB.tag, { cwd: workspace.cwd });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(ForeignBranchAncestryError);
      const ancErr = thrown as ForeignBranchAncestryError;
      expect(ancErr.targetBranch).toBe("feat/guarded");
      expect(ancErr.foreignTaskBranch).toBe("task/409-foreign-a");

      // Clean sibling task C branched cleanly from feat/guarded succeeds without false positive
      await Bun.$`git checkout feat/guarded`.cwd(workspace.cwd).quiet();
      const taskC = await workspace.createTask({
        id: 411,
        slug: "clean-c",
        criteria: [{ text: "Done", completed: true }],
      });
      await workspace.gitCommit(`docs: add ${taskC.tag}`);
      await startTaskBranch(taskC.tag, { cwd: workspace.cwd });
      await workspace.remove(taskC);
      await Bun.$`git add -u`.cwd(workspace.cwd).quiet();
      await workspace.gitCommit(
        `chore(task): delete completed ${taskC.tag} artifact`,
      );

      const cleanMerge = await mergeTaskBranch(taskC.tag, {
        cwd: workspace.cwd,
      });
      expect(cleanMerge.targetBranch).toBe("feat/guarded");
    });

    // @verifies RULE-28, RULE-34, RULE-35
    it("[RULE-28][RULE-34][RULE-35] should keep subtask branching and merging bound to parent branch when parent originates from a feature branch", async () => {
      await Bun.$`git checkout -b feat/parent-origin`.cwd(workspace.cwd).quiet();

      const parent = await workspace.createTask({
        id: 412,
        slug: "feat-parent",
        criteria: [{ text: "Parent done", completed: true }],
      });
      await workspace.gitCommit(`docs: add ${parent.tag}`);

      const parentStart = await startTaskBranch(parent.tag, {
        cwd: workspace.cwd,
      });
      expect(parentStart.baseBranch).toBe("feat/parent-origin");
      expect(parentStart.targetBranch).toBe("feat/parent-origin");

      const sub = await workspace.createTask({
        id: "412-1",
        slug: "feat-sub",
        depends_on: [parent.tag],
        criteria: [{ text: "Sub done", completed: true }],
      });
      await workspace.gitCommit(`docs: add ${sub.tag}`);

      const subStart = await startTaskBranch(sub.tag, { cwd: workspace.cwd });
      expect(subStart.isSubtask).toBe(true);
      expect(subStart.baseBranch).toBe(parentStart.branchName);
      expect(subStart.targetBranch).toBe(parentStart.branchName);
      expect(
        await defaultVcsAdapter.getConfig(
          taskBranchBaseConfigKey(subStart.branchName),
          workspace.cwd,
        ),
      ).toBeNull();

      await workspace.writeFile("sub-feature.txt", "sub work\n");
      await Bun.$`git add sub-feature.txt`.cwd(workspace.cwd).quiet();
      await workspace.gitCommit("feat: sub work");
      await workspace.remove(sub);
      await Bun.$`git add -u`.cwd(workspace.cwd).quiet();
      await workspace.gitCommit(
        `chore(task): delete completed ${sub.tag} artifact`,
      );

      // Subtask rejects merging directly to dev or feat/parent-origin
      await expect(
        mergeTaskBranch(sub.tag, { target: "dev", cwd: workspace.cwd }),
      ).rejects.toThrow(/cannot be merged directly into trunk/);
      await expect(
        mergeTaskBranch(sub.tag, {
          target: "feat/parent-origin",
          cwd: workspace.cwd,
        }),
      ).rejects.toThrow(/Subtasks must merge back into their parent task branch/);

      // Subtask merges into parent branch
      const subMerge = await mergeTaskBranch(sub.tag, { cwd: workspace.cwd });
      expect(subMerge.targetBranch).toBe(parentStart.branchName);

      // Parent completes and merges back into feat/parent-origin
      await workspace.remove(parent);
      await Bun.$`git add -u`.cwd(workspace.cwd).quiet();
      await workspace.gitCommit(
        `chore(task): delete completed ${parent.tag} artifact`,
      );
      const parentMerge = await mergeTaskBranch(parent.tag, {
        cwd: workspace.cwd,
      });
      expect(parentMerge.targetBranch).toBe("feat/parent-origin");
    });
  });
});
