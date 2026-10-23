/**
 * Unit and integration tests for RULE supersession and bidirectional frontmatter links.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 * @verifies ADR-4, RULE-1, RULE-3, RULE-4, RULE-11, RULE-13, RULE-31
 */

import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { archiveArtifact } from "../archival/archive.ts";
import { findArtifactReferences } from "../query/references.ts";
import { archiveRule } from "./archive.ts";
import { createRule } from "./creation.ts";

describe("Core Rule Creation - Supersession & Bidirectional Frontmatter (RULE-3, RULE-4, RULE-13, RULE-31)", () => {
  // @verifies RULE-3, RULE-4, RULE-13, RULE-31
  it("[RULE-3][RULE-4][RULE-13][RULE-31] should create a rule with supersedes and update predecessor rule frontmatter bidirectionally", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-rule-supersession-test-"));
    const rulesDir = join(tempDir, ".rules");
    await mkdir(rulesDir, { recursive: true });

    // 1. Create predecessor RULE-1 (bare rule without frontmatter)
    const rule1Path = join(rulesDir, "monolithic-state.RULE-1.md");
    await writeFile(
      rule1Path,
      "Global mutable state must not be modified across asynchronous dispatch boundaries.\n",
      "utf8",
    );

    // 2. Create superseding RULE-2 with supersedes option
    const result = await createRule({
      title: "Isolated Actor Concurrency",
      assertion: "All asynchronous state mutations must execute within isolated actor message envelopes.",
      supersedes: ["RULE-1"],
      cwd: tempDir,
    });

    expect(result.tag).toBe("RULE-2");
    expect(result.artifact.supersedes).toEqual(["RULE-1"]);

    // 3. Verify new RULE-2 content has frontmatter with links: [] and supersedes: - RULE-1
    const rule2Content = await readFile(result.filepath, "utf8");
    expect(rule2Content).toContain("supersedes:\n  - RULE-1");

    // 4. Verify predecessor RULE-1 has been updated with frontmatter containing superseded_by: - RULE-2
    const rule1UpdatedContent = await readFile(rule1Path, "utf8");
    expect(rule1UpdatedContent).toContain("superseded_by:\n  - RULE-2");
    expect(rule1UpdatedContent).toContain(
      "Global mutable state must not be modified across asynchronous dispatch boundaries.",
    );

    // 5. Verify references query on RULE-1 detects supersession and does not treat RULE-2's supersedes as a blocking dependent
    const refs = await findArtifactReferences("RULE-1", { cwd: tempDir });
    expect(refs.archivalGuard.canArchive).toBe(true);
    expect(refs.archivalGuard.blockingCount).toBe(0);

    // 6. Predecessor can now be safely archived per RULE-31
    const archiveResult = await archiveRule("RULE-1", { cwd: tempDir });
    expect(archiveResult.archivedFilename).toBe("monolithic-state.RULE-1.ARCHIVED.md");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-4
  it("[RULE-4] should update predecessor rule that already has YAML frontmatter", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-rule-supersession-fm-test-"));
    const rulesDir = join(tempDir, ".rules");
    const adrsDir = join(tempDir, ".adrs");
    await mkdir(rulesDir, { recursive: true });
    await mkdir(adrsDir, { recursive: true });

    // Seed ADR-1
    await writeFile(
      join(adrsDir, "base-architecture.ADR-1.md"),
      "---\nlinks: []\n---\n# Context\nBase ADR\n",
      "utf8",
    );

    // Seed RULE-1 with existing frontmatter linking to ADR-1
    const rule1Path = join(rulesDir, "first-rule.RULE-1.md");
    await writeFile(
      rule1Path,
      "---\nlinks:\n  - ADR-1\n---\n\nInitial assertion text.\n",
      "utf8",
    );

    // Create RULE-2 superseding RULE-1
    await createRule({
      title: "Second Rule",
      assertion: "Updated assertion text.",
      links: ["ADR-1"],
      supersedes: ["RULE-1"],
      cwd: tempDir,
    });

    const rule1Updated = await readFile(rule1Path, "utf8");
    expect(rule1Updated).toContain("links:\n  - ADR-1");
    expect(rule1Updated).toContain("superseded_by:\n  - RULE-2");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-4
  it("[RULE-4] should append without duplication when superseded_by already exists on predecessor rule", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-rule-supersession-multi-test-"));
    const rulesDir = join(tempDir, ".rules");
    await mkdir(rulesDir, { recursive: true });

    const rule1Path = join(rulesDir, "initial-rule.RULE-1.md");
    await writeFile(
      rule1Path,
      "---\nlinks: []\nsuperseded_by:\n  - RULE-2\n---\n\nInitial assertion text.\n",
      "utf8",
    );

    // Seed active RULE-2
    await writeFile(
      join(rulesDir, "second-rule.RULE-2.md"),
      "---\nlinks: []\nsupersedes:\n  - RULE-1\n---\n\nSecond assertion text.\n",
      "utf8",
    );

    // Create RULE-3 also superseding RULE-1
    await createRule({
      title: "Third Rule",
      assertion: "Third assertion text.",
      supersedes: "RULE-1",
      cwd: tempDir,
    });

    const rule1Updated = await readFile(rule1Path, "utf8");
    expect(rule1Updated).toContain("superseded_by:\n  - RULE-2\n  - RULE-3");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-13
  it("[RULE-13] should reject supersedes targeting a non-RULE artifact", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-rule-supersession-invalid-"));
    const rulesDir = join(tempDir, ".rules");
    await mkdir(rulesDir, { recursive: true });

    expect(
      createRule({
        title: "Invalid Supersedes Rule",
        assertion: "Assertion attempting cross-subtype supersession.",
        supersedes: ["ADR-1"],
        cwd: tempDir,
      }),
    ).rejects.toThrow("Invalid supersedes target");

    await rm(tempDir, { recursive: true, force: true });
  });
});
