/**
 * Modular citation discovery sources (git-native index query and filesystem fallback walk).
 * Implements ADR-4, ADR-5, RULE-25, and RULE-31.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import { escapeRegex, toPosixRelative } from "../common/index.ts";
import { resolveWorkspaceContext, type WorkspaceContext } from "../context.ts";
import type { IVcsAdapter } from "../vcs/types.ts";

export const DEFAULT_IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".cache",
  ".gemini",
  ".turbo",
  ".next",
  ".local",
  ".Trash",
  "Trash",
  ".cargo",
  ".rustup",
  ".npm",
  ".bun",
  ".yarn",
  ".venv",
  "venv",
  "target",
]);

export const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".webp",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".lockb",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
]);

/**
 * Creates a regular expression matching an artifact tag with word boundaries
 * that disallow leading/trailing alphanumeric characters, hyphens, or underscores.
 */
export function createTagRegex(tag: string): RegExp {
  return new RegExp(
    `(?<![A-Za-z0-9_-])${escapeRegex(tag)}(?![A-Za-z0-9_-])`,
    "i",
  );
}

/**
 * Normalized match token emitted by a citation source.
 */
export interface CitationMatch {
  /**
   * Posix relative path from workspace root.
   */
  relPath: string;

  /**
   * 1-based line number in the matched file.
   */
  line: number;

  /**
   * Raw or trimmed content of the matched line.
   */
  snippet: string;

  /**
   * Optional absolute file path.
   */
  filepath?: string;
}

/**
 * Options configuring citation source search execution.
 */
export interface CitationSourceOptions {
  /**
   * Workspace root directory.
   */
  cwd: string;

  /**
   * Target artifact filepath to exclude from results.
   */
  targetFilepath?: string;

  /**
   * Custom set or array of directories to skip.
   */
  ignoredDirectories?: Set<string> | string[];
}

/**
 * Pluggable abstraction for discovering artifact tag occurrences across a workspace.
 */
export interface CitationSource {
  /**
   * Scans the workspace for matching citations of the specified tag.
   */
  scan(
    targetTag: string,
    options: CitationSourceOptions,
  ): Promise<CitationMatch[]>;
}

/**
 * High-performance citation discovery source leveraging git grep index queries.
 */
export class GitGrepSource implements CitationSource {
  private vcs: IVcsAdapter;

  constructor(contextOrVcs?: WorkspaceContext | IVcsAdapter) {
    if (contextOrVcs && "vcs" in contextOrVcs) {
      this.vcs = contextOrVcs.vcs;
    } else if (contextOrVcs) {
      this.vcs = contextOrVcs;
    } else {
      this.vcs = resolveWorkspaceContext().vcs;
    }
  }

  /**
   * Checks whether the directory is an active git working tree.
   */
  async isAvailable(cwd: string): Promise<boolean> {
    return this.vcs.isInsideWorkTree(cwd).catch(() => false);
  }

  /**
   * Executes a git grep index search across tracked and untracked files.
   */
  async scan(
    targetTag: string,
    options: CitationSourceOptions,
  ): Promise<CitationMatch[]> {
    const cwd = options.cwd;
    const isGitRepo = await this.isAvailable(cwd);
    if (!isGitRepo) {
      throw new Error(`Directory is not a git repository: ${cwd}`);
    }

    const ignoredDirs = options.ignoredDirectories
      ? new Set(options.ignoredDirectories)
      : DEFAULT_IGNORED_DIRECTORIES;
    const targetFilepath = options.targetFilepath;

    const matches = await this.vcs.grep(targetTag, cwd, {
      untracked: true,
      caseSensitive: false,
      fixedStrings: true,
      ignoredDirectories: Array.from(ignoredDirs),
    });

    if (!matches) {
      return [];
    }

    const results: CitationMatch[] = [];

    for (const match of matches) {
      const relPath = match.relativePath;
      const fullPath = resolve(cwd, relPath);

      // Skip target artifact file itself
      if (targetFilepath && fullPath === targetFilepath) {
        continue;
      }

      // Filter ignored directories from relative path segments
      const segments = relPath.split(/[/\\]/);
      if (segments.some((seg) => ignoredDirs.has(seg))) {
        continue;
      }

      const fileName = basename(relPath);
      const ext = extname(fileName).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) {
        continue;
      }

      results.push({
        relPath,
        line: match.line,
        snippet: match.snippet,
        filepath: fullPath,
      });
    }

    return results;
  }
}

/**
 * Fallback citation discovery source using recursive filesystem traversal.
 */
export class FsWalkSource implements CitationSource {
  /**
   * Recursively walks the workspace directory, scanning text files for tag occurrences.
   */
  async scan(
    targetTag: string,
    options: CitationSourceOptions,
  ): Promise<CitationMatch[]> {
    const cwd = options.cwd;
    const ignoredDirs = options.ignoredDirectories
      ? new Set(options.ignoredDirectories)
      : DEFAULT_IGNORED_DIRECTORIES;
    const targetFilepath = options.targetFilepath;
    const tagRegex = createTagRegex(targetTag);
    const results: CitationMatch[] = [];

    async function walk(dir: string): Promise<void> {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!ignoredDirs.has(entry.name)) {
            await walk(fullPath);
          }
        } else if (entry.isFile()) {
          // Skip target file itself
          if (targetFilepath && resolve(fullPath) === targetFilepath) {
            continue;
          }

          const ext = extname(entry.name).toLowerCase();
          if (BINARY_EXTENSIONS.has(ext)) {
            continue;
          }

          // Limit file reading to text files under 5MB
          try {
            const fileStat = await stat(fullPath);
            if (fileStat.size > 5 * 1024 * 1024) {
              continue;
            }
          } catch {
            continue;
          }

          let content: string;
          try {
            content = await readFile(fullPath, "utf8");
          } catch {
            continue;
          }

          if (!tagRegex.test(content)) {
            continue;
          }

          const lines = content.split("\n");
          const relPath = toPosixRelative(cwd, fullPath);

          for (let i = 0; i < lines.length; i++) {
            const lineNum = i + 1;
            const line = lines[i]!;

            if (tagRegex.test(line)) {
              results.push({
                relPath,
                line: lineNum,
                snippet: line.replace(/\r$/, ""),
                filepath: fullPath,
              });
            }
          }
        }
      }
    }

    await walk(cwd);
    return results;
  }
}
