import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { generateSlug } from "../../domain/common/slug.ts";
import {
  resolveIdeaPath,
  serializeSparkLedger,
  type SparkEntry,
} from "../../domain/spark/index.ts";
import { readSparks } from "./reader.ts";

export interface SparkPromoteOptions {
  slug?: string;
  cwd?: string;
}

export interface SparkPromoteResult {
  spark: SparkEntry;
  slug: string;
  ideaPath: string;
}

/**
 * Promotes an active spark into a dedicated pure-Markdown `[slug].IDEA.md` file
 * and removes it from `SPARKS.md`.
 */
export async function sparkPromote(
  handle: string,
  options: SparkPromoteOptions = {},
): Promise<SparkPromoteResult> {
  const targetHandle = handle.trim().toLowerCase();
  const { sparks, filepath: sparksPath } = await readSparks(options.cwd);

  const index = sparks.findIndex(
    (s) => s.handle?.toLowerCase() === targetHandle,
  );

  if (index === -1) {
    throw new Error(
      `Spark with handle "${handle}" not found in active sparks at ${sparksPath}.`,
    );
  }

  const [spark] = sparks.splice(index, 1);
  if (!spark) {
    throw new Error(`Spark with handle "${handle}" could not be extracted.`);
  }

  const slug = options.slug
    ? generateSlug(options.slug)
    : generateSlug(spark.title);
  const ideaPath = resolveIdeaPath(slug, options.cwd);

  if (existsSync(ideaPath)) {
    throw new Error(
      `Cannot promote spark: Idea file already exists at ${ideaPath}.`,
    );
  }

  const sections: string[] = [
    `# ${spark.title.trim()}`,
    "",
    "## Problem & Motivation",
    "",
    spark.body.trim() || "_Describe the problem and motivation here._",
    "",
    "## Proposed Direction",
    "",
    "_Outline the high-level architectural concept, trade-offs, and design._",
    "",
  ];

  await writeFile(ideaPath, sections.join("\n"), "utf-8");
  await writeFile(sparksPath, serializeSparkLedger(sparks), "utf-8");

  return {
    spark,
    slug,
    ideaPath,
  };
}

