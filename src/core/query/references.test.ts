/**
 * Unit tests for core artifact reference resolution and subtype-agnostic archival guard.
 * Complies with ADR-4, ADR-5, ADR-7, RULE-13, RULE-14, RULE-15, RULE-23, RULE-25, RULE-27, RULE-31, RULE-34, and RULE-35.
 * @verifies ADR-7, RULE-23, RULE-25, RULE-31, RULE-34, RULE-35
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createFixtureWorkspace,
  makeTestTag,
  type FixtureWorkspace,
} from "../testing/index.ts";
import { MockVcsAdapter } from "../vcs/index.ts";
import {
  findArtifactReferences,
  isTestVerificationCitation,
} from "./references.ts";

describe("Artifact References Query Engine (RULE-25, RULE-31, RULE-34, RULE-35)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-core-refs-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  it("should discover linksTo, foundIn categories, and evaluate archival guard in a fixture workspace", async () => {
    const targetAdrTag = makeTestTag("ADR", 501);
    const ancestorAdrTag = makeTestTag("ADR", 500);
    const activeRuleTag = makeTestTag("RULE", 501);
    const archivedRuleTag = makeTestTag("RULE", 502);
    const activeTaskTag = makeTestTag("TASK", 501);

    // 1. Target ADR
    await workspace.createAdr({
      id: 501,
      slug: "hierarchical-rule-to-adr",
      context: "ADR defining upward linking.",
      links: [ancestorAdrTag],
    });

    // 2. Active rule linking to Target ADR
    await workspace.createRule({
      id: 501,
      slug: "explicit-upward-linking",
      links: [targetAdrTag],
      body: "Every rule must link upward.\n",
    });

    // 3. Archived rule linking to Target ADR
    await workspace.createRule({
      id: 502,
      slug: "legacy-rule",
      links: [targetAdrTag],
      isArchived: true,
      body: "Deprecated rule.\n",
    });

    // 4. Active task depending on Target ADR
    await workspace.createTask({
      id: 501,
      slug: "implement-linking",
      links: [targetAdrTag],
      criteria: ["Task item"],
    });

    // 5. Source code citing Target ADR
    await workspace.writeFile(
      "service.ts",
      `// Implements ${targetAdrTag} and provides resolution
export function getResolution() {
  return "${targetAdrTag}";
}
`,
    );

    // 6. Test file citing Target ADR (both formal header and incidental body data)
    await workspace.writeFile(
      "service.test.ts",
      `import { it, expect } from "bun:test";
it("[${targetAdrTag}] should test resolution", () => {
  const dummy = "${targetAdrTag}";
  expect(dummy).toBe("${targetAdrTag}");
});
`,
    );

    // 7. General doc citing Target ADR
    await workspace.writeFile(
      "README.md",
      `# Project
Follow ${targetAdrTag} for architectural guidelines.
`,
    );

    const result = await findArtifactReferences(targetAdrTag, {
      cwd: workspace.cwd,
    });

    // Target details
    expect(result.target.tag).toBe(targetAdrTag);
    expect(result.target.subtype).toBe("ADR");
    expect(result.target.id).toBe("501");
    expect(result.target.isArchived).toBe(false);

    // Links To
    expect(result.linksTo.adrs).toEqual([ancestorAdrTag]);
    expect(result.linksTo.total).toBe(1);

    // Found In
    // Governance links: activeRuleTag (active), archivedRuleTag (archived), activeTaskTag (active)
    expect(result.foundIn.governanceLinks.length).toBe(3);

    const activeRuleLink = result.foundIn.governanceLinks.find(
      (l) => l.sourceTag === activeRuleTag,
    );
    expect(activeRuleLink).toBeDefined();
    expect(activeRuleLink?.isArchived).toBe(false);
    expect(activeRuleLink?.isBlocking).toBe(true);
    expect(activeRuleLink?.relationship).toBe("links");

    const archivedRuleLink = result.foundIn.governanceLinks.find(
      (l) => l.sourceTag === archivedRuleTag,
    );
    expect(archivedRuleLink).toBeDefined();
    expect(archivedRuleLink?.isArchived).toBe(true);
    expect(archivedRuleLink?.isBlocking).toBe(false);

    // Code citations
    expect(result.foundIn.code.length).toBe(2); // 2 lines in service.ts cite Target ADR
    expect(result.foundIn.code[0]!.relativePath).toBe("service.ts");

    // Test citations
    expect(result.foundIn.tests.length).toBe(1);
    expect(result.foundIn.tests[0]!.snippet).toContain(`[${targetAdrTag}]`);

    // Documentation citations
    expect(result.foundIn.documentation.length).toBe(1);
    expect(result.foundIn.documentation[0]!.snippet).toContain(
      `Follow ${targetAdrTag}`,
    );

    // Archival Guard
    // Blocked by activeRuleTag and activeTaskTag
    expect(result.archivalGuard.canArchive).toBe(false);
    expect(result.archivalGuard.blockingCount).toBe(2);
    expect(result.archivalGuard.blockingReasons.length).toBe(2);
    expect(
      result.archivalGuard.blockingReasons.some((r) =>
        r.includes(activeRuleTag),
      ),
    ).toBe(true);
    expect(
      result.archivalGuard.blockingReasons.some((r) =>
        r.includes(activeTaskTag),
      ),
    ).toBe(true);
  });

  it("should permit archival when all citing governance artifacts are archived or absent", async () => {
    const targetRuleTag = makeTestTag("RULE", 610);
    const archivedTaskTag = makeTestTag("TASK", 605);

    // 1. Target Rule
    await workspace.createRule({
      id: 610,
      slug: "legacy-rule",
      body: "Old rule to be archived.\n",
    });

    // 2. Archived task citing Target Rule
    const taskFilename = `old-task.${archivedTaskTag}.ARCHIVED.md`;
    await workspace.writeFile(
      taskFilename,
      `---
links:
  - ${targetRuleTag}
---
`,
    );

    // 3. Code citing Target Rule (code citations are informative, not blocking for archival per RULE-31)
    await workspace.writeFile(
      "legacy.ts",
      `// Complies with ${targetRuleTag}\n`,
    );

    const result = await findArtifactReferences(targetRuleTag, {
      cwd: workspace.cwd,
    });

    expect(result.target.tag).toBe(targetRuleTag);
    expect(result.foundIn.governanceLinks.length).toBe(1);
    expect(result.foundIn.governanceLinks[0]!.isArchived).toBe(true);
    expect(result.foundIn.governanceLinks[0]!.isBlocking).toBe(false);

    expect(result.archivalGuard.canArchive).toBe(true);
    expect(result.archivalGuard.blockingCount).toBe(0);
    expect(result.archivalGuard.blockingReasons).toEqual([]);
  });

  it("should reject querying non-existent artifact tags with a descriptive error", async () => {
    const missingTag = makeTestTag("ADR", 9999);
    expect(
      findArtifactReferences(missingTag, { cwd: workspace.cwd }),
    ).rejects.toThrow(`Artifact "${missingTag}" was not found`);
  });

  // @verifies RULE-34
  it("[RULE-34] should execute findArtifactReferences against isolated fixture workspace artifacts", async () => {
    const ruleTag = makeTestTag("RULE", 725);
    await workspace.createRule({
      id: 725,
      slug: "interface-core-decoupling",
      body: "Interfaces must remain decoupled from core.\n",
    });

    await workspace.writeFile(
      "sample.ts",
      `// Implements ${ruleTag} contract\n`,
    );

    const result = await findArtifactReferences(ruleTag, {
      cwd: workspace.cwd,
    });

    expect(result.target.tag).toBe(ruleTag);
    expect(result.target.slug).toBe("interface-core-decoupling");
    expect(result.foundIn.code.length).toBe(1);
    expect(result.foundIn.total).toBe(1);
  });

  // @verifies RULE-25, RULE-31, RULE-34
  it("[RULE-25][RULE-31][RULE-34] should discover citations using git-native grep index and include untracked working-tree files", async () => {
    await workspace.initGit();
    const ruleTag = makeTestTag("RULE", 801);

    await workspace.createRule({
      id: 801,
      slug: "git-scanner-rule",
      body: "Core invariant.\n",
    });

    // 1. Committed file referencing the rule
    await workspace.writeFile("committed.ts", `// Implements ${ruleTag}\n`);
    await workspace.gitCommit("feat: add committed file");

    // 2. Untracked file referencing the rule (not committed, not staged)
    await workspace.writeFile(
      "untracked.ts",
      `// Fallback reference to ${ruleTag}\n`,
    );

    const result = await findArtifactReferences(ruleTag, {
      cwd: workspace.cwd,
    });

    expect(result.target.tag).toBe(ruleTag);
    expect(result.foundIn.code.length).toBe(2);
    expect(
      result.foundIn.code.some((c) => c.relativePath === "committed.ts"),
    ).toBe(true);
    expect(
      result.foundIn.code.some((c) => c.relativePath === "untracked.ts"),
    ).toBe(true);
  });

  // @verifies RULE-25, RULE-31, RULE-34, RULE-35
  it("[RULE-25][RULE-31][RULE-34][RULE-35] should produce identical citation discovery results between git-native query and filesystem fallback", async () => {
    await workspace.initGit();
    const targetTag = makeTestTag("RULE", 802);
    const linkingTag = makeTestTag("RULE", 803);

    await workspace.createRule({
      id: 802,
      slug: "target-rule",
      body: "Target rule.\n",
    });

    await workspace.createRule({
      id: 803,
      slug: "linking-rule",
      links: [targetTag],
      body: "Links to target.\n",
    });

    await workspace.writeFile("service.ts", `// Implements ${targetTag}\n`);
    await workspace.writeFile(
      "service.test.ts",
      `// @verifies ${targetTag}\nit("[${targetTag}] should verify", () => {});\n`,
    );
    await workspace.writeFile(
      "untracked.md",
      `# Docs\nSee ${targetTag} for details.\n`,
    );

    // Run with git-native scanner
    const gitResult = await findArtifactReferences(targetTag, {
      cwd: workspace.cwd,
    });

    // Run with non-git mock adapter forcing fallback walk
    const mockVcs = new MockVcsAdapter({ insideWorkTree: false });
    const fallbackResult = await findArtifactReferences(targetTag, {
      cwd: workspace.cwd,
      vcs: mockVcs,
    });

    expect(gitResult.foundIn.total).toBe(fallbackResult.foundIn.total);
    expect(gitResult.foundIn.governanceLinks.length).toBe(
      fallbackResult.foundIn.governanceLinks.length,
    );
    expect(gitResult.foundIn.code.length).toBe(
      fallbackResult.foundIn.code.length,
    );
    expect(gitResult.foundIn.tests.length).toBe(
      fallbackResult.foundIn.tests.length,
    );
    expect(gitResult.foundIn.documentation.length).toBe(
      fallbackResult.foundIn.documentation.length,
    );
    expect(gitResult.archivalGuard).toEqual(fallbackResult.archivalGuard);
  });

  // @verifies RULE-25, RULE-31, RULE-34
  it("[RULE-25][RULE-31][RULE-34] should benchmark git-native query execution against synthetic fixture tree", async () => {
    await workspace.initGit();
    const targetTag = makeTestTag("RULE", 804);

    await workspace.createRule({
      id: 804,
      slug: "perf-rule",
      body: "Performance target rule.\n",
    });

    // Generate synthetic files across multiple directories
    for (let i = 0; i < 40; i++) {
      await workspace.writeFile(
        `src/module-${i}/file-${i}.ts`,
        `// Module ${i} file\nexport const x = ${i};\n`,
      );
    }

    // Add files with citations
    await workspace.writeFile(
      "src/module-10/cite.ts",
      `// Implements ${targetTag}\n`,
    );
    await workspace.writeFile("docs/guide.md", `# Guide\nSee ${targetTag}.\n`);
    await workspace.gitCommit("chore: add synthetic fixture files");

    // Untracked file
    await workspace.writeFile(
      "src/module-20/untracked.ts",
      `// Untracked ${targetTag}\n`,
    );

    const startGit = performance.now();
    const gitResult = await findArtifactReferences(targetTag, {
      cwd: workspace.cwd,
    });
    const gitDuration = performance.now() - startGit;

    const mockVcs = new MockVcsAdapter({ insideWorkTree: false });
    const startFallback = performance.now();
    const fallbackResult = await findArtifactReferences(targetTag, {
      cwd: workspace.cwd,
      vcs: mockVcs,
    });
    const fallbackDuration = performance.now() - startFallback;

    expect(gitResult.foundIn.total).toBe(fallbackResult.foundIn.total);
    expect(gitResult.foundIn.total).toBe(3);
    expect(gitDuration).toBeGreaterThan(0);
    expect(fallbackDuration).toBeGreaterThan(0);
  });
});

describe("isTestVerificationCitation - Rule Verification Tag Disambiguation (ADR-7, RULE-23, RULE-35)", () => {
  // @verifies RULE-23, ADR-7
  it("[RULE-23][ADR-7] should recognize comment annotations as verification tags", () => {
    const ruleTag = makeTestTag("RULE", 925);
    const rule2Tag = makeTestTag("RULE", 927);
    const adrTag = makeTestTag("ADR", 904);
    const rule3Tag = makeTestTag("RULE", 934);

    expect(isTestVerificationCitation(`// @verifies ${ruleTag}`, ruleTag)).toBe(
      true,
    );
    expect(
      isTestVerificationCitation(
        `// @verifies ${ruleTag}, ${rule2Tag}`,
        rule2Tag,
      ),
    ).toBe(true);
    expect(
      isTestVerificationCitation(`/* @satisfies ${ruleTag} */`, ruleTag),
    ).toBe(true);
    expect(isTestVerificationCitation(`# @verifies ${adrTag}`, adrTag)).toBe(
      true,
    );
    expect(
      isTestVerificationCitation(` * @verifies ${rule3Tag}`, rule3Tag),
    ).toBe(true);
  });

  // @verifies RULE-23, ADR-7
  it("[RULE-23][ADR-7] should recognize standardized bracket test headers", () => {
    const ruleTag = makeTestTag("RULE", 925);
    const rule2Tag = makeTestTag("RULE", 927);
    const adrTag = makeTestTag("ADR", 901);

    expect(
      isTestVerificationCitation(
        `it("[${ruleTag}] should execute find", async () => {`,
        ruleTag,
      ),
    ).toBe(true);
    expect(
      isTestVerificationCitation(
        `test("[${ruleTag}][${rule2Tag}] should separate streams", () => {`,
        rule2Tag,
      ),
    ).toBe(true);
    expect(
      isTestVerificationCitation(
        `it('[${adrTag}] should test resolution', () => {`,
        adrTag,
      ),
    ).toBe(true);
  });

  // @verifies RULE-23, ADR-7
  it("[RULE-23][ADR-7] should recognize describe/suite parenthetical tags", () => {
    const ruleTag = makeTestTag("RULE", 925);
    const rule2Tag = makeTestTag("RULE", 931);

    expect(
      isTestVerificationCitation(
        `describe("CLI Find - Execution & Stream Separation (${ruleTag}, RULE-927, RULE-929)", () => {`,
        ruleTag,
      ),
    ).toBe(true);
    expect(
      isTestVerificationCitation(
        `describe("Artifact References Query Engine (RULE-925, ${rule2Tag}, RULE-934)", () => {`,
        rule2Tag,
      ),
    ).toBe(true);
  });

  // @verifies RULE-23, RULE-35, ADR-7
  it("[RULE-23][RULE-35][ADR-7] should reject test fixture data, invocations, and raw assertions", () => {
    const ruleTag = makeTestTag("RULE", 901);

    // Array literals inside CLI calls or helpers
    expect(
      isTestVerificationCitation(
        `const { exitCode } = await captureCli(["find", "${ruleTag}"]);`,
        ruleTag,
      ),
    ).toBe(false);
    expect(
      isTestVerificationCitation(
        `const { stdout } = await execFileAsync(binPath, ["find", "${ruleTag}"]);`,
        ruleTag,
      ),
    ).toBe(false);
    expect(
      isTestVerificationCitation(
        `expect(() => validateRuleLinks(["${ruleTag}"])).toThrow();`,
        ruleTag,
      ),
    ).toBe(false);

    // Equality assertions
    expect(
      isTestVerificationCitation(
        `expect(stdout.trim()).toBe("src/.modie/rules/sample.${ruleTag}.md");`,
        ruleTag,
      ),
    ).toBe(false);
    expect(
      isTestVerificationCitation(
        `expect(parsed.tag).toBe("${ruleTag}");`,
        ruleTag,
      ),
    ).toBe(false);

    // File creation lines
    expect(
      isTestVerificationCitation(
        `const rulePath = join(tempDir, "sample-rule.${ruleTag}.md");`,
        ruleTag,
      ),
    ).toBe(false);
    expect(
      isTestVerificationCitation(
        `await writeFile(join(rulesDir, "single-purpose.${ruleTag}.md"), content);`,
        ruleTag,
      ),
    ).toBe(false);
  });
});
