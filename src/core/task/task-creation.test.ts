/**
 * Integration and unit tests for the core task creation service.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createFixtureWorkspace,
  makeTestTag,
  type FixtureWorkspace,
} from "../testing/index.ts";
import * as TaskPrimitive from "./index.ts";
import {
  createTask,
  findDeepestCommonAncestor,
  resolveTaskDirectories,
  validateTaskScope,
} from "./index.ts";

describe("Task Creation Service - Scope Directory & Subtype Placement (RULE-8)", () => {
  // @verifies RULE-8
  it("[RULE-8] should resolve default placement inside .modie/tasks container", () => {
    const { normalizedScopeDir, targetDir } = resolveTaskDirectories(
      "/app/src/core",
    );
    expect(normalizedScopeDir).toBe("/app/src/core");
    expect(targetDir).toBe("/app/src/core/.modie/tasks");
  });

  // @verifies RULE-8
  it("[RULE-8] should normalize scope to parent when .modie/tasks directory is explicitly passed", () => {
    const { normalizedScopeDir, targetDir } = resolveTaskDirectories(
      "/app/src/core/.modie/tasks",
    );
    expect(normalizedScopeDir).toBe("/app/src/core");
    expect(targetDir).toBe("/app/src/core/.modie/tasks");
  });
});

describe("Task Creation Service - Downward Blast Radius & Least Scope Validation (RULE-6, RULE-12)", () => {
  // @verifies RULE-6
  it("[RULE-6] should accept target paths residing at or below task scope directory", () => {
    expect(() => {
      validateTaskScope("/app/src/core", [
        "/app/src/core/index.ts",
        "/app/src/core/resolver/watermark.ts",
      ]);
    }).not.toThrow();
  });

  // @verifies RULE-6
  it("[RULE-6] should reject target paths that escape task scope directory", () => {
    const rule6 = makeTestTag("RULE", 6);
    expect(() => {
      validateTaskScope("/app/src/core", [
        "/app/src/core/index.ts",
        "/app/src/interfaces/cli.ts",
      ]);
    }).toThrow(new RegExp(`Downward blast radius violation.*${rule6}`));
  });

  // @verifies RULE-12
  it("[RULE-12] should compute deepest common ancestor directory correctly", () => {
    const common = findDeepestCommonAncestor([
      "/app/src/core/resolver/active-scanner.ts",
      "/app/src/core/resolver/git-inspector.ts",
    ]);
    expect(common).toBe("/app/src/core/resolver");

    const rootCommon = findDeepestCommonAncestor([
      "/app/src/core/index.ts",
      "/app/src/interfaces/cli.ts",
    ]);
    expect(rootCommon).toBe("/app/src");
  });

  // @verifies RULE-12
  it("[RULE-12] should reject higher-scoped task placement when deeper common ancestor exists", () => {
    const rule12 = makeTestTag("RULE", 12);
    expect(() => {
      validateTaskScope(
        "/app/src",
        [
          "/app/src/core/resolver/watermark.ts",
          "/app/src/core/resolver/git-inspector.ts",
        ],
        false,
      );
    }).toThrow(new RegExp(`Least scope placement violation.*${rule12}`));
  });

  // @verifies RULE-12
  it("[RULE-12] should allow broad scope when allowBroadScope is explicitly set to true", () => {
    expect(() => {
      validateTaskScope(
        "/app/src",
        [
          "/app/src/core/resolver/watermark.ts",
          "/app/src/core/resolver/git-inspector.ts",
        ],
        true,
      );
    }).not.toThrow();
  });
});

describe("Task Creation Service - End-to-End Task Creation via Public API (RULE-1, RULE-8, RULE-15, RULE-18, RULE-21, RULE-22, RULE-25, RULE-34, RULE-35, ADR-6, ADR-9)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-core-task-create-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-1, RULE-8, RULE-22, RULE-25, RULE-34, RULE-35, ADR-6, ADR-9
  it("[RULE-1][RULE-8][RULE-22][RULE-25][RULE-34][RULE-35][ADR-6][ADR-9] should create a valid TASK file on disk via core API", async () => {
    const testTitle = "Task Service Integration Verification";
    const testScope = "src/core";

    const depTask3 = makeTestTag("TASK", 3);
    const depTask4 = makeTestTag("TASK", 4);
    const linkAdr6 = makeTestTag("ADR", 6);
    const linkRule25 = makeTestTag("RULE", 25);
    const expectedTaskTag = makeTestTag("TASK", 1);

    const result = await createTask({
      title: testTitle,
      scopeDir: testScope,
      context: "Validates core task creation service end-to-end integration.",
      depends_on: [depTask3, depTask4],
      links: [linkAdr6, linkRule25],
      acceptanceCriteria: [
        "Create task file in .tasks directory",
        { text: "Verify valid frontmatter parsing", completed: false },
      ],
      branch: "dev", // forces trunk allocation for predictable monotonic sequence
      cwd: workspace.cwd,
    });

    expect(result.artifact.title).toBe(testTitle);
    expect(result.artifact.slug).toBe("task-service-integration-verification");
    expect(result.artifact.id).toBe("1");
    expect(result.filename).toBe(
      `task-service-integration-verification.${expectedTaskTag}.md`,
    );
    expect(result.relativePath).toContain(
      `.modie/tasks/task-service-integration-verification.${expectedTaskTag}.md`,
    );

    // Verify file was written to disk and can be read
    const fileContents = await workspace.readFile(result.filepath);
    expect(fileContents).toContain("depends_on:");
    expect(fileContents).toContain(`- ${depTask3}`);
    expect(fileContents).toContain(`- ${depTask4}`);
    expect(fileContents).toContain("links:");
    expect(fileContents).toContain(`- ${linkAdr6}`);
    expect(fileContents).toContain(`- ${linkRule25}`);
    expect(fileContents).toContain("# Context");
    expect(fileContents).toContain("# Acceptance Criteria");
    expect(fileContents).toContain(
      "- [ ] Create task file in .tasks directory",
    );
    expect(fileContents).toContain("- [ ] Verify valid frontmatter parsing");

    // Roundtrip verification using TaskPrimitive parser
    const parsed = TaskPrimitive.parseTaskMarkdown(
      fileContents,
      result.filepath,
    );
    expect(parsed.id).toBe(result.artifact.id);
    expect(parsed.slug).toBe("task-service-integration-verification");
    expect(parsed.depends_on).toEqual([depTask3, depTask4]);
    expect(parsed.links).toEqual([linkAdr6, linkRule25]);
    expect(parsed.acceptanceCriteria.length).toBe(2);
    expect(result.artifact.depends_on).toEqual([depTask3, depTask4]);
    expect(result.artifact.links).toEqual([linkAdr6, linkRule25]);
  });

  // @verifies ADR-9, RULE-34, RULE-35
  it("[ADR-9][RULE-34][RULE-35] should allocate branch subtask IDs when on a task branch", async () => {
    const parentId = 5;
    const branchName = `task/${parentId}-task-creation-service`;
    const expectedSubtaskId = `${parentId}-1`;
    const expectedSubtaskTag = makeTestTag("TASK", expectedSubtaskId);

    const result = await createTask({
      title: "Subtask Under Task 5",
      scopeDir: "src/core",
      branch: branchName,
      cwd: workspace.cwd,
    });

    expect(result.watermark.strategy).toBe("subtask");
    expect(result.artifact.id).toBe(expectedSubtaskId);
    expect(result.filename).toBe(
      `subtask-under-task-5.${expectedSubtaskTag}.md`,
    );
  });

  // @verifies ADR-9, RULE-34, RULE-35
  it("[ADR-9][RULE-34][RULE-35] should allocate prefixed IDs when prefix is specified", async () => {
    const prefix = "A";
    const expectedId = `${prefix}1`;
    const expectedTag = makeTestTag("TASK", expectedId);

    const result = await createTask({
      title: "Agent Delegated Task",
      prefix,
      branch: "feature/experimental",
      cwd: workspace.cwd,
    });

    expect(result.watermark.strategy).toBe("prefixed");
    expect(result.artifact.id).toBe(expectedId);
    expect(result.filename).toBe(`agent-delegated-task.${expectedTag}.md`);
  });

  // @verifies RULE-15, RULE-18, RULE-34, RULE-35
  it("[RULE-15][RULE-18][RULE-34][RULE-35] should reject invalid link types or invalid dependency identifiers", async () => {
    const invalidLinkTag = makeTestTag("TASK", 1);
    const invalidDepTag = makeTestTag("RULE", 1);
    const rule15 = makeTestTag("RULE", 15);
    const rule18 = makeTestTag("RULE", 18);

    // RULE-15: TASK links cannot be in links:
    await expect(
      createTask({
        title: "Invalid Links Test",
        links: [invalidLinkTag as any],
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(new RegExp(`Invalid task link target.*${rule15}`));

    // RULE-18: Non-TASK dependencies cannot be in depends_on:
    await expect(
      createTask({
        title: "Invalid Dependencies Test",
        depends_on: [invalidDepTag as any],
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(new RegExp(`Invalid task dependency.*${rule18}`));
  });

  // @verifies ADR-6, RULE-21, RULE-34, RULE-35
  it("[ADR-6][RULE-21][RULE-34][RULE-35] should prevent zombie task resurrection for completed task IDs in git history", async () => {
    await workspace.initGit({ defaultBranch: "dev" });

    // Create and delete TASK-1 in git
    const dummyTask = await workspace.createTask({
      id: 1,
      slug: "dummy",
      context: "Test",
      criteria: [{ text: "Item", completed: true }],
    });
    await workspace.gitCommit("feat: done");

    await workspace.remove(dummyTask);
    await workspace.gitCommit("chore: delete");

    // Next monotonic creation in workspace advances to TASK-2 (never reuses deleted TASK-1)
    const res = await createTask({
      title: "New Task After Deletion",
      cwd: workspace.cwd,
    });

    const expectedNextTag = makeTestTag("TASK", 2);
    expect(res.artifact.id).toBe("2");
    expect(res.filename).toBe(`new-task-after-deletion.${expectedNextTag}.md`);
  });
});
