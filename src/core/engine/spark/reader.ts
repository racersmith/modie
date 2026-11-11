import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import {
  lazyMintSparks,
  parseSparkLedger,
  resolveSparksPath,
  serializeSparkLedger,
  type SparkEntry,
} from "../../domain/spark/index.ts";

export interface ReadSparksResult {
  sparks: SparkEntry[];
  mintedCount: number;
  filepath: string;
}

/**
 * Reads the active sparks ledger from `.modie/ideas/SPARKS.md`.
 * If any sparks are untagged, lazily mints random 4-character hex handles
 * and writes the updated ledger back to disk in-place.
 */
export async function readSparks(
  cwd?: string | { cwd?: string },
): Promise<ReadSparksResult> {
  const filepath = resolveSparksPath(cwd);

  if (!existsSync(filepath)) {
    return {
      sparks: [],
      mintedCount: 0,
      filepath,
    };
  }

  const content = await readFile(filepath, "utf-8");
  const parsed = parseSparkLedger(content);

  if (parsed.unmintedCount === 0) {
    return {
      sparks: parsed.sparks,
      mintedCount: 0,
      filepath,
    };
  }

  // Perform lazy minting in-place
  const { ledger, mintedCount } = lazyMintSparks(parsed);
  const updatedContent = serializeSparkLedger(ledger.sparks);
  await writeFile(filepath, updatedContent, "utf-8");

  return {
    sparks: ledger.sparks,
    mintedCount,
    filepath,
  };
}

