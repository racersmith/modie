/**
 * Unit tests for artifact resolution and inspection query services.
 * @verifies ADR-1, ADR-2, RULE-1, RULE-25, RULE-26, RULE-29
 */

import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
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

describe("Artifact Query Service - Resolution by Tag (RULE-25, RULE-29)", () => {
  // @verifies RULE-25, RULE-29, ADR-1, ADR-2
  it("[RULE-25][RULE-29][ADR-1][ADR-2] should resolve active RULE, ADR, and TASK artifacts by tag in test fixture", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-resolve-tag-"));
    const rulePath = join(tempDir, "sample-rule.RULE-50.md");
    const adrPath = join(tempDir, "sample-decision.ADR-50.md");
    const taskPath = join(tempDir, "sample-task.TASK-50.md");

    await writeFile(rulePath, "---\nlinks: []\n---\nRule body", "utf8");
    await writeFile(adrPath, "---\nlinks: []\n---\n# Context\nADR body", "utf8");
    await writeFile(taskPath, "---\ndepends_on: []\nlinks: []\n---\n# Context\nTask body", "utf8");

    const resolvedRule = await resolveArtifactByTag("RULE-50", { cwd: tempDir });
    expect(resolvedRule.tag).toBe("RULE-50");
    expect(resolvedRule.subtype).toBe("RULE");
    expect(resolvedRule.id).toBe("50");
    expect(resolvedRule.slug).toBe("sample-rule");
    expect(resolvedRule.filepath).toBe(rulePath);
    expect(resolvedRule.isArchived).toBe(false);

    const resolvedAdr = await resolveArtifactByTag("adr-50", { cwd: tempDir });
    expect(resolvedAdr.tag).toBe("ADR-50");
    expect(resolvedAdr.subtype).toBe("ADR");
    expect(resolvedAdr.filepath).toBe(adrPath);

    const resolvedTask = await resolveArtifactByTag("TASK-50", { cwd: tempDir });
    expect(resolvedTask.tag).toBe("TASK-50");
    expect(resolvedTask.subtype).toBe("TASK");
    expect(resolvedTask.filepath).toBe(taskPath);

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-1, RULE-29
  it("[RULE-1][RULE-29] should resolve archived artifacts when requested", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-resolve-archived-"));
    const archivedAdrPath = join(tempDir, "legacy-decision.ADR-88.ARCHIVED.md");
    await writeFile(archivedAdrPath, "---\nlinks: []\n---\nArchived decision", "utf8");

    const resolved = await resolveArtifactByTag("ADR-88", { cwd: tempDir });
    expect(resolved.tag).toBe("ADR-88");
    expect(resolved.id).toBe("88");
    expect(resolved.isArchived).toBe(true);
    expect(resolved.filepath).toBe(archivedAdrPath);

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-29
  it("[RULE-29] should prefer active artifact over archived artifact when both exist", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-resolve-conflict-"));
    const activePath = join(tempDir, "active-rule.RULE-77.md");
    const archivedPath = join(tempDir, "archived-rule.RULE-77.ARCHIVED.md");

    await writeFile(activePath, "Active rule", "utf8");
    await writeFile(archivedPath, "Archived rule", "utf8");

    const resolved = await resolveArtifactByTag("RULE-77", { cwd: tempDir });
    expect(resolved.isArchived).toBe(false);
    expect(resolved.filepath).toBe(activePath);

    await rm(tempDir, { recursive: true, force: true });
  });

  it("should throw descriptive error when tag is not found", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-resolve-missing-"));
    await expect(resolveArtifactByTag("RULE-9999", { cwd: tempDir })).rejects.toThrow(
      /Artifact "RULE-9999" was not found/,
    );
    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-29
  it("[RULE-29] should resolve real live artifacts in the modie repository", async () => {
    const rule1 = await resolveArtifactByTag("RULE-1");
    expect(rule1.tag).toBe("RULE-1");
    expect(rule1.subtype).toBe("RULE");
    expect(rule1.filepath).toContain("artifact-filename-structure.RULE-1.md");

    const rule29 = await resolveArtifactByTag("RULE-29");
    expect(rule29.tag).toBe("RULE-29");
    expect(rule29.subtype).toBe("RULE");
    expect(rule29.filepath).toContain("artifact-tag-resolution.RULE-29.md");

    const adr6 = await resolveArtifactByTag("ADR-6");
    expect(adr6.tag).toBe("ADR-6");
    expect(adr6.subtype).toBe("ADR");
    expect(adr6.filepath).toContain("ephemeral-task-lifecycle.ADR-6.md");
  });
});

describe("Artifact Query Service - Deep Inspection (RULE-26, RULE-29)", () => {
  // @verifies RULE-26, RULE-29
  it("[RULE-26][RULE-29] should extract structured details, links, and sections from artifact", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-inspect-details-"));
    const adrPath = join(tempDir, "test-adr.ADR-60.md");
    await writeFile(
      adrPath,
      `---
links:
  - RULE-1
  - ADR-2
---

# Context
Context explanation text.

# Alternatives Considered
Alternative A and Alternative B.

# Decision
We decided on solution X.
`,
      "utf8",
    );

    const details = await getArtifactDetails("ADR-60", { cwd: tempDir });
    expect(details.tag).toBe("ADR-60");
    expect(details.subtype).toBe("ADR");
    expect(details.links).toEqual(["RULE-1", "ADR-2"]);
    expect(details.context).toBe("Context explanation text.");
    expect(details.sections["Context"]).toBe("Context explanation text.");
    expect(details.sections["Alternatives Considered"]).toBe("Alternative A and Alternative B.");
    expect(details.sections["Decision"]).toBe("We decided on solution X.");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-22, RULE-26, RULE-29
  it("[RULE-22][RULE-26][RULE-29] should extract acceptance criteria and depends_on for TASK artifacts", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-inspect-task-"));
    const taskPath = join(tempDir, "test-task.TASK-61.md");
    await writeFile(
      taskPath,
      `---
depends_on:
  - TASK-10
links:
  - RULE-29
---

# Context
Task context description.

# Acceptance Criteria
- [x] First item checked
- [ ] Second item pending
`,
      "utf8",
    );

    const details = await getArtifactDetails("TASK-61", { cwd: tempDir });
    expect(details.tag).toBe("TASK-61");
    expect(details.subtype).toBe("TASK");
    expect(details.depends_on).toEqual(["TASK-10"]);
    expect(details.links).toEqual(["RULE-29"]);
    expect(details.acceptanceCriteria?.length).toBe(2);
    expect(details.acceptanceCriteria?.[0]?.completed).toBe(true);
    expect(details.acceptanceCriteria?.[1]?.completed).toBe(false);

    await rm(tempDir, { recursive: true, force: true });
  });
});
