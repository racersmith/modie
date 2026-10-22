/**
 * Configuration loader for Modie.
 * Complies with ADR-9, ADR-10, and RULE-28.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { runGit } from "../resolver/git-inspector.ts";
import type { ModieConfig, ResolvedModieConfig } from "./types.ts";

export const DEFAULT_PROTECTED_BRANCHES = ["main", "master"];
export const DEFAULT_TRUNK_BRANCH = "dev";

/**
 * Searches upward from `startDir` to locate `.modie/config.json`.
 * Stops if the filesystem root is reached or a `.git` root boundary is encountered.
 */
export function findModieConfigFile(startDir: string = process.cwd()): string | null {
  let current = resolve(startDir);

  while (true) {
    const candidate = join(current, ".modie", "config.json");
    if (existsSync(candidate)) {
      return candidate;
    }

    // Also stop if at git root boundary after checking candidate
    if (existsSync(join(current, ".git"))) {
      break;
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return null;
}

/**
 * Resolves the default trunk branch by inspecting existing local git branches.
 * If "dev" exists, returns "dev"; otherwise falls back to "main".
 */
async function resolveDefaultTrunk(cwd: string): Promise<string> {
  const branchesOutput = await runGit(["branch", "--list"], cwd);
  if (branchesOutput) {
    const branches = branchesOutput
      .split("\n")
      .map((b) => b.replace(/^\*?\s+/, "").trim());
    if (branches.includes("dev")) {
      return "dev";
    }
    if (branches.includes("main")) {
      return "main";
    }
  }
  return DEFAULT_TRUNK_BRANCH;
}

/**
 * Loads and resolves the active Modie project configuration.
 *
 * Resolution precedence:
 * 1. Git config overrides (`git config modie.trunk`, `git config modie.protectedBranches`, `git config modie.prefix`)
 * 2. Configuration file (`.modie/config.json`)
 * 3. Sensible defaults (`trunk: "dev"`, `protectedBranches: ["main", "master"]`)
 */
export async function loadModieConfig(
  cwd: string = process.cwd(),
): Promise<ResolvedModieConfig> {
  const configPath = findModieConfigFile(cwd);
  let fileConfig: ModieConfig = {};

  if (configPath) {
    try {
      const raw = await readFile(configPath, "utf8");
      fileConfig = JSON.parse(raw);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse Modie configuration file at "${configPath}": ${msg}`);
    }
  }

  // 1. Inspect Git config overrides
  const gitConfigTrunk = await runGit(["config", "modie.trunk"], cwd);
  const gitConfigProtected = await runGit(["config", "modie.protectedBranches"], cwd);
  const gitConfigPrefix = await runGit(["config", "modie.prefix"], cwd);

  // 2. Resolve trunk branch
  let trunk: string;
  if (gitConfigTrunk && gitConfigTrunk.length > 0) {
    trunk = gitConfigTrunk.trim();
  } else if (fileConfig.git?.trunk) {
    trunk = fileConfig.git.trunk.trim();
  } else if (fileConfig.trunk) {
    trunk = fileConfig.trunk.trim();
  } else {
    trunk = await resolveDefaultTrunk(cwd);
  }

  // 3. Resolve protected branches
  let rawProtected: string[] = [];
  if (gitConfigProtected && gitConfigProtected.length > 0) {
    rawProtected = gitConfigProtected.split(",").map((b) => b.trim()).filter(Boolean);
  } else if (fileConfig.git?.protectedBranches && Array.isArray(fileConfig.git.protectedBranches)) {
    rawProtected = fileConfig.git.protectedBranches;
  } else if (fileConfig.protectedBranches && Array.isArray(fileConfig.protectedBranches)) {
    rawProtected = fileConfig.protectedBranches;
  } else {
    rawProtected = DEFAULT_PROTECTED_BRANCHES;
  }

  const protectedBranches = Array.from(
    new Set(rawProtected.map((b) => b.trim()).filter(Boolean)),
  );

  // 4. Resolve prefix
  const prefix =
    (gitConfigPrefix && gitConfigPrefix.length > 0 ? gitConfigPrefix.trim() : undefined) ||
    fileConfig.git?.prefix?.trim() ||
    fileConfig.prefix?.trim() ||
    undefined;

  return {
    trunk,
    protectedBranches,
    prefix,
    configPath: configPath ?? undefined,
  };
}
