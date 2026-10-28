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
  listActiveArtifacts,
  listAdrs,
  listRules,
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

describe("Artifact Query Service - Listing Active RULE and ADR Artifacts with Ancestral Scope Filtering (ADR-4, RULE-9, RULE-25, RULE-34, RULE-35)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-list-artifacts-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies ADR-4, RULE-25, RULE-34, RULE-35
  it("[ADR-4][RULE-25][RULE-34][RULE-35] should list active RULE and ADR artifacts with titles, tags, relative paths, and links while excluding archived items", async () => {
    const adr1Tag = makeTestTag("ADR", 1);
    const adr2Tag = makeTestTag("ADR", 2);
    const rule1Tag = makeTestTag("RULE", 1);
    const rule2Tag = makeTestTag("RULE", 2);
    const rule10Tag = makeTestTag("RULE", 10);

    await workspace.createAdr({
      id: 2,
      slug: "second-decision",
      links: [],
      context: "Second decision context",
    });
    await workspace.createAdr({
      id: 1,
      slug: "first-decision",
      links: [rule1Tag],
      context: "First decision context",
    });
    await workspace.createArtifact({
      subtype: "ADR",
      id: "99",
      slug: "archived-decision",
      isArchived: true,
      context: "Archived",
    });

    await workspace.createRule({
      id: 10,
      slug: "tenth-invariant-rule",
      links: [adr1Tag, adr2Tag],
      body: "Tenth rule body",
    });
    await workspace.createRule({
      id: 1,
      slug: "root-invariant-rule",
      links: [adr1Tag],
      body: "Root rule body",
    });
    await workspace.createRule({
      id: 2,
      slug: "cli-invariant-rule",
      subDir: "src/interfaces/cli/.modie/rules",
      links: [],
      body: "CLI rule body",
    });
    await workspace.createArtifact({
      subtype: "RULE",
      id: "88",
      slug: "archived-rule",
      isArchived: true,
      body: "Archived rule",
    });

    const rules = await listRules({ cwd: workspace.cwd });
    expect(rules.map((r) => r.tag)).toEqual([rule1Tag, rule2Tag, rule10Tag]);
    expect(rules[0]?.title).toBe("root invariant rule");
    expect(rules[0]?.links).toEqual([adr1Tag]);
    expect(rules[0]?.relativePath).toBe(
      `.modie/rules/root-invariant-rule.${rule1Tag}.md`,
    );
    expect(rules[0]?.scope).toBe(".");

    expect(rules[1]?.title).toBe("cli invariant rule");
    expect(rules[1]?.links).toEqual([]);
    expect(rules[1]?.relativePath).toBe(
      `src/interfaces/cli/.modie/rules/cli-invariant-rule.${rule2Tag}.md`,
    );
    expect(rules[1]?.scope).toBe("src/interfaces/cli");

    expect(rules[2]?.links).toEqual([adr1Tag, adr2Tag]);

    const adrs = await listAdrs({ cwd: workspace.cwd });
    expect(adrs.map((a) => a.tag)).toEqual([adr1Tag, adr2Tag]);
    expect(adrs[0]?.title).toBe("first decision");
    expect(adrs[0]?.links).toEqual([rule1Tag]);
    expect(adrs[0]?.relativePath).toBe(
      `.modie/adrs/first-decision.${adr1Tag}.md`,
    );
  });

  // @verifies RULE-9, RULE-25, RULE-34, RULE-35
  it("[RULE-9][RULE-25][RULE-34][RULE-35] should filter rules and ADRs by ancestral scope traversal up to workspace root", async () => {
    const rootRuleTag = makeTestTag("RULE", 1);
    const srcRuleTag = makeTestTag("RULE", 2);
    const interfacesRuleTag = makeTestTag("RULE", 3);
    const cliRuleTag = makeTestTag("RULE", 4);
    const mcpRuleTag = makeTestTag("RULE", 5);
    const deepCliRuleTag = makeTestTag("RULE", 6);

    await workspace.createRule({
      id: 1,
      slug: "root-rule",
      subDir: ".modie/rules",
    });
    await workspace.createRule({
      id: 2,
      slug: "src-rule",
      subDir: "src/.modie/rules",
    });
    await workspace.createRule({
      id: 3,
      slug: "interfaces-rule",
      subDir: "src/interfaces/.modie/rules",
    });
    await workspace.createRule({
      id: 4,
      slug: "cli-rule",
      subDir: "src/interfaces/cli/.modie/rules",
    });
    await workspace.createRule({
      id: 5,
      slug: "mcp-sibling-rule",
      subDir: "src/interfaces/mcp/.modie/rules",
    });
    await workspace.createRule({
      id: 6,
      slug: "deep-cli-commands-rule",
      subDir: "src/interfaces/cli/commands/.modie/rules",
    });

    // 1. Scope at src/interfaces/cli collects [., src, src/interfaces, src/interfaces/cli]
    //    and omits sibling (src/interfaces/mcp) and descendant (src/interfaces/cli/commands)
    const cliScopedRules = await listRules({
      cwd: workspace.cwd,
      scope: "src/interfaces/cli",
    });
    expect(cliScopedRules.map((r) => r.tag)).toEqual([
      rootRuleTag,
      srcRuleTag,
      interfacesRuleTag,
      cliRuleTag,
    ]);

    // 2. Scope at deeper subdirectory without its own .modie collects all ancestors up to root
    const deepLeafScoped = await listActiveArtifacts("RULE", {
      cwd: workspace.cwd,
      scope: "src/interfaces/cli/commands/rule",
    });
    expect(deepLeafScoped.map((r) => r.tag)).toEqual([
      rootRuleTag,
      srcRuleTag,
      interfacesRuleTag,
      cliRuleTag,
      deepCliRuleTag,
    ]);

    // 3. Scope at root "." collects only root rules
    const rootScopedRules = await listRules({
      cwd: workspace.cwd,
      scope: ".",
    });
    expect(rootScopedRules.map((r) => r.tag)).toEqual([rootRuleTag]);
  });

  // @verifies RULE-9, RULE-34
  it("[RULE-9][RULE-34] should reject scope paths outside the workspace root", async () => {
    await expect(
      listRules({ cwd: workspace.cwd, scope: "../outside-workspace" }),
    ).rejects.toThrow(/scope path must reside within the workspace root/);
  });
});
