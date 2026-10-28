/**
 * Unit and integration tests for ADR supersession and bidirectional frontmatter links.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 * @verifies ADR-4, RULE-4, RULE-14, RULE-31, RULE-34
 */

import { describe, expect, it } from "bun:test";
import { findArtifactReferences } from "../query/references.ts";
import { createFixtureWorkspace, makeTestTag } from "../testing/index.ts";
import { archiveAdr } from "./archive.ts";
import { createAdr } from "./creation.ts";

describe("Core ADR Creation - Supersession & Bidirectional Frontmatter (RULE-4, RULE-14, RULE-31, RULE-34)", () => {
  // @verifies ADR-4, RULE-4, RULE-14, RULE-34
  it("[ADR-4][RULE-4][RULE-14][RULE-34] should create an ADR with supersedes and update predecessor ADR frontmatter bidirectionally", async () => {
    const workspace = await createFixtureWorkspace("adr-supersession-");

    // 1. Create predecessor ADR-1
    const adr1 = await workspace.createAdr({
      id: 1,
      slug: "single-database",
      context: "Initial single database design.",
      alternatives: "None.",
      decision: "Use SQLite.",
    });

    // 2. Create superseding ADR-2 with supersedes option
    const result = await createAdr({
      title: "Distributed Microservices Storage",
      context: "Need horizontal scale.",
      alternatives: "Stick with single database.",
      decision: "Adopt distributed storage.",
      supersedes: [adr1.tag],
      cwd: workspace.cwd,
    });

    const expectedAdr2Tag = makeTestTag("ADR", 2);
    expect(result.tag).toBe(expectedAdr2Tag);
    expect(result.artifact.supersedes).toEqual([adr1.tag]);

    // 3. Verify new ADR-2 content has supersedes in frontmatter
    const adr2Content = await workspace.readFile(result.filepath);
    expect(adr2Content).toContain(`supersedes:\n  - ${adr1.tag}`);

    // 4. Verify predecessor ADR-1 has been updated with superseded_by: - ADR-2
    const adr1UpdatedContent = await workspace.readFile(adr1.filepath);
    expect(adr1UpdatedContent).toContain(
      `superseded_by:\n  - ${expectedAdr2Tag}`,
    );

    // 5. Verify references query on ADR-1 detects supersession and does not treat ADR-2's supersedes as a blocking dependent
    const refs = await findArtifactReferences(adr1.tag, { cwd: workspace.cwd });
    expect(refs.archivalGuard.canArchive).toBe(true);
    expect(refs.archivalGuard.blockingCount).toBe(0);

    // 6. Predecessor can now be safely archived per RULE-31
    const archiveResult = await archiveAdr(adr1.tag, { cwd: workspace.cwd });
    expect(archiveResult.archivedFilename).toBe(
      `single-database.${adr1.tag}.ARCHIVED.md`,
    );

    await workspace.cleanup();
  });

  // @verifies RULE-4, RULE-34
  it("[RULE-4][RULE-34] should append without duplication when superseded_by already exists on predecessor", async () => {
    const workspace = await createFixtureWorkspace("adr-supersession-multi-");

    const adr2Tag = makeTestTag("ADR", 2);
    const adr1 = await workspace.createAdr({
      id: 1,
      slug: "initial-concept",
      superseded_by: [adr2Tag],
      context: "Initial concept.",
    });

    await workspace.createAdr({
      id: 2,
      slug: "second-concept",
      supersedes: [adr1.tag],
      context: "Second concept.",
    });

    // Create ADR-3 which also supersedes ADR-1
    const result = await createAdr({
      title: "Modular Subsystem Architecture",
      supersedes: adr1.tag,
      cwd: workspace.cwd,
    });

    const adr1Updated = await workspace.readFile(adr1.filepath);
    expect(adr1Updated).toContain(
      `superseded_by:\n  - ${adr2Tag}\n  - ${result.tag}`,
    );

    await workspace.cleanup();
  });

  // @verifies RULE-14, RULE-34
  it("[RULE-14][RULE-34] should reject supersedes targeting a non-ADR artifact", async () => {
    const workspace = await createFixtureWorkspace("adr-supersession-invalid-");
    const ruleTag = makeTestTag("RULE", 1);

    expect(
      createAdr({
        title: "Invalid Supersedes",
        supersedes: [ruleTag],
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow("Invalid supersedes target");

    await workspace.cleanup();
  });
});
