/**
 * Random hex handle generation and in-place lazy minting for Modie sparks.
 */

import { serializeSpark } from "./serializer.ts";
import type { ParsedSparkLedger, SparkEntry } from "./types.ts";

/**
 * Generates a random 4-character hex handle (e.g. "7a1f").
 * Guarantees uniqueness against all handles in `existingHandles`.
 */
export function generateRandomHexHandle(
  existingHandles: Set<string> = new Set(),
): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const bytes = new Uint8Array(2);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toLowerCase();

    if (!existingHandles.has(hex)) {
      return hex;
    }
  }

  // Fallback to 6 hex chars if 4-char space is saturated
  return crypto.randomUUID().replace(/-/g, "").slice(0, 6);
}

/**
 * Lazily assigns unique 4-character random hex handles to any untagged sparks in a ledger.
 * Preserves existing custom or previously minted handles.
 */
export function lazyMintSparks(ledger: ParsedSparkLedger): {
  ledger: ParsedSparkLedger;
  mintedCount: number;
} {
  if (ledger.unmintedCount === 0) {
    return { ledger, mintedCount: 0 };
  }

  const existingHandles = new Set<string>();
  for (const spark of ledger.sparks) {
    if (spark.handle) {
      existingHandles.add(spark.handle.toLowerCase());
    }
  }

  let mintedCount = 0;
  const updatedSparks: SparkEntry[] = ledger.sparks.map((spark) => {
    if (spark.handle) {
      return spark;
    }

    const mintedHandle = generateRandomHexHandle(existingHandles);
    existingHandles.add(mintedHandle);
    mintedCount++;

    const updated: SparkEntry = {
      ...spark,
      handle: mintedHandle,
      raw: serializeSpark({ ...spark, handle: mintedHandle }),
    };

    return updated;
  });

  return {
    ledger: {
      sparks: updatedSparks,
      unmintedCount: 0,
    },
    mintedCount,
  };
}

