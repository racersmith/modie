/**
 * Unit and integration tests for ADR supersession and bidirectional frontmatter links.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 * @verifies ADR-4, RULE-4, RULE-14, RULE-31
 */

import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAdr } from "./creation.ts";
import { findArtifactReferences } from "../query/references.ts";
import { archiveAdr } from "./archive.ts";

describe("Core ADR Creation - Supersession & Bidirectional Frontmatter (RULE-4, RULE-14, RULE-31)", () => {
  // @verifies ADR-4, RULE-4, RULE-14
  it("[ADR-4][RULE-4][RULE-14] should create an ADR with supersedes and update predecessor ADR frontmatter bidirectionally", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-adr-supersession-test-"));
    const adrsDir = join(tempDir, ".adrs");
    await mkdir(adrsDir, { recursive: true });

    // 1. Create predecessor ADR-1
    const adr1Path = join(adrsDir, "single-database.ADR-1.md");
    await writeFile(
      adr1Path,
      `---
links: []
---

# Context
Initial single database design.

# Alternatives Considered
None.

# Decision
Use SQLite.
`,
      "utf8",
    );

    // 2. Create superseding ADR-2 with supersedes option
    const result = await createAdr({
      title: "Distributed Microservices Storage",
      context: "Need horizontal scale.",
      alternatives: "Stick with single database.",
      decision: "Adopt distributed storage.",
      supersedes: ["ADR-1"],
      cwd: tempDir,
    });

    expect(result.tag).toBe("ADR-2");
    expect(result.artifact.supersedes).toEqual(["ADR-1"]);

    // 3. Verify new ADR-2 content has supersedes in frontmatter
    const adr2Content = await readFile(result.filepath, "utf8");
    expect(adr2Content).toContain("supersedes:\n  - ADR-1");

    // 4. Verify predecessor ADR-1 has been updated with superseded_by: - ADR-2
    const adr1UpdatedContent = await readFile(adr1Path, "utf8");
    expect(adr1UpdatedContent).toContain("superseded_by:\n  - ADR-2");

    // 5. Verify references query on ADR-1 detects supersession and does not treat ADR-2's supersedes as a blocking dependent
    const refs = await findArtifactReferences("ADR-1", { cwd: tempDir });
    expect(refs.archivalGuard.canArchive).toBe(true);
    expect(refs.archivalGuard.blockingCount).toBe(0);

    // 6. Predecessor can now be safely archived per RULE-31
    const archiveResult = await archiveAdr("ADR-1", { cwd: tempDir });
    expect(archiveResult.archivedFilename).toBe("single-database.ADR-1.ARCHIVED.md");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-4
  it("[RULE-4] should append without duplication when superseded_by already exists on predecessor", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-adr-supersession-multi-test-"));
    const adrsDir = join(tempDir, ".adrs");
    await mkdir(adrsDir, { recursive: true });

    const adr1Path = join(adrsDir, "initial-concept.ADR-1.md");
    await writeFile(
      adr1Path,
      `---
links: []
superseded_by:
  - ADR-2
---

# Context
Initial concept.
`,
      "utf8",
    );

    await writeFile(
      join(adrsDir, "second-concept.ADR-2.md"),
      `---
links: []
supersedes:
  - ADR-1
---

# Context
Second concept.
`,
      "utf8",
    );

    // Create ADR-3 which also supersedes ADR-1
    await createAdr({
      title: "Modular Subsystem Architecture",
      supersedes: "ADR-1",
      cwd: tempDir,
    });

    const adr1Updated = await readFile(adr1Path, "utf8");
    expect(adr1Updated).toContain("superseded_by:\n  - ADR-2\n  - ADR-3");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-14
  it("[RULE-14] should reject supersedes targeting a non-ADR artifact", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-adr-supersession-invalid-"));
    const adrsDir = join(tempDir, ".adrs");
    await mkdir(adrsDir, { recursive: true });

    expect(
      createAdr({
        title: "Invalid Supersedes",
        supersedes: ["RULE-1"],
        cwd: tempDir,
      }),
    ).rejects.toThrow("Invalid supersedes target");

    await rm(tempDir, { recursive: true, force: true });
  });
});
