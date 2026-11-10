/**
 * Unit tests for artifact history inspection over pure VCS operations.
 * @verifies ADR-6, ADR-9, RULE-1, RULE-21, RULE-25, RULE-33, RULE-35
 */

import { describe, expect, it } from "bun:test";
import { makeTestTag } from "../../platform/testing/index.ts";
import { MockVcsAdapter } from "../../platform/vcs/mock-adapter.ts";
import {
  inspectGitDeletedArtifactIds,
  inspectGitDeletedArtifacts,
  inspectGitTreeArtifacts,
  inspectMultiBranchActiveArtifactIds,
  inspectMultiBranchActiveArtifacts,
} from "./artifact-history.ts";

describe("Artifact History Inspection (ADR-6, ADR-9, RULE-21, RULE-33, RULE-35)", () => {
  it("[RULE-1][RULE-25][RULE-35] should inspect tree artifacts from pure VCS listTreeFiles", async () => {
    const rule1Tag = makeTestTag("RULE", 1);
    const adr4Tag = makeTestTag("ADR", 4);
    const mockVcs = new MockVcsAdapter({
      treeFiles: {
        main: [
          `src/.modie/rules/artifact-filename.${rule1Tag}.md`,
          `src/.modie/adrs/architecture-decisions.${adr4Tag}.md`,
          "README.md",
        ],
      },
    });

    const arts = await inspectGitTreeArtifacts(
      "main",
      process.cwd(),
      undefined,
      mockVcs,
    );
    expect(arts.length).toBe(2);
    expect(arts.map((a) => a.tag)).toEqual([rule1Tag, adr4Tag]);

    const rulesOnly = await inspectGitTreeArtifacts(
      "main",
      process.cwd(),
      "RULE",
      mockVcs,
    );
    expect(rulesOnly.length).toBe(1);
    expect(rulesOnly[0]?.tag).toBe(rule1Tag);
  });

  it("[RULE-21][ADR-6][RULE-35] should inspect deleted artifacts from pure VCS listDeletedFiles and log grep", async () => {
    const rule99Tag = makeTestTag("RULE", 99);
    const task42Tag = makeTestTag("TASK", 42);
    const taskGrepQuery = `delete completed ${makeTestTag("TASK", "")}`;
    const mockVcs = new MockVcsAdapter({
      deletedFilesList: [`src/.modie/rules/deprecated-rule.${rule99Tag}.md`],
      activeTrackedFiles: [],
      logGrepResults: {
        [taskGrepQuery]: [
          `chore(task): delete completed ${task42Tag} artifact`,
        ],
      },
    });

    const deleted = await inspectGitDeletedArtifacts(
      process.cwd(),
      undefined,
      mockVcs,
    );
    expect(deleted.some((d) => d.tag === rule99Tag)).toBe(true);
    expect(deleted.some((d) => d.tag === task42Tag)).toBe(true);

    const deletedIds = await inspectGitDeletedArtifactIds(
      process.cwd(),
      "RULE",
      mockVcs,
    );
    expect(deletedIds).toEqual(["99"]);
  });

  it("[RULE-33][RULE-35] should inspect active artifacts across multiple branches excluding current branch", async () => {
    const task1Tag = makeTestTag("TASK", 1);
    const task71Tag = makeTestTag("TASK", 71);
    const task99Tag = makeTestTag("TASK", 99);
    const mockVcs = new MockVcsAdapter({
      currentBranch: "task/99-refactor",
      branches: ["main", "task/99-refactor", "task/71-config"],
      treeFiles: {
        main: [`src/.modie/tasks/main-task.${task1Tag}.md`],
        "task/99-refactor": [`src/.modie/tasks/current-task.${task99Tag}.md`],
        "task/71-config": [`src/.modie/tasks/other-task.${task71Tag}.md`],
      },
    });

    const multi = await inspectMultiBranchActiveArtifacts(
      process.cwd(),
      "TASK",
      { excludeCurrent: true },
      mockVcs,
    );

    const tags = multi.map((m) => m.tag);
    expect(tags).toContain(task1Tag);
    expect(tags).toContain(task71Tag);
    expect(tags).not.toContain(task99Tag);

    const ids = await inspectMultiBranchActiveArtifactIds(
      process.cwd(),
      "TASK",
      { excludeCurrent: true },
      mockVcs,
    );
    expect(ids).toContain("1");
    expect(ids).toContain("71");
    expect(ids).not.toContain("99");
  });
});
