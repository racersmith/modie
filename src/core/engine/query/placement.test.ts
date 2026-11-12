/**
 * Unit tests for artifact least-scope placement and relocation auditing query service.
 * Complies with RULE-6, RULE-8, RULE-12, RULE-16, RULE-17, RULE-34, and RULE-35.
 * @verifies RULE-6, RULE-8, RULE-12, RULE-16, RULE-17, RULE-34, RULE-35
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { formatArtifactTag } from "../../domain/index.ts";
import {
  createFixtureWorkspace,
  type FixtureWorkspace,
} from "../../platform/testing/index.ts";
import { auditArtifactPlacement } from "./placement.ts";

describe("Artifact Placement Auditing Query Service (RULE-6, RULE-8, RULE-12, RULE-16, RULE-17, RULE-34, RULE-35)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-placement-test-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-12, RULE-34, RULE-35
  it("[RULE-12][RULE-34][RULE-35] should classify rule as OPTIMAL when citations match current scope", async () => {
    const ruleTag = formatArtifactTag("RULE", 601);

    await workspace.createRule({
      id: 601,
      title: "CLI Stream Separation",
      scopeDir: "src/interfaces/cli",
    });

    // Write 3 citations in src/interfaces/cli
    await workspace.writeFile(
      "src/interfaces/cli/bin.ts",
      `// @verifies ${ruleTag}\nconsole.log("cli");`,
    );
    await workspace.writeFile(
      "src/interfaces/cli/commands.ts",
      `// @verifies ${ruleTag}\nexport const run = () => {};`,
    );
    await workspace.writeFile(
      "src/interfaces/cli/cli.test.ts",
      `it("[${ruleTag}] should separate streams", () => {});`,
    );

    const report = await auditArtifactPlacement(ruleTag, {
      cwd: workspace.cwd,
      minCitationsThreshold: 3,
    });

    expect(report.totalAudited).toBe(1);
    expect(report.optimalCount).toBe(1);
    expect(report.overScopedCount).toBe(0);
    expect(report.underScopedCount).toBe(0);

    const suggestion = report.suggestions[0]!;
    expect(suggestion.tag).toBe(ruleTag);
    expect(suggestion.currentScope).toBe("src/interfaces/cli");
    expect(suggestion.recommendedScope).toBe("src/interfaces/cli");
    expect(suggestion.status).toBe("OPTIMAL");
    expect(suggestion.citationsCount).toBe(3);
    expect(suggestion.violations).toHaveLength(0);
  });

  // @verifies RULE-12, RULE-34, RULE-35
  it("[RULE-12][RULE-34][RULE-35] should classify rule as OVER_SCOPED when all citations share a deeper common ancestor", async () => {
    const ruleTag = formatArtifactTag("RULE", 602);

    // Created at 'src', but all citations in 'src/core'
    await workspace.createRule({
      id: 602,
      title: "Core Layer Invariant",
      scopeDir: "src",
    });

    await workspace.writeFile(
      "src/core/domain/entity.ts",
      `// @verifies ${ruleTag}\nexport class Entity {}`,
    );
    await workspace.writeFile(
      "src/core/engine/runner.ts",
      `// @verifies ${ruleTag}\nexport const run = () => {};`,
    );
    await workspace.writeFile(
      "src/core/platform/vcs.ts",
      `// @verifies ${ruleTag}\nexport const vcs = {};`,
    );

    const report = await auditArtifactPlacement(ruleTag, {
      cwd: workspace.cwd,
      minCitationsThreshold: 3,
    });

    expect(report.totalAudited).toBe(1);
    expect(report.overScopedCount).toBe(1);
    expect(report.optimalCount).toBe(0);

    const suggestion = report.suggestions[0]!;
    expect(suggestion.currentScope).toBe("src");
    expect(suggestion.recommendedScope).toBe("src/core");
    expect(suggestion.status).toBe("OVER_SCOPED");
    expect(suggestion.citationsCount).toBe(3);
    expect(suggestion.suggestedRelativePath).toContain("src/core/.modie/rules");
  });

  // @verifies RULE-6, RULE-12, RULE-34, RULE-35
  it("[RULE-6][RULE-12][RULE-34][RULE-35] should classify rule as UNDER_SCOPED when citations escape governing scope", async () => {
    const ruleTag = formatArtifactTag("RULE", 603);

    // Created in nested 'src/core/engine', but cited in 'src/interfaces/cli'
    await workspace.createRule({
      id: 603,
      title: "Shared Format Rule",
      scopeDir: "src/core/engine",
    });

    await workspace.writeFile(
      "src/core/engine/service.ts",
      `// @verifies ${ruleTag}\nexport const s = 1;`,
    );
    await workspace.writeFile(
      "src/interfaces/cli/adapter.ts",
      `// @verifies ${ruleTag}\nexport const a = 2;`,
    );

    const report = await auditArtifactPlacement(ruleTag, {
      cwd: workspace.cwd,
      minCitationsThreshold: 1,
    });

    expect(report.totalAudited).toBe(1);
    expect(report.underScopedCount).toBe(1);

    const suggestion = report.suggestions[0]!;
    expect(suggestion.currentScope).toBe("src/core/engine");
    expect(suggestion.recommendedScope).toBe("src");
    expect(suggestion.status).toBe("UNDER_SCOPED");
    expect(suggestion.violations).toContain("src/interfaces/cli/adapter.ts");
    expect(suggestion.suggestedRelativePath).toContain("src/.modie/rules");
  });

  // @verifies RULE-12, RULE-34, RULE-35
  it("[RULE-12][RULE-34][RULE-35] should classify rule as INCHOATE when citations are below threshold without violations", async () => {
    const ruleTag = formatArtifactTag("RULE", 604);

    await workspace.createRule({
      id: 604,
      title: "Young Invariant",
      scopeDir: "src",
    });

    // Only 1 citation in src/core (below threshold 3)
    await workspace.writeFile(
      "src/core/domain/first.ts",
      `// @verifies ${ruleTag}\nexport const f = 1;`,
    );

    const report = await auditArtifactPlacement(ruleTag, {
      cwd: workspace.cwd,
      minCitationsThreshold: 3,
    });

    expect(report.totalAudited).toBe(1);
    expect(report.inchoateCount).toBe(1);

    const suggestion = report.suggestions[0]!;
    expect(suggestion.currentScope).toBe("src");
    expect(suggestion.status).toBe("INCHOATE");
  });

  // @verifies RULE-16, RULE-17, RULE-34, RULE-35
  it("[RULE-16][RULE-17][RULE-34][RULE-35] should audit ADR placement based on active rule links", async () => {
    const adrTag = formatArtifactTag("ADR", 605);
    const ruleTag1 = formatArtifactTag("RULE", 605);
    const ruleTag2 = formatArtifactTag("RULE", 606);

    // ADR placed at root
    await workspace.createAdr({
      id: 605,
      slug: "cli-output-protocol",
    });

    // Rules citing the ADR, both scoped inside src/interfaces/cli
    await workspace.createRule({
      id: 605,
      title: "CLI Stream Rule 1",
      scopeDir: "src/interfaces/cli",
      links: [adrTag],
    });
    await workspace.createRule({
      id: 606,
      title: "CLI Stream Rule 2",
      scopeDir: "src/interfaces/cli",
      links: [adrTag],
    });

    const report = await auditArtifactPlacement(adrTag, {
      cwd: workspace.cwd,
      minCitationsThreshold: 2,
    });

    expect(report.totalAudited).toBe(1);
    expect(report.overScopedCount).toBe(1);

    const suggestion = report.suggestions[0]!;
    expect(suggestion.tag).toBe(adrTag);
    expect(suggestion.currentScope).toBe(".");
    expect(suggestion.recommendedScope).toBe("src/interfaces/cli");
    expect(suggestion.status).toBe("OVER_SCOPED");
    expect(suggestion.suggestedRelativePath).toContain(
      "src/interfaces/cli/.modie/adrs",
    );
  });

  // @verifies RULE-12, RULE-34, RULE-35
  it("[RULE-12][RULE-34][RULE-35] should populate outOfScopePaths and outOfScopeCitationsCount for UNDER_SCOPED artifacts", async () => {
    const ruleTag = formatArtifactTag("RULE", 701);
    await workspace.createRule({
      id: 701,
      title: "Leaf Specialized Invariant",
      scopeDir: "src/interfaces/cli",
    });

    // Write a citation outside the rule's scope (e.g. in src/core/engine)
    await workspace.writeFile(
      "src/core/engine/stray.ts",
      `// @verifies ${ruleTag}\nexport const stray = true;`,
    );

    const report = await auditArtifactPlacement(ruleTag, {
      cwd: workspace.cwd,
    });

    expect(report.totalAudited).toBe(1);
    expect(report.underScopedCount).toBe(1);

    const suggestion = report.suggestions[0]!;
    expect(suggestion.status).toBe("UNDER_SCOPED");
    expect(suggestion.currentScope).toBe("src/interfaces/cli");
    expect(suggestion.recommendedScope).toBe("src");
    expect(suggestion.outOfScopeCitationsCount).toBe(1);
    expect(suggestion.outOfScopePaths).toBeDefined();
    expect(suggestion.outOfScopePaths).toContain("src/core/engine/stray.ts");
    expect(suggestion.violations).toContain("src/core/engine/stray.ts");
  });
});
