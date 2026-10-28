/**
 * Unit and integration tests for the core graph & link validation engine
 * and frontmatter link mutation service.
 * Verifies ADR-5, RULE-7, RULE-13, RULE-14, RULE-15, RULE-16, RULE-17,
 * RULE-18, RULE-19, RULE-34, RULE-35, and RULE-36.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import {
  detectTaskDependencyCycle,
  inferLinkRelationship,
  linkArtifact,
  mutateFrontmatterListField,
  unlinkArtifact,
  validateArtifactLink,
} from "../index.ts";
import {
  createFixtureWorkspace,
  makeTestTag,
  type FixtureWorkspace,
} from "../testing/index.ts";

describe("Core Graph & Link Validation and Frontmatter Mutation (ADR-5, RULE-13..19, RULE-36)", () => {
  let workspace: FixtureWorkspace;

  const rootAdrTag = makeTestTag("ADR", 501);
  const rootAdr2Tag = makeTestTag("ADR", 502);
  const coreAdrTag = makeTestTag("ADR", 503);
  const cliAdrTag = makeTestTag("ADR", 504);
  const mcpAdrTag = makeTestTag("ADR", 505);

  const rootRuleTag = makeTestTag("RULE", 501);
  const coreRuleTag = makeTestTag("RULE", 502);
  const cliRuleTag = makeTestTag("RULE", 503);
  const mcpRuleTag = makeTestTag("RULE", 504);

  const taskATag = makeTestTag("TASK", 501);
  const taskBTag = makeTestTag("TASK", 502);
  const taskCTag = makeTestTag("TASK", 503);
  const cliTaskTag = makeTestTag("TASK", 504);

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
      subDir: "src/core/.modie/adrs",
      links: [],
      context: "Core subsystem decision.",
    });
    await workspace.createAdr({
      id: 504,
      slug: "cli-subsystem-adr",
      subDir: "src/interfaces/cli/.modie/adrs",
      links: [],
      context: "CLI subsystem decision.",
    });
    await workspace.createAdr({
      id: 505,
      slug: "mcp-subsystem-adr",
      subDir: "src/interfaces/mcp/.modie/adrs",
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
      subDir: "src/core/.modie/rules",
      links: [],
      body: "Core subsystem invariant assertion.",
    });
    await workspace.createRule({
      id: 503,
      slug: "cli-subsystem-rule",
      subDir: "src/interfaces/cli/.modie/rules",
      links: [],
      body: "CLI subsystem invariant assertion.",
    });
    await workspace.createRule({
      id: 504,
      slug: "mcp-subsystem-rule",
      subDir: "src/interfaces/mcp/.modie/rules",
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
      subDir: "src/core/.modie/tasks",
      criteria: ["Beta criterion"],
    });
    await workspace.createTask({
      id: 503,
      slug: "task-gamma",
      title: "Task Gamma",
      subDir: "src/interfaces/mcp/.modie/tasks",
      criteria: ["Gamma criterion"],
    });
    await workspace.createTask({
      id: 504,
      slug: "cli-scoped-task",
      title: "CLI Scoped Task",
      subDir: "src/interfaces/cli/.modie/tasks",
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
      `  - ${makeTestTag("RULE", 499)}`,
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
    expect(afterAdd).toContain(`supersedes:\n  - ${makeTestTag("RULE", 499)}`);
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
      `supersedes:\n  - ${makeTestTag("RULE", 499)}`,
    );
    expect(afterRemove1.endsWith(expectedBodyWithLeadingFence)).toBe(true);

    // Unlink second ADR -> renders `links: []`
    const { updatedContent: afterRemove2, changed: rem2Changed } =
      mutateFrontmatterListField(afterRemove1, "links", "remove", rootAdr2Tag);
    expect(rem2Changed).toBe(true);
    expect(afterRemove2).toContain("links: []");
    expect(afterRemove2).toContain(
      `supersedes:\n  - ${makeTestTag("RULE", 499)}`,
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
});
