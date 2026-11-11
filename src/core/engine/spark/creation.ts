import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  generateRandomHexHandle,
  parseSparkLedger,
  resolveIdeasDir,
  resolveSparksPath,
  serializeSpark,
  serializeSparkLedger,
  type SparkAddOptions,
  type SparkEntry,
} from "../../domain/spark/index.ts";

export interface SparkAddResult {
  spark: SparkEntry;
  filepath: string;
  isNewFile: boolean;
}

/**
 * Appends a new spark to the `.modie/ideas/SPARKS.md` ledger.
 * Automatically generates a unique 4-character random hex handle if none supplied.
 */
export async function sparkAdd(
  options: SparkAddOptions,
): Promise<SparkAddResult> {
  const ideasDir = resolveIdeasDir(options.cwd);
  const filepath = resolveSparksPath(options.cwd);

  if (!existsSync(ideasDir)) {
    await mkdir(ideasDir, { recursive: true });
  }

  const existingHandles = new Set<string>();
  let isNewFile = true;
  let existingSparks: SparkEntry[] = [];

  if (existsSync(filepath)) {
    isNewFile = false;
    const content = await readFile(filepath, "utf-8");
    const parsed = parseSparkLedger(content);
    existingSparks = parsed.sparks;
    for (const s of existingSparks) {
      if (s.handle) {
        existingHandles.add(s.handle.toLowerCase());
      }
    }
  }

  const handle =
    options.handle?.trim() || generateRandomHexHandle(existingHandles);
  const title = options.title.trim();
  const body = options.body?.trim() || "";

  const newSpark: SparkEntry = {
    handle,
    title,
    body,
    raw: serializeSpark({ handle, title, body, raw: "" }),
  };

  const updatedSparks = [...existingSparks, newSpark];
  await writeFile(filepath, serializeSparkLedger(updatedSparks), "utf-8");

  return {
    spark: newSpark,
    filepath,
    isNewFile,
  };
}

