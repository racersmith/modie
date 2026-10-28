/**
 * Unit tests for artifact resolution and inspection query services.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createFixtureWorkspace,
  makeTestTag,
  type FixtureWorkspace,
} from "../testing/index.ts";
import {
  getArtifactDetails,
  parseCanonicalTag,
  resolveArtifactByTag,
} from "./index.ts";

describe("Artifact Query Service - Canonical Tag Parsing (RULE-1, RULE-29, RULE-35)", () => {
  // @verifies RULE-1, RULE-29, RULE-35
  it("[RULE-1][RULE-29][RULE-35] should parse valid canonical tags across all indexable subtypes", () => {
    const rule1Tag = makeTestTag("RULE", 1);
    expect(parseCanonicalTag(rule1Tag)).toEqual({
      subtype: "RULE",
      id: "1",
      tag: rule1Tag,
    });

    const rule29Tag = makeTestTag("RULE", 29);
    expect(parseCanonicalTag(rule29Tag.toLowerCase())).toEqual({
      subtype: "RULE",
      id: "29",
      tag: rule29Tag,
    });

    const adr6Tag = makeTestTag("ADR", 6);
    expect(parseCanonicalTag(adr6Tag)).toEqual({
      subtype: "ADR",
      id: "6",
      tag: adr6Tag,
    });

    const adr10Tag = makeTestTag("ADR", 10);
    expect(parseCanonicalTag(adr10Tag.toLowerCase())).toEqual({
      subtype: "ADR",
      id: "10",
      tag: adr10Tag,
    });

    const task12Tag = makeTestTag("TASK", 12);
    expect(parseCanonicalTag(task12Tag)).toEqual({
      subtype: "TASK",
      id: "12",
      tag: task12Tag,
    });

    const taskSubTag = makeTestTag("TASK", "2-1");
    expect(parseCanonicalTag(taskSubTag.toLowerCase())).toEqual({
      subtype: "TASK",
      id: "2-1",
      tag: taskSubTag,
    });

    const taskPrefixTag = makeTestTag("TASK", "J101");
    expect(parseCanonicalTag(taskPrefixTag)).toEqual({
      subtype: "TASK",
      id: "J101",
      tag: taskPrefixTag,
    });
  });

  it("should return null for invalid or non-indexable tags", () => {
    const motiveTag = makeTestTag("MOTIVE", 1);
    const gistTag = makeTestTag("GIST", 1);
    expect(parseCanonicalTag(motiveTag)).toBeNull();
    expect(parseCanonicalTag(gistTag)).toBeNull();
    expect(parseCanonicalTag("RULE")).toBeNull();
    expect(parseCanonicalTag("invalid-tag")).toBeNull();
    expect(parseCanonicalTag("")).toBeNull();
  });
});

describe("Artifact Query Service - Resolution by Tag (RULE-25, RULE-29, RULE-34, RULE-35)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-resolve-tag-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-25, RULE-29, RULE-34, RULE-35, ADR-1, ADR-2
  it("[RULE-25][RULE-29][RULE-34][RULE-35][ADR-1][ADR-2] should resolve active RULE, ADR, and TASK artifacts by tag in test fixture", async () => {
    const ruleTag = makeTestTag("RULE", 50);
    const adrTag = makeTestTag("ADR", 50);
    const taskTag = makeTestTag("TASK", 50);

    const rule = await workspace.createArtifact({
      subtype: "RULE",
      id: "50",
      slug: "sample-rule",
      body: "Rule body",
    });
    const adr = await workspace.createArtifact({
      subtype: "ADR",
      id: "50",
      slug: "sample-decision",
      context: "ADR body",
    });
    const task = await workspace.createArtifact({
      subtype: "TASK",
      id: "50",
      slug: "sample-task",
      context: "Task body",
    });

    const resolvedRule = await resolveArtifactByTag(ruleTag, {
      cwd: workspace.cwd,
    });
    expect(resolvedRule.tag).toBe(ruleTag);
    expect(resolvedRule.subtype).toBe("RULE");
    expect(resolvedRule.id).toBe("50");
    expect(resolvedRule.slug).toBe("sample-rule");
    expect(resolvedRule.filepath).toBe(rule.filepath);
    expect(resolvedRule.isArchived).toBe(false);

    const resolvedAdr = await resolveArtifactByTag(adrTag.toLowerCase(), {
      cwd: workspace.cwd,
    });
    expect(resolvedAdr.tag).toBe(adrTag);
    expect(resolvedAdr.subtype).toBe("ADR");
    expect(resolvedAdr.filepath).toBe(adr.filepath);

    const resolvedTask = await resolveArtifactByTag(taskTag, {
      cwd: workspace.cwd,
    });
    expect(resolvedTask.tag).toBe(taskTag);
    expect(resolvedTask.subtype).toBe("TASK");
    expect(resolvedTask.filepath).toBe(task.filepath);
  });

  // @verifies RULE-1, RULE-29, RULE-34, RULE-35
  it("[RULE-1][RULE-29][RULE-34][RULE-35] should resolve archived artifacts when requested", async () => {
    const adrTag = makeTestTag("ADR", 88);
    const archivedAdr = await workspace.createArtifact({
      subtype: "ADR",
      id: "88",
      slug: "legacy-decision",
      isArchived: true,
      context: "Archived decision",
    });

    const resolved = await resolveArtifactByTag(adrTag, {
      cwd: workspace.cwd,
    });
    expect(resolved.tag).toBe(adrTag);
    expect(resolved.id).toBe("88");
    expect(resolved.isArchived).toBe(true);
    expect(resolved.filepath).toBe(archivedAdr.filepath);
  });

  // @verifies RULE-29, RULE-34, RULE-35
  it("[RULE-29][RULE-34][RULE-35] should prefer active artifact over archived artifact when both exist", async () => {
    const ruleTag = makeTestTag("RULE", 77);
    const activeRule = await workspace.createArtifact({
      subtype: "RULE",
      id: "77",
      slug: "active-rule",
      isArchived: false,
      body: "Active rule",
    });
    await workspace.createArtifact({
      subtype: "RULE",
      id: "77",
      slug: "archived-rule",
      isArchived: true,
      body: "Archived rule",
    });

    const resolved = await resolveArtifactByTag(ruleTag, {
      cwd: workspace.cwd,
    });
    expect(resolved.isArchived).toBe(false);
    expect(resolved.filepath).toBe(activeRule.filepath);
  });

  // @verifies RULE-34, RULE-35
  it("[RULE-34][RULE-35] should throw descriptive error when tag is not found", async () => {
    const missingTag = makeTestTag("RULE", 9999);
    await expect(
      resolveArtifactByTag(missingTag, { cwd: workspace.cwd }),
    ).rejects.toThrow(new RegExp(`Artifact "${missingTag}" was not found`));
  });

  // @verifies RULE-29, RULE-34, RULE-35
  it("[RULE-29][RULE-34][RULE-35] should resolve active artifacts across workspace subdirectories", async () => {
    const rule1Tag = makeTestTag("RULE", "TEST-1");
    const rule29Tag = makeTestTag("RULE", "TEST-29");
    const adr6Tag = makeTestTag("ADR", "TEST-6");

    const rule1 = await workspace.createArtifact({
      subtype: "RULE",
      id: "TEST-1",
      slug: "artifact-structure",
      subDir: "custom/rules",
      body: "Rule content",
    });
    const rule29 = await workspace.createArtifact({
      subtype: "RULE",
      id: "TEST-29",
      slug: "tag-resolution",
      subDir: "deep/nested/rules",
      body: "Tag resolution content",
    });
    const adr6 = await workspace.createArtifact({
      subtype: "ADR",
      id: "TEST-6",
      slug: "task-lifecycle",
      subDir: "docs/adrs",
      context: "Lifecycle content",
    });

    const resolvedRule1 = await resolveArtifactByTag(rule1Tag, {
      cwd: workspace.cwd,
    });
    expect(resolvedRule1.tag).toBe(rule1Tag);
    expect(resolvedRule1.subtype).toBe("RULE");
    expect(resolvedRule1.filepath).toBe(rule1.filepath);

    const resolvedRule29 = await resolveArtifactByTag(rule29Tag, {
      cwd: workspace.cwd,
    });
    expect(resolvedRule29.tag).toBe(rule29Tag);
    expect(resolvedRule29.subtype).toBe("RULE");
    expect(resolvedRule29.filepath).toBe(rule29.filepath);

    const resolvedAdr6 = await resolveArtifactByTag(adr6Tag, {
      cwd: workspace.cwd,
    });
    expect(resolvedAdr6.tag).toBe(adr6Tag);
    expect(resolvedAdr6.subtype).toBe("ADR");
    expect(resolvedAdr6.filepath).toBe(adr6.filepath);
  });

  // @verifies ADR-6, RULE-21, RULE-25, RULE-34, RULE-35
  it("[ADR-6][RULE-21][RULE-25][RULE-34][RULE-35] should strictly search active .md files by default and resolve deleted task history when history: true is passed", async () => {
    await workspace.initGit({ defaultBranch: "dev", initialCommit: true });

    const taskTag = makeTestTag("TASK", 75);
    const task = await workspace.createTask({
      id: 75,
      slug: "ephemeral-history-task",
      context: "History test.",
      criteria: [{ text: "Done", completed: true }],
    });

    await Bun.$`git add .`.cwd(workspace.cwd).quiet();
    await workspace.gitCommit(`feat(${task.tag}): ${task.slug}`);
    await workspace.remove(task);
    await Bun.$`git add -u`.cwd(workspace.cwd).quiet();
    await workspace.gitCommit(`chore(task): delete completed ${task.tag} artifact`);

    // Default strictly checks active .md files on disk
    await expect(
      resolveArtifactByTag(taskTag, { cwd: workspace.cwd }),
    ).rejects.toThrow(/was not found across active or archived/);

    // Explicit history: true finds the deleted task in Git history
    const resolvedHist = await resolveArtifactByTag(taskTag, {
      cwd: workspace.cwd,
      history: true,
    });
    expect(resolvedHist.tag).toBe(taskTag);
    expect(resolvedHist.slug).toBe("ephemeral-history-task");
    expect(resolvedHist.isHistorical).toBe(true);
    expect(resolvedHist.relativePath).toBe(task.relativePath);
  });
});

describe("Artifact Query Service - Deep Inspection (RULE-26, RULE-29, RULE-34, RULE-35)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-inspect-details-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-26, RULE-29, RULE-34, RULE-35
  it("[RULE-26][RULE-29][RULE-34][RULE-35] should extract structured details, links, and sections from artifact", async () => {
    const targetAdrTag = makeTestTag("ADR", "TEST-60");
    const linkRuleTag = makeTestTag("RULE", "TEST-1");
    const linkAdrTag = makeTestTag("ADR", "TEST-2");

    await workspace.createArtifact({
      subtype: "ADR",
      id: "TEST-60",
      slug: "test-adr",
      links: [linkRuleTag, linkAdrTag],
      context: "Context explanation text.",
      body: "# Alternatives Considered\nAlternative A and Alternative B.\n\n# Decision\nWe decided on solution X.",
    });

    const details = await getArtifactDetails(targetAdrTag, {
      cwd: workspace.cwd,
    });
    expect(details.tag).toBe(targetAdrTag);
    expect(details.subtype).toBe("ADR");
    expect(details.links).toEqual([linkRuleTag, linkAdrTag]);
    expect(details.context).toBe("Context explanation text.");
    expect(details.sections["Context"]).toBe("Context explanation text.");
    expect(details.sections["Alternatives Considered"]).toBe(
      "Alternative A and Alternative B.",
    );
    expect(details.sections["Decision"]).toBe("We decided on solution X.");
  });

  // @verifies RULE-22, RULE-26, RULE-29, RULE-34, RULE-35
  it("[RULE-22][RULE-26][RULE-29][RULE-34][RULE-35] should extract acceptance criteria and depends_on for TASK artifacts", async () => {
    const targetTaskTag = makeTestTag("TASK", "TEST-61");
    const taskDepTag = makeTestTag("TASK", "TEST-10");
    const ruleLinkTag = makeTestTag("RULE", "TEST-29");

    await workspace.createArtifact({
      subtype: "TASK",
      id: "TEST-61",
      slug: "test-task",
      depends_on: [taskDepTag],
      links: [ruleLinkTag],
      context: "Task context description.",
      rawContent: `---
depends_on:
  - ${taskDepTag}
links:
  - ${ruleLinkTag}
---

# Context
Task context description.

# Acceptance Criteria
- [x] First item checked
- [ ] Second item pending
`,
    });

    const details = await getArtifactDetails(targetTaskTag, {
      cwd: workspace.cwd,
    });
    expect(details.tag).toBe(targetTaskTag);
    expect(details.subtype).toBe("TASK");
    expect(details.depends_on).toEqual([taskDepTag]);
    expect(details.links).toEqual([ruleLinkTag]);
    expect(details.acceptanceCriteria?.length).toBe(2);
    expect(details.acceptanceCriteria?.[0]?.completed).toBe(true);
    expect(details.acceptanceCriteria?.[1]?.completed).toBe(false);
  });
});
