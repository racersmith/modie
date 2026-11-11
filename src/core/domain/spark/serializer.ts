/**
 * String serializers for Modie sparks and ideas.
 */

import type { SparkEntry } from "./types.ts";

/**
 * Formats a single spark entry as Markdown.
 */
export function serializeSpark(spark: SparkEntry): string {
  const handlePart = spark.handle ? `[${spark.handle}] ` : "";
  const header = `# ${handlePart}${spark.title.trim()}`;
  const cleanBody = spark.body.trim();

  if (!cleanBody) {
    return header;
  }
  return `${header}\n${cleanBody}`;
}

/**
 * Formats a list of spark entries into a canonical SPARKS.md document.
 */
export function serializeSparkLedger(sparks: SparkEntry[]): string {
  if (sparks.length === 0) {
    return "";
  }
  return sparks.map(serializeSpark).join("\n\n") + "\n";
}

/**
 * Formats a rejected spark with an immediate top-level blockquote callout note.
 */
export function formatRejectedSpark(
  spark: SparkEntry,
  reason?: string,
  date: string = new Date().toISOString().slice(0, 10),
): string {
  const handlePart = spark.handle ? `[${spark.handle}] ` : "";
  const header = `# ${handlePart}${spark.title.trim()}`;
  const rationale = reason?.trim() || "No rationale provided.";
  const callout = `> **Rejected (${date}):** ${rationale}`;
  const cleanBody = spark.body.trim();

  if (!cleanBody) {
    return `${header}\n${callout}\n`;
  }
  return `${header}\n${callout}\n\n${cleanBody}\n`;
}

