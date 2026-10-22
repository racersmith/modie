/**
 * Unit tests for core artifact reference resolution and subtype-agnostic archival guard.
 * Complies with ADR-4, ADR-5, RULE-13, RULE-14, RULE-15, RULE-25, RULE-27, and RULE-31.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { findArtifactReferences } from "./references.ts";

describe("Artifact References Query Engine (RULE-25, RULE-31)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(
      process.cwd(),
      "scratch",
      `refs-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    );
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should discover linksTo, foundIn categories, and evaluate archival guard in a fixture workspace", async () => {
    // 1. Target ADR
    const adrFile = join(tempDir, "hierarchical-rule-to-adr.ADR-1.md");
    await writeFile(
      adrFile,
      `---
links:
  - ADR-0
---

# Context
ADR defining upward linking.
`,
      "utf8",
    );

    // 2. Active rule linking to ADR-1
    const ruleFile = join(tempDir, "explicit-upward-linking.RULE-1.md");
    await writeFile(
      ruleFile,
      `---
links:
  - ADR-1
---

Every rule must link upward.
`,
      "utf8",
    );

    // 3. Archived rule linking to ADR-1
    const archivedRuleFile = join(
      tempDir,
      "legacy-rule.RULE-2.ARCHIVED.md",
    );
    await writeFile(
      archivedRuleFile,
      `---
links:
  - ADR-1
---

Deprecated rule.
`,
      "utf8",
    );

    // 4. Active task depending on ADR-1
    const taskFile = join(tempDir, "implement-linking.TASK-1.md");
    await writeFile(
      taskFile,
      `---
depends_on: []
links:
  - ADR-1
---

# Acceptance Criteria
- [ ] Task item
`,
      "utf8",
    );

    // 5. Source code citing ADR-1
    const codeFile = join(tempDir, "service.ts");
    await writeFile(
      codeFile,
      `// Implements ADR-1 and provides resolution
export function getResolution() {
  return "ADR-1";
}
`,
      "utf8",
    );

    // 6. Test file citing ADR-1
    const testFile = join(tempDir, "service.test.ts");
    await writeFile(
      testFile,
      `import { it, expect } from "bun:test";
it("[ADR-1] should test resolution", () => {
  expect(true).toBe(true);
});
`,
      "utf8",
    );

    // 7. General doc citing ADR-1
    const docFile = join(tempDir, "README.md");
    await writeFile(
      docFile,
      `# Project
Follow ADR-1 for architectural guidelines.
`,
      "utf8",
    );

    const result = await findArtifactReferences("ADR-1", { cwd: tempDir });

    // Target details
    expect(result.target.tag).toBe("ADR-1");
    expect(result.target.subtype).toBe("ADR");
    expect(result.target.id).toBe("1");
    expect(result.target.isArchived).toBe(false);

    // Links To
    expect(result.linksTo.adrs).toEqual(["ADR-0"]);
    expect(result.linksTo.total).toBe(1);

    // Found In
    // Governance links: RULE-1 (active), RULE-2 (archived), TASK-1 (active)
    expect(result.foundIn.governanceLinks.length).toBe(3);

    const activeRuleLink = result.foundIn.governanceLinks.find(
      (l) => l.sourceTag === "RULE-1",
    );
    expect(activeRuleLink).toBeDefined();
    expect(activeRuleLink?.isArchived).toBe(false);
    expect(activeRuleLink?.isBlocking).toBe(true);
    expect(activeRuleLink?.relationship).toBe("links");

    const archivedRuleLink = result.foundIn.governanceLinks.find(
      (l) => l.sourceTag === "RULE-2",
    );
    expect(archivedRuleLink).toBeDefined();
    expect(archivedRuleLink?.isArchived).toBe(true);
    expect(archivedRuleLink?.isBlocking).toBe(false);

    // Code citations
    expect(result.foundIn.code.length).toBe(2); // 2 lines in service.ts cite ADR-1
    expect(result.foundIn.code[0]!.relativePath).toBe("service.ts");

    // Test citations
    expect(result.foundIn.tests.length).toBe(1);
    expect(result.foundIn.tests[0]!.snippet).toContain("[ADR-1]");

    // Documentation citations
    expect(result.foundIn.documentation.length).toBe(1);
    expect(result.foundIn.documentation[0]!.snippet).toContain("Follow ADR-1");

    // Archival Guard
    // Blocked by active RULE-1 and active TASK-1
    expect(result.archivalGuard.canArchive).toBe(false);
    expect(result.archivalGuard.blockingCount).toBe(2);
    expect(result.archivalGuard.blockingReasons.length).toBe(2);
    expect(result.archivalGuard.blockingReasons[0]).toContain("RULE-1");
  });

  it("should permit archival when all citing governance artifacts are archived or absent", async () => {
    // 1. Target Rule
    const ruleFile = join(tempDir, "legacy-rule.RULE-10.md");
    await writeFile(
      ruleFile,
      `---
links: []
---

# Context
Old rule to be archived.
`,
      "utf8",
    );

    // 2. Archived task citing RULE-10
    const archivedTask = join(tempDir, "old-task.TASK-5.ARCHIVED.md");
    await writeFile(
      archivedTask,
      `---
links:
  - RULE-10
---
`,
      "utf8",
    );

    // 3. Code citing RULE-10 (code citations are informative, not blocking for archival per RULE-31)
    const codeFile = join(tempDir, "legacy.ts");
    await writeFile(codeFile, `// Complies with RULE-10`, "utf8");

    const result = await findArtifactReferences("RULE-10", { cwd: tempDir });

    expect(result.target.tag).toBe("RULE-10");
    expect(result.foundIn.governanceLinks.length).toBe(1);
    expect(result.foundIn.governanceLinks[0]!.isArchived).toBe(true);
    expect(result.foundIn.governanceLinks[0]!.isBlocking).toBe(false);

    expect(result.archivalGuard.canArchive).toBe(true);
    expect(result.archivalGuard.blockingCount).toBe(0);
    expect(result.archivalGuard.blockingReasons).toEqual([]);
  });

  it("should reject querying non-existent artifact tags with a descriptive error", async () => {
    expect(
      findArtifactReferences("ADR-9999", { cwd: tempDir }),
    ).rejects.toThrow('Artifact "ADR-9999" was not found');
  });

  it("should execute findArtifactReferences against active repository artifacts", async () => {
    const result = await findArtifactReferences("RULE-25", { cwd: process.cwd() });

    expect(result.target.tag).toBe("RULE-25");
    expect(result.target.slug).toBe("interface-core-decoupling");
    expect(result.foundIn.code.length).toBeGreaterThan(0);
    expect(result.foundIn.total).toBeGreaterThan(0);
  });
});
