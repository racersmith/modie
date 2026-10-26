/**
 * Unit tests for artifact resolution and inspection query services.
 * @verifies ADR-1, ADR-2, RULE-1, RULE-25, RULE-26, RULE-29, RULE-34
 */

import { describe, expect, it } from "bun:test";
import { createFixtureWorkspace } from "../testing/index.ts";
import {
  getArtifactDetails,
  parseCanonicalTag,
  resolveArtifactByTag,
} from "./index.ts";

describe("Artifact Query Service - Canonical Tag Parsing (RULE-1, RULE-29)", () => {
  // @verifies RULE-1, RULE-29
  it("[RULE-1][RULE-29] should parse valid canonical tags across all indexable subtypes", () => {
    expect(parseCanonicalTag("RULE-1")).toEqual({
      subtype: "RULE",
      id: "1",
      tag: "RULE-1",
    });

    expect(parseCanonicalTag("rule-29")).toEqual({
      subtype: "RULE",
      id: "29",
      tag: "RULE-29",
    });

    expect(parseCanonicalTag("ADR-6")).toEqual({
      subtype: "ADR",
      id: "6",
      tag: "ADR-6",
    });

    expect(parseCanonicalTag("adr-10")).toEqual({
      subtype: "ADR",
      id: "10",
      tag: "ADR-10",
    });

    expect(parseCanonicalTag("TASK-12")).toEqual({
      subtype: "TASK",
      id: "12",
      tag: "TASK-12",
    });

    expect(parseCanonicalTag("task-2-1")).toEqual({
      subtype: "TASK",
      id: "2-1",
      tag: "TASK-2-1",
    });

    expect(parseCanonicalTag("TASK-J101")).toEqual({
      subtype: "TASK",
      id: "J101",
      tag: "TASK-J101",
    });
  });

  it("should return null for invalid or non-indexable tags", () => {
    expect(parseCanonicalTag("MOTIVE-1")).toBeNull();
    expect(parseCanonicalTag("GIST-1")).toBeNull();
    expect(parseCanonicalTag("RULE")).toBeNull();
    expect(parseCanonicalTag("invalid-tag")).toBeNull();
    expect(parseCanonicalTag("")).toBeNull();
  });
});

describe("Artifact Query Service - Resolution by Tag (RULE-25, RULE-29, RULE-34)", () => {
  // @verifies RULE-25, RULE-29, RULE-34, ADR-1, ADR-2
  it("[RULE-25][RULE-29][RULE-34][ADR-1][ADR-2] should resolve active RULE, ADR, and TASK artifacts by tag in test fixture", async () => {
    const workspace = await createFixtureWorkspace("modie-resolve-tag-");
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

    const resolvedRule = await resolveArtifactByTag("RULE-50", { cwd: workspace.cwd });
    expect(resolvedRule.tag).toBe("RULE-50");
    expect(resolvedRule.subtype).toBe("RULE");
    expect(resolvedRule.id).toBe("50");
    expect(resolvedRule.slug).toBe("sample-rule");
    expect(resolvedRule.filepath).toBe(rule.filepath);
    expect(resolvedRule.isArchived).toBe(false);

    const resolvedAdr = await resolveArtifactByTag("adr-50", { cwd: workspace.cwd });
    expect(resolvedAdr.tag).toBe("ADR-50");
    expect(resolvedAdr.subtype).toBe("ADR");
    expect(resolvedAdr.filepath).toBe(adr.filepath);

    const resolvedTask = await resolveArtifactByTag("TASK-50", { cwd: workspace.cwd });
    expect(resolvedTask.tag).toBe("TASK-50");
    expect(resolvedTask.subtype).toBe("TASK");
    expect(resolvedTask.filepath).toBe(task.filepath);

    await workspace.cleanup();
  });

  // @verifies RULE-1, RULE-29, RULE-34
  it("[RULE-1][RULE-29][RULE-34] should resolve archived artifacts when requested", async () => {
    const workspace = await createFixtureWorkspace("modie-resolve-archived-");
    const archivedAdr = await workspace.createArtifact({
      subtype: "ADR",
      id: "88",
      slug: "legacy-decision",
      isArchived: true,
      context: "Archived decision",
    });

    const resolved = await resolveArtifactByTag("ADR-88", { cwd: workspace.cwd });
    expect(resolved.tag).toBe("ADR-88");
    expect(resolved.id).toBe("88");
    expect(resolved.isArchived).toBe(true);
    expect(resolved.filepath).toBe(archivedAdr.filepath);

    await workspace.cleanup();
  });

  // @verifies RULE-29, RULE-34
  it("[RULE-29][RULE-34] should prefer active artifact over archived artifact when both exist", async () => {
    const workspace = await createFixtureWorkspace("modie-resolve-conflict-");
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

    const resolved = await resolveArtifactByTag("RULE-77", { cwd: workspace.cwd });
    expect(resolved.isArchived).toBe(false);
    expect(resolved.filepath).toBe(activeRule.filepath);

    await workspace.cleanup();
  });

  // @verifies RULE-34
  it("[RULE-34] should throw descriptive error when tag is not found", async () => {
    const workspace = await createFixtureWorkspace("modie-resolve-missing-");
    await expect(resolveArtifactByTag("RULE-9999", { cwd: workspace.cwd })).rejects.toThrow(
      /Artifact "RULE-9999" was not found/,
    );
    await workspace.cleanup();
  });

  // @verifies RULE-29, RULE-34
  it("[RULE-29][RULE-34] should resolve active artifacts across workspace subdirectories", async () => {
    const workspace = await createFixtureWorkspace("modie-resolve-workspace-");
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

    const resolvedRule1 = await resolveArtifactByTag("RULE-TEST-1", { cwd: workspace.cwd });
    expect(resolvedRule1.tag).toBe("RULE-TEST-1");
    expect(resolvedRule1.subtype).toBe("RULE");
    expect(resolvedRule1.filepath).toBe(rule1.filepath);

    const resolvedRule29 = await resolveArtifactByTag("RULE-TEST-29", { cwd: workspace.cwd });
    expect(resolvedRule29.tag).toBe("RULE-TEST-29");
    expect(resolvedRule29.subtype).toBe("RULE");
    expect(resolvedRule29.filepath).toBe(rule29.filepath);

    const resolvedAdr6 = await resolveArtifactByTag("ADR-TEST-6", { cwd: workspace.cwd });
    expect(resolvedAdr6.tag).toBe("ADR-TEST-6");
    expect(resolvedAdr6.subtype).toBe("ADR");
    expect(resolvedAdr6.filepath).toBe(adr6.filepath);

    await workspace.cleanup();
  });
});

describe("Artifact Query Service - Deep Inspection (RULE-26, RULE-29, RULE-34)", () => {
  // @verifies RULE-26, RULE-29, RULE-34
  it("[RULE-26][RULE-29][RULE-34] should extract structured details, links, and sections from artifact", async () => {
    const workspace = await createFixtureWorkspace("modie-inspect-details-");
    await workspace.createArtifact({
      subtype: "ADR",
      id: "TEST-60",
      slug: "test-adr",
      links: ["RULE-TEST-1", "ADR-TEST-2"],
      context: "Context explanation text.",
      body: "# Alternatives Considered\nAlternative A and Alternative B.\n\n# Decision\nWe decided on solution X.",
    });

    const details = await getArtifactDetails("ADR-TEST-60", { cwd: workspace.cwd });
    expect(details.tag).toBe("ADR-TEST-60");
    expect(details.subtype).toBe("ADR");
    expect(details.links).toEqual(["RULE-TEST-1", "ADR-TEST-2"]);
    expect(details.context).toBe("Context explanation text.");
    expect(details.sections["Context"]).toBe("Context explanation text.");
    expect(details.sections["Alternatives Considered"]).toBe("Alternative A and Alternative B.");
    expect(details.sections["Decision"]).toBe("We decided on solution X.");

    await workspace.cleanup();
  });

  // @verifies RULE-22, RULE-26, RULE-29, RULE-34
  it("[RULE-22][RULE-26][RULE-29][RULE-34] should extract acceptance criteria and depends_on for TASK artifacts", async () => {
    const workspace = await createFixtureWorkspace("modie-inspect-task-");
    await workspace.createArtifact({
      subtype: "TASK",
      id: "TEST-61",
      slug: "test-task",
      depends_on: ["TASK-TEST-10"],
      links: ["RULE-TEST-29"],
      context: "Task context description.",
      rawContent: `---
depends_on:
  - TASK-TEST-10
links:
  - RULE-TEST-29
---

# Context
Task context description.

# Acceptance Criteria
- [x] First item checked
- [ ] Second item pending
`,
    });

    const details = await getArtifactDetails("TASK-TEST-61", { cwd: workspace.cwd });
    expect(details.tag).toBe("TASK-TEST-61");
    expect(details.subtype).toBe("TASK");
    expect(details.depends_on).toEqual(["TASK-TEST-10"]);
    expect(details.links).toEqual(["RULE-TEST-29"]);
    expect(details.acceptanceCriteria?.length).toBe(2);
    expect(details.acceptanceCriteria?.[0]?.completed).toBe(true);
    expect(details.acceptanceCriteria?.[1]?.completed).toBe(false);

    await workspace.cleanup();
  });
});
