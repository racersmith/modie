/**
 * Authoritative loader for Modie MCP Agent Governance Instructions.
 * Reads directly from the single authoritative instructions.md file
 * in src/interfaces/mcp/ (RULE-21, RULE-25, RULE-26).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir =
  typeof import.meta.dirname === "string"
    ? import.meta.dirname
    : dirname(fileURLToPath(import.meta.url));

export const DEFAULT_MCP_INSTRUCTIONS_PATH = join(
  currentDir,
  "instructions.md",
);

/**
 * Loads the authoritative Modie MCP agent governance instructions.
 * Reads from src/interfaces/mcp/instructions.md, or an optional custom path.
 * Throws a descriptive error if the file cannot be read, guaranteeing that
 * the markdown document is the single source of truth.
 */
export function loadMcpInstructions(customPath?: string): string {
  const targetPath = customPath ?? DEFAULT_MCP_INSTRUCTIONS_PATH;
  try {
    const content = readFileSync(targetPath, "utf8");
    if (content && content.trim().length > 0) {
      return content.trim();
    }
  } catch (err) {
    throw new Error(
      `[modie-mcp] Failed to load agent instructions from "${targetPath}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  throw new Error(
    `[modie-mcp] Agent instructions file at "${targetPath}" is empty.`,
  );
}
