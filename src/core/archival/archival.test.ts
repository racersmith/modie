/**
 * Unit tests for Guarded Artifact Archival core service.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 * @verifies RULE-4, RULE-25, RULE-31
 */

import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { archiveArtifact, archiveAdr, archiveRule } from "./index.ts";

describe("Core Artifact Archival - Guarded Archival & Reference Invariance (RULE-4, RULE-25, RULE-31)", () => {
  // @verifies RULE-4, RULE-31
  it("[RULE-4][RULE-31] should successfully archive an unreferenced ADR and rename to .ARCHIVED.md", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-archival-test-"));
    const adrsDir = join(tempDir, ".adrs");
    await mkdir(adrsDir, { recursive: true });

    const adrPath = join(adrsDir, "initial-architecture.ADR-1.md");
    await writeFile(
      adrPath,
      `---
links: []
---

# Context
Initial context.
`,
      "utf8",
    );

    const result = await archiveArtifact({
      tag: "ADR-1",
      cwd: tempDir,
    });

    expect(result.tag).toBe("ADR-1");
    expect(result.canArchive).toBe(true);
    expect(result.forced).toBe(false);
    expect(result.archivedFilename).toBe("initial-architecture.ADR-1.ARCHIVED.md");
    expect(result.archivedRelativePath).toBe(".adrs/initial-architecture.ADR-1.ARCHIVED.md");

    // Check that old file is gone and new file exists
    const archivedContent = await readFile(result.archivedFilepath, "utf8");
    expect(archivedContent).toContain("# Context\nInitial context.");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-4, RULE-31
  it("[RULE-4][RULE-31] should successfully archive an unreferenced RULE via archiveRule", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-archival-rule-test-"));
    const rulesDir = join(tempDir, ".rules");
    await mkdir(rulesDir, { recursive: true });

    const rulePath = join(rulesDir, "single-purpose.RULE-1.md");
    await writeFile(
      rulePath,
      `---
links: []
---

Rule description.
`,
      "utf8",
    );

    const result = await archiveRule("RULE-1", { cwd: tempDir });

    expect(result.tag).toBe("RULE-1");
    expect(result.archivedFilename).toBe("single-purpose.RULE-1.ARCHIVED.md");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-31
  it("[RULE-31] should strictly reject archiving when active incoming references exist", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-archival-reject-test-"));
    const adrsDir = join(tempDir, ".adrs");
    const rulesDir = join(tempDir, ".rules");
    await mkdir(adrsDir, { recursive: true });
    await mkdir(rulesDir, { recursive: true });

    // Target ADR
    const adrPath = join(adrsDir, "old-decision.ADR-1.md");
    await writeFile(
      adrPath,
      `---
links: []
---

# Context
Old decision.
`,
      "utf8",
    );

    // Active RULE referencing target ADR
    const rulePath = join(rulesDir, "dependent-rule.RULE-1.md");
    await writeFile(
      rulePath,
      `---
links:
  - ADR-1
---

Must follow ADR-1.
`,
      "utf8",
    );

    // Archiving should throw due to active incoming reference
    expect(
      archiveArtifact({
        tag: "ADR-1",
        cwd: tempDir,
      }),
    ).rejects.toThrow("active incoming reference(s) exist (RULE-31)");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-31
  it("[RULE-31] should bypass active references guard when --force is provided", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-archival-force-test-"));
    const adrsDir = join(tempDir, ".adrs");
    const rulesDir = join(tempDir, ".rules");
    await mkdir(adrsDir, { recursive: true });
    await mkdir(rulesDir, { recursive: true });

    const adrPath = join(adrsDir, "old-decision.ADR-1.md");
    await writeFile(
      adrPath,
      `---
links: []
---

# Context
Old decision.
`,
      "utf8",
    );

    const rulePath = join(rulesDir, "dependent-rule.RULE-1.md");
    await writeFile(
      rulePath,
      `---
links:
  - ADR-1
---

Dependent rule.
`,
      "utf8",
    );

    const result = await archiveAdr("ADR-1", {
      force: true,
      cwd: tempDir,
    });

    expect(result.canArchive).toBe(false);
    expect(result.forced).toBe(true);
    expect(result.archivedFilename).toBe("old-decision.ADR-1.ARCHIVED.md");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-31
  it("[RULE-31] should reject archiving an artifact that is already archived", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-archival-already-test-"));
    const adrsDir = join(tempDir, ".adrs");
    await mkdir(adrsDir, { recursive: true });

    const adrPath = join(adrsDir, "old-decision.ADR-1.ARCHIVED.md");
    await writeFile(
      adrPath,
      `---
links: []
---

# Context
Already archived.
`,
      "utf8",
    );

    expect(
      archiveArtifact({
        tag: "ADR-1",
        cwd: tempDir,
      }),
    ).rejects.toThrow("is already archived");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-31
  it("[RULE-31] should reject when subtype constraint does not match target artifact", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-archival-subtype-mismatch-"));
    const adrsDir = join(tempDir, ".adrs");
    await mkdir(adrsDir, { recursive: true });

    const adrPath = join(adrsDir, "my-decision.ADR-1.md");
    await writeFile(adrPath, "---\nlinks: []\n---\n", "utf8");

    expect(
      archiveArtifact({
        tag: "ADR-1",
        subtype: "RULE",
        cwd: tempDir,
      }),
    ).rejects.toThrow();

    await rm(tempDir, { recursive: true, force: true });
  });
});
