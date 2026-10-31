/**
 * Domain types for Modie MOTIVE artifacts.
 * Enforces RULE-2, RULE-8, RULE-10, RULE-12, ADR-2, ADR-4, and ADR-10.
 */

export interface ResolveMotiveOptions {
  /**
   * Workspace root directory (defaults to `process.cwd()`).
   */
  cwd?: string;
}

/**
 * Resolved filesystem paths for a directory scope's singleton `MOTIVE.md` (`<dir>/.modie/MOTIVE.md`).
 */
export interface MotivePaths {
  /**
   * Absolute path to the normalized governing directory `<dir>` (RULE-8).
   */
  scopeDir: string;

  /**
   * Relative POSIX path from workspace root to `<dir>` (e.g. `.` or `src/core`).
   */
  scope: string;

  /**
   * Absolute path to `<dir>/.modie`.
   */
  modieDir: string;

  /**
   * Relative POSIX path from workspace root to `<dir>/.modie`.
   */
  relativeModieDir: string;

  /**
   * Canonical motive filename (`MOTIVE.md`).
   */
  filename: string;

  /**
   * Absolute path to `<dir>/.modie/MOTIVE.md`.
   */
  filepath: string;

  /**
   * Relative POSIX path from workspace root to `<dir>/.modie/MOTIVE.md`.
   */
  relativePath: string;
}

/**
 * Options for rendering or scaffolding `MOTIVE.md` markdown content.
 */
export interface RenderMotiveOptions {
  /**
   * Explicit motive prose content. When omitted, scaffolds a default template for `scope`.
   */
  content?: string;

  /**
   * Target architectural scope relative path (used when scaffolding default template).
   */
  scope?: string;
}

/**
 * Options for creating a `MOTIVE.md` artifact in a target directory scope.
 */
export interface CreateMotiveOptions {
  /**
   * Target architectural scope directory (defaults to workspace root `.`).
   */
  scopeDir?: string;

  /**
   * Alias for `scopeDir`.
   */
  scope?: string;

  /**
   * Initial motive prose content. When omitted, scaffolds a default `MOTIVE.md` template.
   */
  content?: string;

  /**
   * Alias for `content`.
   */
  context?: string;

  /**
   * Explicitly allow overwriting an existing `MOTIVE.md` in the target scope.
   */
  overwrite?: boolean;

  /**
   * Alias for `overwrite`.
   */
  force?: boolean;

  /**
   * Workspace root directory (defaults to `process.cwd()`).
   */
  cwd?: string;
}

/**
 * Parsed or created `MOTIVE.md` domain artifact.
 */
export interface MotiveArtifact {
  /**
   * Normalized relative POSIX scope (e.g. `.` or `src/core`).
   */
  scope: string;

  /**
   * Absolute path to the governing scope directory `<dir>`.
   */
  scopeDir: string;

  /**
   * Canonical filename (`MOTIVE.md`).
   */
  filename: string;

  /**
   * Absolute path to `<dir>/.modie/MOTIVE.md`.
   */
  filepath: string;

  /**
   * Relative POSIX path from workspace root to `<dir>/.modie/MOTIVE.md`.
   */
  relativePath: string;

  /**
   * Trimmed motive prose content.
   */
  content: string;
}

/**
 * Result returned by `createMotive`.
 */
export interface CreateMotiveResult {
  artifact: MotiveArtifact;
  scope: string;
  scopeDir: string;
  filename: string;
  filepath: string;
  relativePath: string;
  content: string;
  markdown: string;
  overwritten: boolean;
  scaffolded: boolean;
}

