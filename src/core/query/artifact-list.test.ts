/**
 * Unit tests for active artifact collection listing and ancestral scope traversal.
 * @verifies ADR-4, RULE-9, RULE-25, RULE-34, RULE-35
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createFixtureWorkspace,
  makeTestTag,
  type FixtureWorkspace,
} from "../testing/index.ts";
import { listActiveArtifacts, listAdrs, listRules } from "./index.ts";

describe("Artifact List Service - Listing Active RULE and ADR Artifacts with Ancestral Scope Filtering (ADR-4, RULE-9, RULE-25, RULE-34, RULE-35)", () => {
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
      scopeDir: "src/interfaces/cli",
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
    });
    await workspace.createRule({
      id: 2,
      slug: "src-rule",
      scopeDir: "src",
    });
    await workspace.createRule({
      id: 3,
      slug: "interfaces-rule",
      scopeDir: "src/interfaces",
    });
    await workspace.createRule({
      id: 4,
      slug: "cli-rule",
      scopeDir: "src/interfaces/cli",
    });
    await workspace.createRule({
      id: 5,
      slug: "mcp-sibling-rule",
      scopeDir: "src/interfaces/mcp",
    });
    await workspace.createRule({
      id: 6,
      slug: "deep-cli-commands-rule",
      scopeDir: "src/interfaces/cli/commands",
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
