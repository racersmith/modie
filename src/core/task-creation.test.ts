/**
 * Integration and unit tests for the core task creation service.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 */

import { describe, expect, it } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import {
  createTask,
  findDeepestCommonAncestor,
  resolveTaskDirectories,
  TaskPrimitive,
  validateTaskScope,
} from "./index.ts";

describe("Task Creation Service - Scope Directory & Subtype Placement", () => {
  // @verifies RULE-8
  it("[RULE-8] should resolve default placement inside .tasks container", () => {
    const { normalizedScopeDir, targetDir } = resolveTaskDirectories("/app/src/core", true);
    expect(normalizedScopeDir).toBe("/app/src/core");
    expect(targetDir).toBe("/app/src/core/.tasks");
  });

  // @verifies RULE-8
  it("[RULE-8] should resolve flat placement when useSubtypeContainer is false", () => {
    const { normalizedScopeDir, targetDir } = resolveTaskDirectories("/app/src/core", false);
    expect(normalizedScopeDir).toBe("/app/src/core");
    expect(targetDir).toBe("/app/src/core");
  });

  // @verifies RULE-8
  it("[RULE-8] should normalize scope to parent when .tasks directory is explicitly passed", () => {
    const { normalizedScopeDir, targetDir } = resolveTaskDirectories("/app/src/core/.tasks", true);
    expect(normalizedScopeDir).toBe("/app/src/core");
    expect(targetDir).toBe("/app/src/core/.tasks");
  });
});

describe("Task Creation Service - Downward Blast Radius & Least Scope Validation", () => {
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
    expect(() => {
      validateTaskScope("/app/src/core", [
        "/app/src/core/index.ts",
        "/app/src/interfaces/cli.ts",
      ]);
    }).toThrow(/Downward blast radius violation.*RULE-6/);
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
    expect(() => {
      validateTaskScope(
        "/app/src",
        [
          "/app/src/core/resolver/watermark.ts",
          "/app/src/core/resolver/git-inspector.ts",
        ],
        false,
      );
    }).toThrow(/Least scope placement violation.*RULE-12/);
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

describe("Task Creation Service - End-to-End Task Creation via Public API", () => {
  // @verifies RULE-1, RULE-8, RULE-22, RULE-25, ADR-6, ADR-9
  it("[RULE-1][RULE-8][RULE-22][RULE-25][ADR-6][ADR-9] should create a valid TASK file on disk via core API", async () => {
    const testTitle = "Task Service Integration Verification";
    const testScope = "src/core";

    const result = await createTask({
      title: testTitle,
      scopeDir: testScope,
      context: "Validates core task creation service end-to-end integration.",
      depends_on: ["TASK-3", "TASK-4"],
      links: ["ADR-6", "RULE-25"],
      acceptanceCriteria: [
        "Create task file in .tasks directory",
        { text: "Verify valid frontmatter parsing", completed: false },
      ],
      branch: "dev", // forces trunk allocation for predictable monotonic sequence
    });

    try {
      expect(result.artifact.title).toBe(testTitle);
      expect(result.artifact.slug).toBe("task-service-integration-verification");
      expect(result.artifact.id).toBe("7"); // 1, 5, 6 active, 2, 3, 4 deleted -> next is 7
      expect(result.filename).toBe("task-service-integration-verification.TASK-7.md");
      expect(result.relativePath).toContain(".tasks");

      // Verify file was written to disk and can be read
      const fileContents = await readFile(result.filepath, "utf8");
      expect(fileContents).toContain("depends_on:");
      expect(fileContents).toContain("- TASK-3");
      expect(fileContents).toContain("- TASK-4");
      expect(fileContents).toContain("links:");
      expect(fileContents).toContain("- ADR-6");
      expect(fileContents).toContain("- RULE-25");
      expect(fileContents).toContain("# Context");
      expect(fileContents).toContain("# Acceptance Criteria");
      expect(fileContents).toContain("- [ ] Create task file in .tasks directory");
      expect(fileContents).toContain("- [ ] Verify valid frontmatter parsing");

      // Roundtrip verification using TaskPrimitive parser
      const parsed = TaskPrimitive.parseTaskMarkdown(fileContents, result.filepath);
      expect(parsed.id).toBe("7");
      expect(parsed.slug).toBe("task-service-integration-verification");
      expect(parsed.depends_on).toEqual(["TASK-3", "TASK-4"]);
      expect(parsed.links).toEqual(["ADR-6", "RULE-25"]);
      expect(parsed.acceptanceCriteria.length).toBe(2);
      expect(result.artifact.depends_on).toEqual(["TASK-3", "TASK-4"]);
      expect(result.artifact.links).toEqual(["ADR-6", "RULE-25"]);
    } finally {
      // Clean up the created test artifact
      await rm(result.filepath, { force: true });
    }
  });

  // @verifies ADR-9
  it("[ADR-9] should allocate branch subtask IDs when on a task branch", async () => {
    const result = await createTask({
      title: "Subtask Under Task 5",
      scopeDir: "src/core",
      branch: "task/5-task-creation-service",
    });

    try {
      expect(result.watermark.strategy).toBe("subtask");
      expect(result.artifact.id).toBe("5-1");
      expect(result.filename).toBe("subtask-under-task-5.TASK-5-1.md");
    } finally {
      await rm(result.filepath, { force: true });
    }
  });

  // @verifies ADR-9
  it("[ADR-9] should allocate prefixed IDs when prefix is specified", async () => {
    const result = await createTask({
      title: "Agent Delegated Task",
      prefix: "A",
      branch: "feature/experimental",
    });

    try {
      expect(result.watermark.strategy).toBe("prefixed");
      expect(result.artifact.id).toBe("A1");
      expect(result.filename).toBe("agent-delegated-task.TASK-A1.md");
    } finally {
      await rm(result.filepath, { force: true });
    }
  });

  // @verifies RULE-15, RULE-18
  it("[RULE-15][RULE-18] should reject invalid link types or invalid dependency identifiers", async () => {
    // RULE-15: TASK links cannot be in links:
    await expect(
      createTask({
        title: "Invalid Links Test",
        links: ["TASK-1" as any],
      }),
    ).rejects.toThrow(/Invalid task link target.*RULE-15/);

    // RULE-18: Non-TASK dependencies cannot be in depends_on:
    await expect(
      createTask({
        title: "Invalid Dependencies Test",
        depends_on: ["RULE-1" as any],
      }),
    ).rejects.toThrow(/Invalid task dependency.*RULE-18/);
  });
});
