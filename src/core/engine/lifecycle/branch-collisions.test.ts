/**
 * Unit and integration tests for pre-merge artifact collision detection.
 * @verifies RULE-1, RULE-28, RULE-33, RULE-34, RULE-35
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { formatArtifactTag } from "../../domain/index.ts";
import type { FixtureWorkspace } from "../../platform/testing/index.ts";
import { defaultVcsAdapter } from "../../platform/vcs/git-cli-adapter.ts";
import { MockVcsAdapter } from "../../platform/vcs/mock-adapter.ts";
import { createWorkspaceContextSync } from "../context/index.ts";
import { assertNoCollisions, detectArtifactCollisions } from "./collision-guard.ts";
import { mergeTaskBranch } from "./branching.ts";
import { ArtifactCollisionError } from "./errors.ts";
import {
  completeTaskInGit,
  createBranchingWorkspace,
} from "./test-helpers.ts";

describe("Pre-Merge Artifact Collision Guard (RULE-33)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createBranchingWorkspace("modie-collision-test-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-33
  it("[RULE-33] should detect artifact collisions when concurrent branches introduce the same artifact tag", async () => {
    const rule99Tag = formatArtifactTag("RULE", 99);
    await workspace.createRule({
      id: 99,
      slug: "rule-a",
      body: "Rule 99 on Dev",
    });
    await workspace.gitCommit(`feat: add ${rule99Tag} on dev`);

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
    await workspace.createAdr({
      id: 50,
      slug: "adr-a",
      context: "ADR 50 on Dev",
    });
    await workspace.gitCommit(`feat: add ${adr50Tag} on dev`);

    await Bun.$`git checkout -b task/107-test HEAD~1`
      .cwd(workspace.cwd)
      .quiet();

    const task = await workspace.createTask({
      id: 107,
      slug: "test",
      criteria: [{ text: "Item", completed: true }],
    });
    await workspace.createAdr({
      id: 50,
      slug: "adr-b",
      context: "ADR 50 on Task Branch",
    });
    await workspace.gitCommit(
      `feat(${task.tag}): task and conflicting ${adr50Tag}`,
    );
    await completeTaskInGit(workspace, task);

    await expect(
      mergeTaskBranch(task.tag, { target: "dev", cwd: workspace.cwd }),
    ).rejects.toThrow(/artifact collision\(s\) detected/);

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
    const rule24 = await workspace.createRule({
      id: 24,
      slug: "explore",
      body: "Active Rule 24",
    });
    await workspace.gitCommit(`feat: add ${rule24Tag} on dev`);

    await Bun.$`git checkout -b task/108-archive`.cwd(workspace.cwd).quiet();

    const task = await workspace.createTask({
      id: 108,
      slug: "archive",
      criteria: [{ text: "Item", completed: true }],
    });
    const archivedFilename = `explore.${rule24Tag}.ARCHIVED.md`;
    await Bun.$`git mv ${rule24.filepath} ${workspace.resolve(".modie", "rules", archivedFilename)}`
      .cwd(workspace.cwd)
      .quiet();
    await workspace.gitCommit(`refactor: archive ${rule24Tag}`);
    await completeTaskInGit(workspace, task);

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
    const rule30 = await workspace.createRule({
      id: 30,
      slug: "rule",
      body: "Base Rule 30",
    });
    await workspace.gitCommit(`feat: add ${rule30Tag} at base`);

    const devPath = workspace.resolve(
      ".modie",
      "rules",
      `rule-dev.${rule30Tag}.md`,
    );
    await Bun.$`git mv ${rule30.filepath} ${devPath}`
      .cwd(workspace.cwd)
      .quiet();
    await workspace.gitCommit(`refactor: move ${rule30Tag} on dev`);

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

    const collisions = await detectArtifactCollisions(
      "feature/divergent",
      "dev",
      workspace.cwd,
    );
    expect(collisions.length).toBe(1);
    expect(collisions[0]?.tag).toBe(rule30Tag);
    expect(collisions[0]?.reason).toBe("divergent_filepath");
  });

  // @verifies RULE-33
  it("[RULE-33] assertNoCollisions should throw typed ArtifactCollisionError on collision", async () => {
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

  // @verifies RULE-33, RULE-34, RULE-35
  it("[RULE-33][RULE-34][RULE-35] should use WorkspaceContext MockVcsAdapter consistently across source, target, and merge-base inspections", async () => {
    const sharedRuleTag = formatArtifactTag("RULE", 77);
    const movedRuleTag = formatArtifactTag("RULE", 78);
    const sharedPath = `.modie/rules/shared.${sharedRuleTag}.md`;

    const mockVcs = new MockVcsAdapter({
      currentBranch: "task/77-mock-source",
      branches: ["dev", "task/77-mock-source"],
      mergeBaseResult: "mock-merge-base-sha",
      treeFiles: {
        "task/77-mock-source": [
          sharedPath,
          `.modie/rules/moved-source.${movedRuleTag}.md`,
        ],
        dev: [
          sharedPath,
          `.modie/rules/moved-target.${movedRuleTag}.md`,
        ],
        "mock-merge-base-sha": [
          sharedPath,
          `.modie/rules/moved-base.${movedRuleTag}.md`,
        ],
      },
    });

    const ctx = createWorkspaceContextSync({
      root: "/virtual/hermetic-collision-workspace",
      vcs: mockVcs,
    });

    const collisions = await detectArtifactCollisions(
      "task/77-mock-source",
      "dev",
      ctx,
    );

    // sharedRuleTag existed at merge-base so it must NOT trigger a false duplicate_tag collision;
    // movedRuleTag existed at merge-base at a third path so it must classify as divergent_filepath (not duplicate_tag).
    expect(collisions).toHaveLength(1);
    expect(collisions[0]?.tag).toBe(movedRuleTag);
    expect(collisions[0]?.reason).toBe("divergent_filepath");
    expect(collisions[0]?.sourceFilepath).toBe(
      `.modie/rules/moved-source.${movedRuleTag}.md`,
    );
    expect(collisions[0]?.targetFilepath).toBe(
      `.modie/rules/moved-target.${movedRuleTag}.md`,
    );
  });
});
