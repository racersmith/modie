/**
 * Unit and integration tests for the core graph & link validation engine
 * and frontmatter link mutation service.
 * Verifies ADR-5, RULE-7, RULE-13, RULE-14, RULE-15, RULE-16, RULE-17,
 * RULE-18, RULE-19, RULE-34, RULE-35, and RULE-36.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import {
  LINK_POLICY,
  applyLinkMutation,
  detectTaskDependencyCycle,
  inferLinkRelationship,
  isValidAdrLinkTag,
  isValidGovernanceLinkTag,
  isValidTaskDependencyTag,
  linkArtifact,
  mutateFrontmatterListField,
  formatArtifactTag,
  resolveArtifactByTag,
  resolveSubtypeLinkPolicy,
  unlinkArtifact,
  validateArtifactLink,
  validateLinkTarget,
} from "../../index.ts";
import {
  createFixtureWorkspace,
  type FixtureWorkspace,
} from "../../platform/testing/index.ts";

describe("Core Graph & Link Validation and Frontmatter Mutation (ADR-5, RULE-13..19, RULE-36)", () => {
  let workspace: FixtureWorkspace;

  const rootAdrTag = formatArtifactTag("ADR", 501);
  const rootAdr2Tag = formatArtifactTag("ADR", 502);
  const coreAdrTag = formatArtifactTag("ADR", 503);
  const cliAdrTag = formatArtifactTag("ADR", 504);
  const mcpAdrTag = formatArtifactTag("ADR", 505);

  const rootRuleTag = formatArtifactTag("RULE", 501);
  const coreRuleTag = formatArtifactTag("RULE", 502);
  const cliRuleTag = formatArtifactTag("RULE", 503);
  const mcpRuleTag = formatArtifactTag("RULE", 504);

  const taskATag = formatArtifactTag("TASK", 501);
  const taskBTag = formatArtifactTag("TASK", 502);
  const taskCTag = formatArtifactTag("TASK", 503);
  const cliTaskTag = formatArtifactTag("TASK", 504);

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-linking-core-");

    // Root ADRs
    await workspace.createAdr({
      id: 501,
      slug: "root-gov-adr",
      links: [],
      context: "Root governance decision.",
    });
    await workspace.createAdr({
      id: 502,
      slug: "root-secondary-adr",
      links: [],
      context: "Secondary root decision.",
    });

    // Subdirectory ADRs
    await workspace.createAdr({
      id: 503,
      slug: "core-subsystem-adr",
      scopeDir: "src/core",
      links: [],
      context: "Core subsystem decision.",
    });
    await workspace.createAdr({
      id: 504,
      slug: "cli-subsystem-adr",
      scopeDir: "src/interfaces/cli",
      links: [],
      context: "CLI subsystem decision.",
    });
    await workspace.createAdr({
      id: 505,
      slug: "mcp-subsystem-adr",
      scopeDir: "src/interfaces/mcp",
      links: [],
      context: "MCP subsystem decision.",
    });

    // Root & Subdirectory RULEs
    await workspace.createRule({
      id: 501,
      slug: "root-gov-rule",
      links: [],
      body: "Root governance invariant assertion.",
    });
    await workspace.createRule({
      id: 502,
      slug: "core-subsystem-rule",
      scopeDir: "src/core",
      links: [],
      body: "Core subsystem invariant assertion.",
    });
    await workspace.createRule({
      id: 503,
      slug: "cli-subsystem-rule",
      scopeDir: "src/interfaces/cli",
      links: [],
      body: "CLI subsystem invariant assertion.",
    });
    await workspace.createRule({
      id: 504,
      slug: "mcp-subsystem-rule",
      scopeDir: "src/interfaces/mcp",
      links: [],
      body: "MCP subsystem invariant assertion.",
    });

    // Tasks across directories
    await workspace.createTask({
      id: 501,
      slug: "task-alpha",
      title: "Task Alpha",
      criteria: ["Alpha criterion"],
    });
    await workspace.createTask({
      id: 502,
      slug: "task-beta",
      title: "Task Beta",
      scopeDir: "src/core",
      criteria: ["Beta criterion"],
    });
    await workspace.createTask({
      id: 503,
      slug: "task-gamma",
      title: "Task Gamma",
      scopeDir: "src/interfaces/mcp",
      criteria: ["Gamma criterion"],
    });
    await workspace.createTask({
      id: 504,
      slug: "cli-scoped-task",
      title: "CLI Scoped Task",
      scopeDir: "src/interfaces/cli",
      criteria: ["CLI criterion"],
    });
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies ADR-5, RULE-15, RULE-18, RULE-36
  it("[ADR-5][RULE-15][RULE-18][RULE-36] should automatically infer relationship type from source and target subtypes", () => {
    expect(inferLinkRelationship("TASK", "TASK")).toBe("depends_on");
    expect(inferLinkRelationship("TASK", "ADR")).toBe("links");
    expect(inferLinkRelationship("TASK", "RULE")).toBe("links");
    expect(inferLinkRelationship("RULE", "ADR")).toBe("links");
    expect(inferLinkRelationship("ADR", "RULE")).toBe("links");
    expect(inferLinkRelationship("ADR", "ADR")).toBe("links");
  });

  // @verifies ADR-5, RULE-13, RULE-14, RULE-15, RULE-16, RULE-17, RULE-18, RULE-36
  it("[ADR-5][RULE-13][RULE-16][RULE-17][RULE-18][RULE-36] should permit valid links and dependencies across compliant subtypes and scopes", async () => {
    // 1. RULE in src/core linking to ancestor ADR at root (RULE-13, RULE-16)
    const ruleToAncestorAdr = await linkArtifact({
      source: coreRuleTag,
      target: rootAdrTag,
      cwd: workspace.cwd,
    });
    expect(ruleToAncestorAdr.changed).toBe(true);
    expect(ruleToAncestorAdr.relationship).toBe("links");
    expect(ruleToAncestorAdr.links).toEqual([rootAdrTag]);

    // 2. RULE in src/core linking to same-scope ADR in src/core (RULE-13, RULE-16)
    const ruleToSameScopeAdr = await linkArtifact({
      source: coreRuleTag,
      target: coreAdrTag,
      cwd: workspace.cwd,
    });
    expect(ruleToSameScopeAdr.changed).toBe(true);
    expect(ruleToSameScopeAdr.links).toEqual([rootAdrTag, coreAdrTag]);

    // 3. ADR at root linking to descendant RULE in src/core (RULE-14, RULE-17)
    const adrToDescendantRule = await linkArtifact({
      source: rootAdrTag,
      target: coreRuleTag,
      cwd: workspace.cwd,
    });
    expect(adrToDescendantRule.changed).toBe(true);
    expect(adrToDescendantRule.relationship).toBe("links");
    expect(adrToDescendantRule.links).toEqual([coreRuleTag]);

    // 4. ADR in src/core linking to ancestor ADR at root (ADR-5, RULE-14, RULE-19)
    const adrToAncestorAdr = await linkArtifact({
      source: coreAdrTag,
      target: rootAdrTag,
      cwd: workspace.cwd,
    });
    expect(adrToAncestorAdr.changed).toBe(true);
    expect(adrToAncestorAdr.links).toEqual([rootAdrTag]);

    // 5. TASK in src/interfaces/cli linking to ancestor ADR at root and same-scope RULE in cli (RULE-7, RULE-15)
    const taskToRootAdr = await linkArtifact({
      source: cliTaskTag,
      target: rootAdrTag,
      cwd: workspace.cwd,
    });
    expect(taskToRootAdr.changed).toBe(true);
    expect(taskToRootAdr.relationship).toBe("links");
    expect(taskToRootAdr.links).toEqual([rootAdrTag]);

    const taskToCliRule = await linkArtifact({
      source: cliTaskTag,
      target: cliRuleTag,
      cwd: workspace.cwd,
    });
    expect(taskToCliRule.changed).toBe(true);
    expect(taskToCliRule.links).toEqual([rootAdrTag, cliRuleTag]);

    // 6. TASK -> TASK across arbitrary scopes maps to depends_on (RULE-18)
    const taskDep = await linkArtifact({
      source: cliTaskTag,
      target: taskCTag,
      cwd: workspace.cwd,
    });
    expect(taskDep.changed).toBe(true);
    expect(taskDep.relationship).toBe("depends_on");
    expect(taskDep.depends_on).toEqual([taskCTag]);
  });

  // @verifies ADR-5, RULE-13, RULE-14, RULE-15, RULE-18, RULE-36
  it("[ADR-5][RULE-13][RULE-14][RULE-15][RULE-18][RULE-36] should reject invalid subtype combinations and self-references", async () => {
    // Self-reference on RULE, ADR, and TASK
    await expect(
      validateArtifactLink(rootAdrTag, rootAdrTag, { cwd: workspace.cwd }),
    ).rejects.toThrow(/Self-referential link violation/);

    await expect(
      validateArtifactLink(
        rootAdrTag,
        `.modie/adrs/root-gov-adr.${rootAdrTag}.md`,
        { cwd: workspace.cwd },
      ),
    ).rejects.toThrow(/Self-referential link violation/);

    await expect(
      validateArtifactLink(taskATag, taskATag, { cwd: workspace.cwd }),
    ).rejects.toThrow(/Self-referential link violation/);

    // RULE -> RULE prohibited (RULE-13)
    await expect(
      linkArtifact({
        source: coreRuleTag,
        target: rootRuleTag,
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/RULE-13/);

    // RULE -> TASK prohibited (RULE-13)
    await expect(
      linkArtifact({
        source: rootRuleTag,
        target: taskATag,
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/RULE-13/);

    // ADR -> TASK prohibited (RULE-14)
    await expect(
      linkArtifact({
        source: rootAdrTag,
        target: taskATag,
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/RULE-14/);

    // TASK -> TASK with forced relationship: "links" prohibited (RULE-15)
    await expect(
      linkArtifact({
        source: taskATag,
        target: taskBTag,
        relationship: "links",
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/RULE-15/);

    // TASK -> ADR with forced relationship: "depends_on" prohibited (RULE-18)
    await expect(
      linkArtifact({
        source: taskATag,
        target: rootAdrTag,
        relationship: "depends_on",
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/RULE-18/);

    // RULE -> ADR with forced relationship: "depends_on" prohibited (RULE-18)
    await expect(
      linkArtifact({
        source: rootRuleTag,
        target: rootAdrTag,
        relationship: "depends_on",
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/RULE-18/);
  });

  // @verifies ADR-5, RULE-7, RULE-16, RULE-17, RULE-19, RULE-36
  it("[ADR-5][RULE-7][RULE-16][RULE-17][RULE-19][RULE-36] should reject spatial ancestry, descendant subtree, and sideways sibling violations", async () => {
    // 1. RULE at root linking to descendant ADR in src/core (RULE-16 violation)
    await expect(
      linkArtifact({
        source: rootRuleTag,
        target: coreAdrTag,
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/RULE-16/);

    // 2. RULE in cli linking to sideways sibling ADR in mcp (RULE-16, RULE-19 violation)
    await expect(
      linkArtifact({
        source: cliRuleTag,
        target: mcpAdrTag,
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/RULE-16/);

    // 3. ADR in src/core linking to ancestor RULE at root (RULE-17 violation)
    await expect(
      linkArtifact({
        source: coreAdrTag,
        target: rootRuleTag,
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/RULE-17/);

    // 4. ADR in cli linking to sideways sibling RULE in mcp (RULE-17, RULE-19 violation)
    await expect(
      linkArtifact({
        source: cliAdrTag,
        target: mcpRuleTag,
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/RULE-17/);

    // 5. ADR at root linking to descendant ADR in src/core (ADR-5, RULE-19 violation)
    await expect(
      linkArtifact({
        source: rootAdrTag,
        target: coreAdrTag,
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/ADR-5/);

    // 6. ADR in cli linking to sideways sibling ADR in mcp (ADR-5, RULE-19 violation)
    await expect(
      linkArtifact({
        source: cliAdrTag,
        target: mcpAdrTag,
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/RULE-19/);

    // 7. TASK at root linking to descendant RULE in src/core (RULE-7, RULE-19 violation)
    await expect(
      linkArtifact({
        source: taskATag,
        target: coreRuleTag,
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/RULE-7/);

    // 8. TASK in cli linking to sideways sibling RULE in mcp (RULE-7, RULE-19 violation)
    await expect(
      linkArtifact({
        source: cliTaskTag,
        target: mcpRuleTag,
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/RULE-7/);
  });

  // @verifies RULE-18, RULE-36
  it("[RULE-18][RULE-36] should detect and reject direct and transitive circular task dependencies", async () => {
    // Establish chain: taskA -> taskB -> taskC
    await linkArtifact({
      source: taskATag,
      target: taskBTag,
      cwd: workspace.cwd,
    });
    await linkArtifact({
      source: taskBTag,
      target: taskCTag,
      cwd: workspace.cwd,
    });

    // Direct 2-node cycle check: taskB -> taskA
    const directCycle = await detectTaskDependencyCycle(
      taskBTag,
      taskATag,
      workspace.cwd,
    );
    expect(directCycle).toEqual([taskBTag, taskATag, taskBTag]);

    await expect(
      linkArtifact({
        source: taskBTag,
        target: taskATag,
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/Circular task dependency detected.*RULE-18/);

    // Transitive 3-node cycle check: taskC -> taskA
    const transitiveCycle = await detectTaskDependencyCycle(
      taskCTag,
      taskATag,
      workspace.cwd,
    );
    expect(transitiveCycle).toEqual([taskCTag, taskATag, taskBTag, taskCTag]);

    await expect(
      linkArtifact({
        source: taskCTag,
        target: taskATag,
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(
      new RegExp(
        `Circular task dependency detected: adding dependency "${taskCTag} -> ${taskATag}" creates a cycle \\(${taskCTag} -> ${taskATag} -> ${taskBTag} -> ${taskCTag}\\) \\(RULE-18\\)`,
      ),
    );
  });

  // @verifies RULE-36
  it("[RULE-36] should preserve Markdown body and unrelated frontmatter fields byte-for-byte during link and unlink", async () => {
    // Construct a document with custom frontmatter fields and a Markdown body containing horizontal rules (---)
    const customFrontmatterAndBody = [
      "---",
      "links:",
      `  - ${rootAdrTag}`,
      "supersedes:",
      `  - ${formatArtifactTag("RULE", 499)}`,
      "---",
      "",
      "# Custom Rule Heading",
      "",
      "Paragraph before horizontal rule.",
      "",
      "---",
      "",
      "Paragraph after horizontal rule with exact spacing.  ",
      "",
    ].join("\n");

    const expectedBodyWithLeadingFence = [
      "",
      "# Custom Rule Heading",
      "",
      "Paragraph before horizontal rule.",
      "",
      "---",
      "",
      "Paragraph after horizontal rule with exact spacing.  ",
      "",
    ].join("\n");

    const { updatedContent: afterAdd, changed: addChanged } =
      mutateFrontmatterListField(
        customFrontmatterAndBody,
        "links",
        "add",
        rootAdr2Tag,
      );

    expect(addChanged).toBe(true);
    expect(afterAdd).toContain(`supersedes:\n  - ${formatArtifactTag("RULE", 499)}`);
    expect(afterAdd).toContain(`links:\n  - ${rootAdrTag}\n  - ${rootAdr2Tag}`);
    expect(afterAdd.endsWith(expectedBodyWithLeadingFence)).toBe(true);

    // Idempotent duplicate add must return changed: false and identical string
    const { updatedContent: afterDupAdd, changed: dupAddChanged } =
      mutateFrontmatterListField(afterAdd, "links", "add", rootAdr2Tag);
    expect(dupAddChanged).toBe(false);
    expect(afterDupAdd).toBe(afterAdd);

    // Unlink first ADR
    const { updatedContent: afterRemove1, changed: rem1Changed } =
      mutateFrontmatterListField(afterAdd, "links", "remove", rootAdrTag);
    expect(rem1Changed).toBe(true);
    expect(afterRemove1).toContain(`links:\n  - ${rootAdr2Tag}`);
    expect(afterRemove1).toContain(
      `supersedes:\n  - ${formatArtifactTag("RULE", 499)}`,
    );
    expect(afterRemove1.endsWith(expectedBodyWithLeadingFence)).toBe(true);

    // Unlink second ADR -> renders `links: []`
    const { updatedContent: afterRemove2, changed: rem2Changed } =
      mutateFrontmatterListField(afterRemove1, "links", "remove", rootAdr2Tag);
    expect(rem2Changed).toBe(true);
    expect(afterRemove2).toContain("links: []");
    expect(afterRemove2).toContain(
      `supersedes:\n  - ${formatArtifactTag("RULE", 499)}`,
    );
    expect(afterRemove2.endsWith(expectedBodyWithLeadingFence)).toBe(true);

    // Idempotent remove when already absent
    const { updatedContent: afterDupRemove, changed: dupRemChanged } =
      mutateFrontmatterListField(afterRemove2, "links", "remove", rootAdr2Tag);
    expect(dupRemChanged).toBe(false);
    expect(afterDupRemove).toBe(afterRemove2);
  });

  // @verifies RULE-36
  it("[RULE-36] should prepend frontmatter block when linking a bare RULE artifact that has no frontmatter", async () => {
    const bareBody = "A bare invariant assertion without YAML frontmatter.\n";
    const rulePath = `${workspace.cwd}/.modie/rules/root-gov-rule.${rootRuleTag}.md`;
    await writeFile(rulePath, bareBody, "utf8");

    const linkRes = await linkArtifact({
      source: rootRuleTag,
      target: rootAdrTag,
      cwd: workspace.cwd,
    });
    expect(linkRes.changed).toBe(true);
    expect(linkRes.links).toEqual([rootAdrTag]);

    const onDiskAfterLink = await readFile(rulePath, "utf8");
    expect(onDiskAfterLink).toBe(
      `---\nlinks:\n  - ${rootAdrTag}\n---\n\n${bareBody}`,
    );

    const unlinkRes = await unlinkArtifact({
      source: rootRuleTag,
      target: rootAdrTag,
      cwd: workspace.cwd,
    });
    expect(unlinkRes.changed).toBe(true);
    expect(unlinkRes.links).toEqual([]);

    const onDiskAfterUnlink = await readFile(rulePath, "utf8");
    expect(onDiskAfterUnlink).toBe(`---\nlinks: []\n---\n\n${bareBody}`);
  });

  // @verifies ADR-4, RULE-4, RULE-36
  it("[ADR-4][RULE-4][RULE-36] should safely mutate supersedes and superseded_by frontmatter fields", () => {
    // 1. Add to existing inline empty array
    const docWithEmptyInline = "---\nsuperseded_by: []\n---\n\n# Body\n";
    const res1 = mutateFrontmatterListField(
      docWithEmptyInline,
      "superseded_by",
      "add",
      "ADR-10",
    );
    expect(res1.changed).toBe(true);
    expect(res1.updatedContent).toContain("superseded_by:\n  - ADR-10");

    // 2. Add to existing list idempotently
    const res2 = mutateFrontmatterListField(
      res1.updatedContent,
      "superseded_by",
      "add",
      "adr-10",
    );
    expect(res2.changed).toBe(false);

    // 3. Append second tag to block list
    const res3 = mutateFrontmatterListField(
      res1.updatedContent,
      "superseded_by",
      "add",
      "ADR-11",
    );
    expect(res3.changed).toBe(true);
    expect(res3.updatedContent).toContain(
      "superseded_by:\n  - ADR-10\n  - ADR-11",
    );

    // 4. Remove from list
    const res4 = mutateFrontmatterListField(
      res3.updatedContent,
      "superseded_by",
      "remove",
      "ADR-10",
    );
    expect(res4.changed).toBe(true);
    expect(res4.updatedContent).toContain("superseded_by:\n  - ADR-11");
    expect(res4.updatedContent).not.toContain("ADR-10");

    // 5. Remove until empty collapses to superseded_by: []
    const res5 = mutateFrontmatterListField(
      res4.updatedContent,
      "superseded_by",
      "remove",
      "ADR-11",
    );
    expect(res5.changed).toBe(true);
    expect(res5.updatedContent).toContain("superseded_by: []");

    // 6. Mutate supersedes field in document without frontmatter
    const bareDoc = "# Decision\n\nContent without frontmatter.";
    const res6 = mutateFrontmatterListField(
      bareDoc,
      "supersedes",
      "add",
      "ADR-1",
    );
    expect(res6.changed).toBe(true);
    expect(res6.updatedContent).toBe(
      "---\nsupersedes:\n  - ADR-1\n---\n\n# Decision\n\nContent without frontmatter.",
    );
  });

  // @verifies ADR-5, RULE-7, RULE-13, RULE-14, RULE-15, RULE-16, RULE-17, RULE-18, RULE-19, RULE-36
  it("[ADR-5][RULE-7][RULE-13..19][RULE-36] should validate link targets via shared validation primitive across subtypes and scopes", async () => {
    // 1. Prohibit self-referential linking
    await expect(
      validateLinkTarget("RULE", workspace.cwd, "links", rootRuleTag, {
        cwd: workspace.cwd,
        sourceTag: rootRuleTag,
      }),
    ).rejects.toThrow(/Self-referential link violation/);

    await expect(
      validateLinkTarget("ADR", workspace.cwd, "links", rootAdrTag, {
        cwd: workspace.cwd,
        sourceTag: rootAdrTag,
      }),
    ).rejects.toThrow(/Self-referential link violation/);

    // 1.5 Verify tag syntax validation predicates
    expect(isValidAdrLinkTag("ADR-10")).toBe(true);
    expect(isValidAdrLinkTag("adr-10")).toBe(true);
    expect(isValidAdrLinkTag("RULE-1")).toBe(false);
    expect(isValidAdrLinkTag("TASK-1")).toBe(false);

    expect(isValidGovernanceLinkTag("ADR-10")).toBe(true);
    expect(isValidGovernanceLinkTag("RULE-10")).toBe(true);
    expect(isValidGovernanceLinkTag("TASK-10")).toBe(false);

    expect(isValidTaskDependencyTag("TASK-10")).toBe(true);
    expect(isValidTaskDependencyTag("TASK-10-1")).toBe(true);
    expect(isValidTaskDependencyTag("ADR-10")).toBe(false);
    expect(isValidTaskDependencyTag("RULE-10")).toBe(false);

    // 2. Reject incompatible subtypes
    // RULE -> TASK (RULE-13)
    await expect(
      validateLinkTarget("RULE", workspace.cwd, "links", "TASK-99", {
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/RULE-13/);

    // ADR -> TASK (RULE-14)
    await expect(
      validateLinkTarget("ADR", workspace.cwd, "links", "TASK-99", {
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/RULE-14/);

    // TASK links -> TASK (RULE-15)
    await expect(
      validateLinkTarget("TASK", workspace.cwd, "links", "TASK-99", {
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/RULE-15/);

    // TASK depends_on -> RULE (RULE-18)
    await expect(
      validateLinkTarget("TASK", workspace.cwd, "depends_on", "RULE-99", {
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/RULE-18/);

    // 3. RULE -> ADR ancestry checks (RULE-16, RULE-19)
    // Core rule -> Root ADR (valid ancestor)
    const validRuleLink = await validateLinkTarget(
      "RULE",
      "src/core",
      "links",
      rootAdrTag,
      { cwd: workspace.cwd },
    );
    expect(validRuleLink.target.tag).toBe(rootAdrTag);

    // Root rule -> Core ADR (descendant violation)
    await expect(
      validateLinkTarget("RULE", workspace.cwd, "links", coreAdrTag, {
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/RULE-16/);

    // CLI rule -> MCP ADR (sideways sibling violation)
    await expect(
      validateLinkTarget("RULE", "src/interfaces/cli", "links", mcpAdrTag, {
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/RULE-16/);

    // 4. ADR -> RULE scope checks (RULE-17, RULE-19)
    // Root ADR -> Core rule (valid descendant)
    const validAdrRuleLink = await validateLinkTarget(
      "ADR",
      workspace.cwd,
      "links",
      coreRuleTag,
      { cwd: workspace.cwd },
    );
    expect(validAdrRuleLink.target.tag).toBe(coreRuleTag);

    // Core ADR -> Root rule (ancestor violation)
    await expect(
      validateLinkTarget("ADR", "src/core", "links", rootRuleTag, {
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/RULE-17/);

    // CLI ADR -> MCP rule (sideways sibling violation)
    await expect(
      validateLinkTarget("ADR", "src/interfaces/cli", "links", mcpRuleTag, {
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/RULE-17/);

    // 5. ADR -> ADR ancestry checks (ADR-5, RULE-19)
    // Core ADR -> Root ADR (valid ancestor)
    const validAdrAdrLink = await validateLinkTarget(
      "ADR",
      "src/core",
      "links",
      rootAdrTag,
      { cwd: workspace.cwd },
    );
    expect(validAdrAdrLink.target.tag).toBe(rootAdrTag);

    // Root ADR -> Core ADR (descendant violation)
    await expect(
      validateLinkTarget("ADR", workspace.cwd, "links", coreAdrTag, {
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/RULE-19/);

    // CLI ADR -> MCP ADR (sideways sibling violation)
    await expect(
      validateLinkTarget("ADR", "src/interfaces/cli", "links", mcpAdrTag, {
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/RULE-19/);

    // 6. TASK -> ADR/RULE governance scope checks (RULE-7, RULE-19)
    // CLI task -> Root ADR (valid ancestor)
    const validTaskAdrLink = await validateLinkTarget(
      "TASK",
      "src/interfaces/cli",
      "links",
      rootAdrTag,
      { cwd: workspace.cwd },
    );
    expect(validTaskAdrLink.target.tag).toBe(rootAdrTag);

    // CLI task -> MCP Rule (sideways sibling violation)
    await expect(
      validateLinkTarget("TASK", "src/interfaces/cli", "links", mcpRuleTag, {
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/RULE-7/);

    // 7. TASK -> TASK dependency checks (RULE-18)
    // Valid dependency
    const validDep = await validateLinkTarget(
      "TASK",
      "src/interfaces/cli",
      "depends_on",
      taskATag,
      { cwd: workspace.cwd, sourceTag: cliTaskTag },
    );
    expect(validDep.target.tag).toBe(taskATag);
    expect(validDep.relationship).toBe("depends_on");
  });

  // @verifies ADR-5, RULE-13, RULE-14, RULE-15, RULE-18
  it("[ADR-5][RULE-13..15][RULE-18] should define declarative LinkPolicyTable and resolve link policies correctly", () => {
    expect(LINK_POLICY.RULE).toEqual({
      links: { ADR: "ancestor" },
    });
    expect(LINK_POLICY.ADR).toEqual({
      links: { ADR: "ancestor", RULE: "descendant" },
    });
    expect(LINK_POLICY.TASK).toEqual({
      links: { ADR: "ancestor", RULE: "ancestor" },
      depends_on: { TASK: "acyclic" },
    });

    expect(resolveSubtypeLinkPolicy("RULE")).toBe(LINK_POLICY.RULE);
    expect(resolveSubtypeLinkPolicy("rule")).toBe(LINK_POLICY.RULE);
    expect(resolveSubtypeLinkPolicy("ADR")).toBe(LINK_POLICY.ADR);
    expect(resolveSubtypeLinkPolicy("TASK")).toBe(LINK_POLICY.TASK);
    expect(resolveSubtypeLinkPolicy("UNKNOWN")).toBeUndefined();

    // Custom policy override
    const customPolicy = {
      links: { SPEC: "ancestor" as const },
    };
    expect(resolveSubtypeLinkPolicy("SPEC", customPolicy)).toBe(customPolicy);
  });

  it("[ADR-5][RULE-36] should apply link and unlink mutations via shared applyLinkMutation helper", async () => {
    const source = await resolveArtifactByTag(coreAdrTag, {
      cwd: workspace.cwd,
    });
    const target = await resolveArtifactByTag(rootAdrTag, {
      cwd: workspace.cwd,
    });

    // Apply link mutation
    const linkRes = await applyLinkMutation(source, target, "links", "link");
    expect(linkRes.action).toBe("link");
    expect(linkRes.changed).toBe(true);
    expect(linkRes.links).toContain(rootAdrTag);

    // Apply idempotent link mutation
    const idempotentRes = await applyLinkMutation(
      source,
      target,
      "links",
      "link",
    );
    expect(idempotentRes.changed).toBe(false);

    // Apply unlink mutation
    const unlinkRes = await applyLinkMutation(
      source,
      target,
      "links",
      "unlink",
    );
    expect(unlinkRes.action).toBe("unlink");
    expect(unlinkRes.changed).toBe(true);
    expect(unlinkRes.links).not.toContain(rootAdrTag);
  });
});
