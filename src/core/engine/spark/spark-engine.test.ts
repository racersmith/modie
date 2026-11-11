import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createFixtureWorkspace } from "../../platform/testing/index.ts";
import {
  readSparks,
  sparkAdd,
  sparkPromote,
  sparkReject,
} from "./index.ts";

describe("Spark Engine Operations (RULE-34, RULE-38)", () => {
  it("sparkAdd should auto-create .modie/ideas/ and append minted spark", async () => {
    await using workspace = await createFixtureWorkspace("spark-engine-add-");

    const result = await sparkAdd({
      title: "First automated spark",
      body: "Body of first spark.",
      cwd: workspace.cwd,
    });

    expect(result.spark.handle).toMatch(/^[a-f0-9]{4}$/);
    expect(result.spark.title).toBe("First automated spark");
    expect(result.spark.body).toBe("Body of first spark.");
    expect(existsSync(result.filepath)).toBe(true);

    const content = await readFile(result.filepath, "utf-8");
    expect(content).toContain(
      `# [${result.spark.handle}] First automated spark`,
    );
    expect(content).toContain("Body of first spark.");
  });

  it("sparkAdd should respect custom handle when supplied", async () => {
    await using workspace = await createFixtureWorkspace("spark-engine-handle-");

    const result = await sparkAdd({
      handle: "custom",
      title: "Custom handle spark",
      body: "Custom body.",
      cwd: workspace.cwd,
    });

    expect(result.spark.handle).toBe("custom");
    const content = await readFile(result.filepath, "utf-8");
    expect(content).toContain("# [custom] Custom handle spark");
  });

  it("readSparks should lazily mint unminted sparks in-place", async () => {
    await using workspace = await createFixtureWorkspace("spark-engine-mint-");
    const sparksPath = `${workspace.cwd}/.modie/ideas/SPARKS.md`;

    await workspace.writeFile(
      ".modie/ideas/SPARKS.md",
      ["# First Raw Spark", "Body 1", "", "# Second Raw Spark", "Body 2"].join(
        "\n",
      ),
    );

    const firstRead = await readSparks(workspace.cwd);
    expect(firstRead.mintedCount).toBe(2);
    expect(firstRead.sparks.length).toBe(2);

    const handle0 = firstRead.sparks[0]?.handle;
    const handle1 = firstRead.sparks[1]?.handle;
    expect(handle0).toMatch(/^[a-f0-9]{4}$/);
    expect(handle1).toMatch(/^[a-f0-9]{4}$/);
    expect(handle0).not.toBe(handle1);

    // Verify written back to disk
    const onDisk = await readFile(sparksPath, "utf-8");
    expect(onDisk).toContain(`# [${handle0}] First Raw Spark`);
    expect(onDisk).toContain(`# [${handle1}] Second Raw Spark`);

    // Second read should be clean without minting
    const secondRead = await readSparks(workspace.cwd);
    expect(secondRead.mintedCount).toBe(0);
    expect(secondRead.sparks.length).toBe(2);
  });

  it("sparkPromote should create IDEA.md and remove spark from SPARKS.md", async () => {
    await using workspace = await createFixtureWorkspace("spark-engine-promo-");

    const add1 = await sparkAdd({
      title: "Promotable Spark",
      body: "Problem details and inspiration.",
      cwd: workspace.cwd,
    });

    const add2 = await sparkAdd({
      title: "Unrelated Spark",
      body: "Keep this spark.",
      cwd: workspace.cwd,
    });

    const promo = await sparkPromote(add1.spark.handle!, {
      slug: "promotable-spark",
      cwd: workspace.cwd,
    });

    expect(promo.slug).toBe("promotable-spark");
    expect(existsSync(promo.ideaPath)).toBe(true);

    const ideaContent = await readFile(promo.ideaPath, "utf-8");
    expect(ideaContent).toContain("# Promotable Spark");
    expect(ideaContent).toContain("## Problem & Motivation");
    expect(ideaContent).toContain("Problem details and inspiration.");

    // Verify removed from SPARKS.md
    const { sparks } = await readSparks(workspace.cwd);
    expect(sparks.length).toBe(1);
    expect(sparks[0]?.handle).toBe(add2.spark.handle);
  });

  it("sparkPromote should throw when handle is not found", async () => {
    await using workspace = await createFixtureWorkspace("spark-engine-error-");
    await sparkAdd({ title: "Existing", cwd: workspace.cwd });

    expect(
      sparkPromote("nonexistent", { cwd: workspace.cwd }),
    ).rejects.toThrow("Spark with handle \"nonexistent\" not found");
  });

  it("sparkReject should append to .rejected/SPARKS.md with callout and remove from active SPARKS.md", async () => {
    await using workspace = await createFixtureWorkspace("spark-engine-reject-");

    const add1 = await sparkAdd({
      title: "Bad Idea Spark",
      body: "Turns out this is a non-goal.",
      cwd: workspace.cwd,
    });

    const add2 = await sparkAdd({
      title: "Good Idea Spark",
      body: "Keep this.",
      cwd: workspace.cwd,
    });

    const rejectResult = await sparkReject(add1.spark.handle!, {
      reason: "Conflicts with core architectural principles",
      cwd: workspace.cwd,
    });

    expect(existsSync(rejectResult.rejectedPath)).toBe(true);

    const rejectedContent = await readFile(
      rejectResult.rejectedPath,
      "utf-8",
    );
    expect(rejectedContent).toContain(
      `# [${add1.spark.handle}] Bad Idea Spark`,
    );
    expect(rejectedContent).toContain(
      "> **Rejected",
    );
    expect(rejectedContent).toContain(
      "Conflicts with core architectural principles",
    );
    expect(rejectedContent).toContain("Turns out this is a non-goal.");

    // Verify removed from active SPARKS.md
    const { sparks } = await readSparks(workspace.cwd);
    expect(sparks.length).toBe(1);
    expect(sparks[0]?.handle).toBe(add2.spark.handle);
  });
});

