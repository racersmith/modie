import { existsSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  formatRejectedSpark,
  resolveRejectedSparksPath,
  serializeSparkLedger,
  type SparkEntry,
} from "../../domain/spark/index.ts";
import { readSparks } from "./reader.ts";

export interface SparkRejectOptions {
  reason?: string;
  cwd?: string;
}

export interface SparkRejectResult {
  spark: SparkEntry;
  rejectedPath: string;
}

/**
 * Rejects an active spark, moving it to `.modie/ideas/.rejected/SPARKS.md` with an
 * immediate blockquote rationale note, and removes it from active `SPARKS.md`.
 */
export async function sparkReject(
  handle: string,
  options: SparkRejectOptions = {},
): Promise<SparkRejectResult> {
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

  const rejectedPath = resolveRejectedSparksPath(options.cwd);
  const rejectedDir = dirname(rejectedPath);

  if (!existsSync(rejectedDir)) {
    await mkdir(rejectedDir, { recursive: true });
  }

  const formattedRejected = formatRejectedSpark(spark, options.reason);
  await appendFile(rejectedPath, formattedRejected + "\n", "utf-8");
  await writeFile(sparksPath, serializeSparkLedger(sparks), "utf-8");

  return {
    spark,
    rejectedPath,
  };
}

