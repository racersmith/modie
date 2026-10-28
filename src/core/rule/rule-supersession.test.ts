/**
 * Unit and integration tests for RULE supersession and bidirectional frontmatter links.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 * @verifies ADR-4, RULE-1, RULE-3, RULE-4, RULE-11, RULE-13, RULE-31, RULE-34
 */

import { describe, expect, it } from "bun:test";
import { findArtifactReferences } from "../query/references.ts";
import { createFixtureWorkspace, makeTestTag } from "../testing/index.ts";
import { archiveRule } from "./archive.ts";
import { createRule } from "./creation.ts";

describe("Core Rule Creation - Supersession & Bidirectional Frontmatter (RULE-3, RULE-4, RULE-13, RULE-31, RULE-34)", () => {
  // @verifies RULE-3, RULE-4, RULE-13, RULE-31, RULE-34
  it("[RULE-3][RULE-4][RULE-13][RULE-31][RULE-34] should create a rule with supersedes and update predecessor rule frontmatter bidirectionally", async () => {
    const workspace = await createFixtureWorkspace("rule-supersession-");

    // 1. Create predecessor RULE-1 (bare rule without frontmatter)
    const rule1 = await workspace.createRule({
      id: 1,
      slug: "monolithic-state",
      rawContent:
        "Global mutable state must not be modified across asynchronous dispatch boundaries.\n",
    });

    // 2. Create superseding RULE-2 with supersedes option
    const result = await createRule({
      title: "Isolated Actor Concurrency",
      assertion:
        "All asynchronous state mutations must execute within isolated actor message envelopes.",
      supersedes: [rule1.tag],
      cwd: workspace.cwd,
    });

    const expectedRule2Tag = makeTestTag("RULE", 2);
    expect(result.tag).toBe(expectedRule2Tag);
    expect(result.artifact.supersedes).toEqual([rule1.tag]);

    // 3. Verify new RULE-2 content has frontmatter with links: [] and supersedes: - RULE-1
    const rule2Content = await workspace.readFile(result.filepath);
    expect(rule2Content).toContain(`supersedes:\n  - ${rule1.tag}`);

    // 4. Verify predecessor RULE-1 has been updated with frontmatter containing superseded_by: - RULE-2
    const rule1UpdatedContent = await workspace.readFile(rule1.filepath);
    expect(rule1UpdatedContent).toContain(
      `superseded_by:\n  - ${expectedRule2Tag}`,
    );
    expect(rule1UpdatedContent).toContain(
      "Global mutable state must not be modified across asynchronous dispatch boundaries.",
    );

    // 5. Verify references query on RULE-1 detects supersession and does not treat RULE-2's supersedes as a blocking dependent
    const refs = await findArtifactReferences(rule1.tag, {
      cwd: workspace.cwd,
    });
    expect(refs.archivalGuard.canArchive).toBe(true);
    expect(refs.archivalGuard.blockingCount).toBe(0);

    // 6. Predecessor can now be safely archived per RULE-31
    const archiveResult = await archiveRule(rule1.tag, { cwd: workspace.cwd });
    expect(archiveResult.archivedFilename).toBe(
      `monolithic-state.${rule1.tag}.ARCHIVED.md`,
    );

    await workspace.cleanup();
  });

  // @verifies RULE-4, RULE-34
  it("[RULE-4][RULE-34] should update predecessor rule that already has YAML frontmatter", async () => {
    const workspace = await createFixtureWorkspace("rule-supersession-fm-");

    // Seed ADR-1
    const adr1 = await workspace.createAdr({
      id: 1,
      slug: "base-architecture",
      title: "Base Architecture",
      context: "Base ADR",
    });

    // Seed RULE-1 with existing frontmatter linking to ADR-1
    const rule1 = await workspace.createRule({
      id: 1,
      slug: "first-rule",
      links: [adr1.tag],
      body: "Initial assertion text.",
    });

    // Create RULE-2 superseding RULE-1
    const result = await createRule({
      title: "Second Rule",
      assertion: "Updated assertion text.",
      links: [adr1.tag],
      supersedes: [rule1.tag],
      cwd: workspace.cwd,
    });

    const rule1Updated = await workspace.readFile(rule1.filepath);
    expect(rule1Updated).toContain(`links:\n  - ${adr1.tag}`);
    expect(rule1Updated).toContain(`superseded_by:\n  - ${result.tag}`);

    await workspace.cleanup();
  });

  // @verifies RULE-4, RULE-34
  it("[RULE-4][RULE-34] should append without duplication when superseded_by already exists on predecessor rule", async () => {
    const workspace = await createFixtureWorkspace("rule-supersession-multi-");

    const rule2Tag = makeTestTag("RULE", 2);
    const rule1 = await workspace.createRule({
      id: 1,
      slug: "initial-rule",
      superseded_by: [rule2Tag],
      body: "Initial assertion text.",
    });

    // Seed active RULE-2
    await workspace.createRule({
      id: 2,
      slug: "second-rule",
      supersedes: [rule1.tag],
      body: "Second assertion text.",
    });

    // Create RULE-3 also superseding RULE-1
    const result = await createRule({
      title: "Third Rule",
      assertion: "Third assertion text.",
      supersedes: rule1.tag,
      cwd: workspace.cwd,
    });

    const rule1Updated = await workspace.readFile(rule1.filepath);
    expect(rule1Updated).toContain(
      `superseded_by:\n  - ${rule2Tag}\n  - ${result.tag}`,
    );

    await workspace.cleanup();
  });

  // @verifies RULE-13, RULE-34
  it("[RULE-13][RULE-34] should reject supersedes targeting a non-RULE artifact", async () => {
    const workspace = await createFixtureWorkspace(
      "rule-supersession-invalid-",
    );
    const adrTag = makeTestTag("ADR", 1);

    expect(
      createRule({
        title: "Invalid Supersedes Rule",
        assertion: "Assertion attempting cross-subtype supersession.",
        supersedes: [adrTag],
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow("Invalid supersedes target");

    await workspace.cleanup();
  });
});
