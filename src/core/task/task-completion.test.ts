/**
 * Unit and integration tests for task checklist progression and completion lifecycle.
 * @verifies ADR-6, RULE-21, RULE-22, RULE-25
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createFixtureWorkspace,
  makeTestTag,
  type CreatedFixtureArtifact,
  type FixtureWorkspace,
} from "../testing/index.ts";
import {
  checkTaskItem,
  completeTask,
  getTask,
  normalizeTaskId,
  resolveTaskFile,
} from "./index.ts";

describe("Task Completion & Checklist Services - Normalization & Resolution", () => {
  it("should normalize diverse task ID formats", () => {
    expect(normalizeTaskId("TASK-7")).toBe("7");
    expect(normalizeTaskId("task-7-1")).toBe("7-1");
    expect(normalizeTaskId("TASK-J101")).toBe("J101");
    expect(normalizeTaskId("7-2")).toBe("7-2");
    expect(normalizeTaskId("my-slug")).toBe("my-slug");
  });

  it("should resolve active tasks on disk by ID and slug", async () => {
    await using workspace = await createFixtureWorkspace("modie-resolve-test-");
    const task = await workspace.createTask({
      id: 42,
      slug: "sample-feature",
      context: "Resolve test fixture",
      criteria: ["Sample item"],
    });

    const fileById = await resolveTaskFile(task.tag, { cwd: workspace.cwd });
    expect(fileById).toBe(task.filepath);

    const fileByRawId = await resolveTaskFile(task.id, { cwd: workspace.cwd });
    expect(fileByRawId).toBe(task.filepath);

    const fileBySlug = await resolveTaskFile(task.slug, { cwd: workspace.cwd });
    expect(fileBySlug).toBe(task.filepath);

    const fileByDirectPath = await resolveTaskFile(task.filepath, {
      cwd: workspace.cwd,
    });
    expect(fileByDirectPath).toBe(task.filepath);
  });

  it("should throw a descriptive error when task does not exist", async () => {
    await using workspace = await createFixtureWorkspace("modie-empty-test-");
    const missingTag = makeTestTag("TASK", 99999);
    await expect(
      resolveTaskFile(missingTag, { cwd: workspace.cwd }),
    ).rejects.toThrow(/was not found among active tasks on disk/);
  });
});

describe("Task Checklist Progression - checkTaskItem (RULE-22, RULE-25)", () => {
  let workspace: FixtureWorkspace;
  let testTask: CreatedFixtureArtifact;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-checklist-test-");
    testTask = await workspace.createTask({
      id: 99,
      slug: "sample-feature",
      context: "Test task for checklist progression.",
      links: [makeTestTag("ADR", 6), makeTestTag("RULE", 22)],
      depends_on: [],
      criteria: [
        "First deliverable item",
        "Second deliverable item",
        "Third deliverable item",
      ],
    });
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-22, RULE-25
  it("[RULE-22][RULE-25] should check off an item and update file on disk", async () => {
    const result = await checkTaskItem(testTask.filepath, 1, {
      completed: true,
      cwd: workspace.cwd,
    });

    expect(result.itemIndex).toBe(1);
    expect(result.itemText).toBe("First deliverable item");
    expect(result.completed).toBe(true);
    expect(result.totalItems).toBe(3);
    expect(result.completedCount).toBe(1);
    expect(result.allCompleted).toBe(false);

    const diskContent = await workspace.readFile(testTask.filepath);
    expect(diskContent).toContain("- [x] First deliverable item");
    expect(diskContent).toContain("- [ ] Second deliverable item");
    expect(diskContent).toContain("- [ ] Third deliverable item");
  });

  // @verifies RULE-22
  it("[RULE-22] should uncheck an already checked item when completed: false", async () => {
    // Check item 2 first
    await checkTaskItem(testTask.filepath, 2, {
      completed: true,
      cwd: workspace.cwd,
    });
    let diskContent = await workspace.readFile(testTask.filepath);
    expect(diskContent).toContain("- [x] Second deliverable item");

    // Uncheck item 2
    const result = await checkTaskItem(testTask.filepath, 2, {
      completed: false,
      cwd: workspace.cwd,
    });
    expect(result.completed).toBe(false);
    expect(result.completedCount).toBe(0);

    diskContent = await workspace.readFile(testTask.filepath);
    expect(diskContent).toContain("- [ ] Second deliverable item");
  });

  // @verifies RULE-22
  it("[RULE-22] should report allCompleted: true when all items are checked", async () => {
    await checkTaskItem(testTask.filepath, 1, {
      completed: true,
      cwd: workspace.cwd,
    });
    await checkTaskItem(testTask.filepath, 2, {
      completed: true,
      cwd: workspace.cwd,
    });
    const result = await checkTaskItem(testTask.filepath, 3, {
      completed: true,
      cwd: workspace.cwd,
    });

    expect(result.completedCount).toBe(3);
    expect(result.totalItems).toBe(3);
    expect(result.allCompleted).toBe(true);

    const task = await getTask(testTask.filepath, { cwd: workspace.cwd });
    expect(task.acceptanceCriteria.every((c) => c.completed)).toBe(true);
  });

  // @verifies RULE-22
  it("[RULE-22] should preserve surrounding frontmatter and context intact", async () => {
    await checkTaskItem(testTask.filepath, 1, {
      completed: true,
      cwd: workspace.cwd,
    });

    const content = await workspace.readFile(testTask.filepath);
    expect(content).toContain("depends_on: []");
    expect(content).toContain(`- ${makeTestTag("ADR", 6)}`);
    expect(content).toContain(`- ${makeTestTag("RULE", 22)}`);
    expect(content).toContain(
      "# Context\n\nTest task for checklist progression.",
    );
  });

  it("should throw an error for invalid item indices", async () => {
    // 0 is invalid (1-based index)
    await expect(
      checkTaskItem(testTask.filepath, 0, { cwd: workspace.cwd }),
    ).rejects.toThrow(/Item index must be a positive integer/);

    // Negative index is invalid
    await expect(
      checkTaskItem(testTask.filepath, -1, { cwd: workspace.cwd }),
    ).rejects.toThrow(/Item index must be a positive integer/);

    // Out of bounds index
    await expect(
      checkTaskItem(testTask.filepath, 10, { cwd: workspace.cwd }),
    ).rejects.toThrow(
      new RegExp(
        `Invalid item index 10\\. Task ${testTask.tag} has 3 acceptance criteria item\\(s\\)\\.`,
      ),
    );
  });
});

describe("Task Lifecycle Completion - completeTask (ADR-6, RULE-21, RULE-22)", () => {
  let workspace: FixtureWorkspace;
  let testTask: CreatedFixtureArtifact;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-complete-test-");
    testTask = await workspace.createTask({
      id: 100,
      slug: "ephemeral-lifecycle",
      context: "Demonstrating ephemeral task completion lifecycle.",
      links: [
        makeTestTag("ADR", 6),
        makeTestTag("RULE", 21),
        makeTestTag("RULE", 22),
      ],
      criteria: ["Unfinished deliverable A", "Unfinished deliverable B"],
    });
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-21, RULE-22
  it("[RULE-21][RULE-22] should reject completion when criteria are incomplete", async () => {
    await expect(
      completeTask(testTask.filepath, { cwd: workspace.cwd }),
    ).rejects.toThrow(
      new RegExp(
        `Cannot complete task ${testTask.id}: 2 acceptance criteria remain unchecked`,
      ),
    );

    const exists = await workspace.fileExists(testTask.filepath);
    expect(exists).toBe(true);
  });

  // @verifies RULE-21, RULE-22, ADR-6
  it("[RULE-21][RULE-22][ADR-6] should complete task and delete file from disk when all criteria are satisfied", async () => {
    await checkTaskItem(testTask.filepath, 1, {
      completed: true,
      cwd: workspace.cwd,
    });
    await checkTaskItem(testTask.filepath, 2, {
      completed: true,
      cwd: workspace.cwd,
    });

    const result = await completeTask(testTask.filepath, {
      cwd: workspace.cwd,
    });

    expect(result.taskId).toBe(testTask.id);
    expect(result.slug).toBe(testTask.slug);
    expect(result.deleted).toBe(true);
    expect(result.criteriaTotal).toBe(2);
    expect(result.criteriaCompleted).toBe(2);
    expect(result.incompleteCriteria).toEqual([]);

    const exists = await workspace.fileExists(testTask.filepath);
    expect(exists).toBe(false);
  });

  // @verifies RULE-21, RULE-22
  it("[RULE-21][RULE-22] should allow force completion of incomplete tasks if force: true", async () => {
    const result = await completeTask(testTask.filepath, {
      force: true,
      cwd: workspace.cwd,
    });

    expect(result.deleted).toBe(true);
    expect(result.criteriaCompleted).toBe(0);
    expect(result.incompleteCriteria.length).toBe(2);

    const exists = await workspace.fileExists(testTask.filepath);
    expect(exists).toBe(false);
  });

  // @verifies RULE-21
  it("[RULE-21] should allow retaining artifact file when deleteArtifact: false is specified", async () => {
    await checkTaskItem(testTask.filepath, 1, {
      completed: true,
      cwd: workspace.cwd,
    });
    await checkTaskItem(testTask.filepath, 2, {
      completed: true,
      cwd: workspace.cwd,
    });

    const result = await completeTask(testTask.filepath, {
      deleteArtifact: false,
      cwd: workspace.cwd,
    });

    expect(result.deleted).toBe(false);

    const content = await workspace.readFile(testTask.filepath);
    expect(content).toContain("- [x] Unfinished deliverable A");
    expect(content).toContain("- [x] Unfinished deliverable B");
  });

  it("should reject completion if task declares no acceptance criteria at all", async () => {
    const emptyTask = await workspace.createTask({
      id: 101,
      slug: "empty-criteria",
      context: "Empty criteria task.",
    });

    await expect(
      completeTask(emptyTask.filepath, { cwd: workspace.cwd }),
    ).rejects.toThrow(/Task declares no acceptance criteria checklist items/);
  });
});

describe("Two-Phase Git Commit Ceremony (ADR-6, RULE-21, RULE-22)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-two-phase-git-");
    await workspace.initGit({ initialCommit: false });
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies ADR-6, RULE-21, RULE-22
  it("[ADR-6][RULE-21][RULE-22] should execute atomic two-phase commit on completeTask with commit: true", async () => {
    const task = await workspace.createTask({
      id: 50,
      slug: "feature-x",
      context: "Two phase task commit test.",
      criteria: [
        { text: "Implemented core service", completed: true },
        { text: "Added unit tests", completed: true },
      ],
    });

    const result = await completeTask(task.filepath, {
      commit: true,
      cwd: workspace.cwd,
    });

    expect(result.deleted).toBe(true);
    expect(result.commits).toBeDefined();
    expect(result.commits?.phase1).toBeDefined();
    expect(result.commits?.phase2).toBeDefined();

    const exists = await workspace.fileExists(task.filepath);
    expect(exists).toBe(false);

    const logOut = await Bun.$`git log --oneline --format=%s`
      .cwd(workspace.cwd)
      .text();
    const commitMessages = logOut.trim().split("\n");
    expect(commitMessages[0]).toBe(
      `chore(task): delete completed ${task.tag} artifact`,
    );
    expect(commitMessages[1]).toBe(`feat(${task.tag}): ${task.slug}`);

    const deletedOut =
      await Bun.$`git log --diff-filter=D --name-only --format=`
        .cwd(workspace.cwd)
        .text();
    expect(deletedOut).toContain(task.filename);
  });

  // @verifies ADR-6, RULE-21
  it("[ADR-6][RULE-21] should only execute Phase 1 commit when deleteArtifact: false", async () => {
    const task = await workspace.createTask({
      id: 51,
      slug: "retained",
      context: "Retained commit test.",
      criteria: [{ text: "Item 1", completed: true }],
    });

    const result = await completeTask(task.filepath, {
      commit: true,
      deleteArtifact: false,
      cwd: workspace.cwd,
    });

    expect(result.deleted).toBe(false);
    expect(result.commits?.phase1).toBeDefined();
    expect(result.commits?.phase2).toBeUndefined();

    const content = await workspace.readFile(task.filepath);
    expect(content).toContain("- [x] Item 1");

    const logOut = await Bun.$`git log --oneline --format=%s`
      .cwd(workspace.cwd)
      .text();
    const commitMessages = logOut.trim().split("\n");
    expect(commitMessages.length).toBe(1);
    expect(commitMessages[0]).toBe(`feat(${task.tag}): ${task.slug}`);
  });

  // @verifies ADR-6, RULE-21, RULE-22
  it("[ADR-6][RULE-21][RULE-22] should update unchecked items to checked on disk during forced commit", async () => {
    const task = await workspace.createTask({
      id: 52,
      slug: "forced",
      context: "Forced task commit.",
      criteria: ["Item unchecked"],
    });

    const result = await completeTask(task.filepath, {
      commit: true,
      force: true,
      cwd: workspace.cwd,
    });

    expect(result.deleted).toBe(true);
    expect(result.commits?.phase1).toBeDefined();
    expect(result.commits?.phase2).toBeDefined();

    const diffOut = await Bun.$`git show ${result.commits!.phase1!}`
      .cwd(workspace.cwd)
      .text();
    expect(diffOut).toContain("- [x] Item unchecked");
  });

  it("should throw error if commit: true is run outside a git repository", async () => {
    await using nonGitWorkspace = await createFixtureWorkspace("modie-nongit-");
    const task = await nonGitWorkspace.createTask({
      id: 53,
      slug: "fail",
      context: "Non git.",
      criteria: [{ text: "Item 1", completed: true }],
    });

    await expect(
      completeTask(task.filepath, { commit: true, cwd: nonGitWorkspace.cwd }),
    ).rejects.toThrow(/directory is not a git repository/);
  });

  // @verifies ADR-6, RULE-21, RULE-22, RULE-32
  it("[ADR-6][RULE-32] should stage all pending code and task changes in Phase 1 commit when working tree is dirty", async () => {
    await workspace.writeFile(
      "service.ts",
      'export const value = "implemented";\n',
    );
    const task = await workspace.createTask({
      id: 60,
      slug: "dirty-tree",
      context: "Dirty tree completion test.",
      criteria: [{ text: "Service implemented", completed: true }],
    });

    const result = await completeTask(task.filepath, {
      commit: true,
      cwd: workspace.cwd,
    });

    expect(result.deleted).toBe(true);
    expect(result.commits?.phase1).toBeDefined();
    expect(result.commits?.phase2).toBeDefined();

    const phase1Files =
      await Bun.$`git diff-tree --root --no-commit-id --name-only -r ${result.commits!.phase1!}`
        .cwd(workspace.cwd)
        .text();
    expect(phase1Files).toContain("service.ts");
    expect(phase1Files).toContain(task.filename);

    const phase2Files =
      await Bun.$`git diff-tree --no-commit-id --name-only -r ${result.commits!.phase2!}`
        .cwd(workspace.cwd)
        .text();
    expect(phase2Files.trim()).toContain(task.filename);

    const statusOut = await Bun.$`git status --porcelain`
      .cwd(workspace.cwd)
      .text();
    expect(statusOut.trim()).toBe("");
  });

  // @verifies ADR-6, RULE-32
  it("[ADR-6][RULE-32] should automatically skip Phase 1 commit when working tree is already clean", async () => {
    await workspace.writeFile("feature.ts", "export const ready = true;\n");
    const task = await workspace.createTask({
      id: 61,
      slug: "clean-tree",
      context: "Clean tree completion test.",
      criteria: [{ text: "Ready to complete", completed: true }],
    });

    await Bun.$`git add -A`.cwd(workspace.cwd).quiet();
    await workspace.gitCommit(
      `feat(${task.tag}): pre-committed implementation`,
    );

    const cleanStatus = await Bun.$`git status --porcelain`
      .cwd(workspace.cwd)
      .text();
    expect(cleanStatus.trim()).toBe("");

    const result = await completeTask(task.filepath, {
      commit: true,
      cwd: workspace.cwd,
    });

    expect(result.deleted).toBe(true);
    expect(result.commits?.phase1).toBeUndefined();
    expect(result.commits?.phase2).toBeDefined();

    const logOut = await Bun.$`git log --oneline --format=%s -n 2`
      .cwd(workspace.cwd)
      .text();
    const messages = logOut.trim().split("\n");
    expect(messages[0]).toBe(
      `chore(task): delete completed ${task.tag} artifact`,
    );
    expect(messages[1]).toBe(`feat(${task.tag}): pre-committed implementation`);

    const finalStatus = await Bun.$`git status --porcelain`
      .cwd(workspace.cwd)
      .text();
    expect(finalStatus.trim()).toBe("");
  });
});

describe("Zombie Task Resurrection Prevention (ADR-6, RULE-21)", () => {
  let workspace: FixtureWorkspace;
  const zombieTag = makeTestTag("TASK", 99);

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-zombie-git-");
    await workspace.initGit({ initialCommit: false });

    // Create and complete task 99 via two-phase commit
    const task = await workspace.createTask({
      id: 99,
      slug: "zombie-target",
      context: "Zombie test task.",
      criteria: [{ text: "Criterion 1", completed: true }],
    });

    await Bun.$`git add .`.cwd(workspace.cwd).quiet();
    await workspace.gitCommit(
      `feat: verify all acceptance criteria for ${task.tag}`,
    );
    await workspace.remove(task);
    await Bun.$`git add -u`.cwd(workspace.cwd).quiet();
    await workspace.gitCommit(
      `chore(task): delete completed ${task.tag} artifact per RULE-21`,
    );
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies ADR-6, RULE-21
  it("[ADR-6][RULE-21] should strictly resolve active .md files on disk without automatic Git deletion scanning while assertNotZombieTask guards ID reuse", async () => {
    const { assertNotZombieTask } = await import("./index.ts");
    const zombieArtifact = await workspace.createTask({
      id: 99,
      slug: "resurrected",
      context: "Zombie resurrected.",
      criteria: ["Criterion"],
    });

    // resolveTaskFile strictly searches active .md files on disk without implicit git log scanning
    const resolved = await resolveTaskFile(zombieTag, {
      cwd: workspace.cwd,
    });
    expect(resolved).toBe(zombieArtifact.filepath);

    // Explicit assertNotZombieTask guard still detects deleted IDs during watermark allocation
    await expect(assertNotZombieTask(zombieTag, workspace.cwd)).rejects.toThrow(
      new RegExp(
        `Zombie task detected: Task "${zombieTag}" was previously completed and deleted in Git history`,
      ),
    );
  });

  // @verifies ADR-6, RULE-21
  it("[ADR-6][RULE-21] should detect zombie tasks across active queue", async () => {
    const { detectZombieTasks } = await import("./index.ts");

    let zombies = await detectZombieTasks(workspace.cwd);
    expect(zombies.length).toBe(0);

    await workspace.createTask({
      id: 99,
      slug: "resurrected",
      context: "Zombie.",
      criteria: ["Item"],
    });

    zombies = await detectZombieTasks(workspace.cwd);
    expect(zombies.length).toBe(1);
    expect(zombies[0]?.id).toBe("99");
  });
});

describe("Task Completion - Planned Governance Enforcement (TASK-35)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-planned-gov-test-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies ADR-6, RULE-21, RULE-22
  it("[ADR-6][RULE-21][RULE-22] should reject task completion if a planned rule is incomplete", async () => {
    const task = await workspace.createTask({
      id: 101,
      slug: "planned-gov",
      context: "Planned governance test.",
      plannedGovernance: {
        rules: ["Multi-branch collision guard"],
      },
      criteria: [{ text: "Feature implementation done", completed: true }],
    });

    await expect(
      completeTask(task.tag, { cwd: workspace.cwd, deleteArtifact: false }),
    ).rejects.toThrow(
      /Planned rule "Multi-branch collision guard" is not marked completed/,
    );
  });

  // @verifies ADR-6, RULE-21, RULE-22
  it("[ADR-6][RULE-21][RULE-22] should reject task completion if planned rule is checked but does not exist on disk", async () => {
    const task = await workspace.createTask({
      id: 102,
      slug: "planned-gov",
      context: "Planned governance test.",
      plannedGovernance: {
        rules: [{ text: "Multi-branch collision guard", completed: true }],
      },
      criteria: [{ text: "Feature implementation done", completed: true }],
    });

    await expect(
      completeTask(task.tag, { cwd: workspace.cwd, deleteArtifact: false }),
    ).rejects.toThrow(
      /Planned rule "Multi-branch collision guard" was not found on disk/,
    );
  });

  // @verifies ADR-6, RULE-21, RULE-22
  it("[ADR-6][RULE-21][RULE-22] should succeed when planned rule exists on disk and is checked", async () => {
    const rule88Tag = makeTestTag("RULE", 88);
    const task = await workspace.createTask({
      id: 103,
      slug: "planned-gov",
      context: "Planned governance test.",
      plannedGovernance: {
        rules: [
          {
            text: `multi-branch-collision-guard.${rule88Tag}.md`,
            completed: true,
          },
        ],
      },
      criteria: [{ text: "Feature implementation done", completed: true }],
    });

    await workspace.createRule({
      id: 88,
      slug: "multi-branch-collision-guard",
      body: "A test rule invariant statement.",
    });

    const result = await completeTask(task.tag, {
      cwd: workspace.cwd,
      deleteArtifact: false,
    });
    expect(result.taskId).toBe("103");
  });

  // @verifies ADR-6, RULE-21, RULE-22
  it("[ADR-6][RULE-21][RULE-22] should bypass planned governance enforcement when --force is used", async () => {
    const task = await workspace.createTask({
      id: 104,
      slug: "planned-gov",
      context: "Planned governance test.",
      plannedGovernance: {
        rules: ["Unfinished rule"],
      },
      criteria: [{ text: "Feature implementation done", completed: true }],
    });

    const result = await completeTask(task.tag, {
      cwd: workspace.cwd,
      force: true,
      deleteArtifact: false,
    });
    expect(result.taskId).toBe("104");
  });
});
