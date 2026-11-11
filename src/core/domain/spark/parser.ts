/**
 * Heading-delimited Markdown parser for Modie sparks.
 */

import type { ParsedSparkLedger, SparkEntry } from "./types.ts";

const CODE_FENCE_REGEX = /^(?:```|~~~)/;
const SPARK_HEADING_REGEX = /^#\s+(?:\[([^\s\]]+)\]\s+)?(.*)$/;

/**
 * Parses a heading-delimited SPARKS.md document into structured SparkEntry items.
 *
 * Aware of fenced code blocks: comments or headings inside ``` code blocks
 * are treated as body content, not spark delimiters.
 */
export function parseSparkLedger(rawContent: string): ParsedSparkLedger {
  const lines = rawContent.split(/\r?\n/);
  const sparks: SparkEntry[] = [];
  let unmintedCount = 0;

  let currentHandle: string | undefined;
  let currentTitle: string | null = null;
  let currentBodyLines: string[] = [];
  let currentRawLines: string[] = [];
  let inCodeFence = false;

  function flushCurrentSpark() {
    if (currentTitle !== null) {
      const body = currentBodyLines.join("\n").trim();
      const raw = currentRawLines.join("\n").trimEnd();
      sparks.push({
        handle: currentHandle,
        title: currentTitle,
        body,
        raw,
      });
      if (!currentHandle) {
        unmintedCount++;
      }
    }
    currentHandle = undefined;
    currentTitle = null;
    currentBodyLines = [];
    currentRawLines = [];
  }

  for (const line of lines) {
    // Check if line toggles a code fence
    if (CODE_FENCE_REGEX.test(line.trimStart())) {
      inCodeFence = !inCodeFence;
      if (currentTitle !== null) {
        currentBodyLines.push(line);
        currentRawLines.push(line);
      }
      continue;
    }

    // If inside a code fence, lines cannot start a new spark
    if (inCodeFence) {
      if (currentTitle !== null) {
        currentBodyLines.push(line);
        currentRawLines.push(line);
      }
      continue;
    }

    // Check for spark heading: # [handle] Title or # Title
    const match = line.match(SPARK_HEADING_REGEX);
    if (match) {
      flushCurrentSpark();
      currentHandle = match[1]?.trim() || undefined;
      currentTitle = match[2]?.trim() || "Untitled Spark";
      currentRawLines.push(line);
      continue;
    }

    // Content lines for current active spark
    if (currentTitle !== null) {
      currentBodyLines.push(line);
      currentRawLines.push(line);
    }
  }

  // Flush final spark at EOF
  flushCurrentSpark();

  return {
    sparks,
    unmintedCount,
  };
}

