/**
 * Core domain types for GIST artifacts, file-level proxies, and child signposts.
 * Complies with ADR-2, ADR-4, ADR-8, ADR-10, ADR-11, RULE-8, RULE-9, RULE-12, and RULE-20.
 */

export interface ResolveGistOptions {
  /**
   * Workspace root directory (defaults to process.cwd()).
   */
  cwd?: string;
}

export interface GistPaths {
  /**
   * Absolute path to the target directory `<dir>` described by the GISTs.
   */
  scopeDir: string;

  /**
   * Normalized relative directory path from workspace root (e.g. "." or "src/core").
   */
  scope: string;

  /**
   * Absolute path to `<dir>/.modie/gists`.
   */
  gistsDir: string;

  /**
   * Relative path to `<dir>/.modie/gists` from workspace root.
   */
  relativeGistsDir: string;

  /**
   * Absolute path to the directory-level summary `<dir>/.modie/gists/GIST.md` (RULE-20).
   */
  directoryGistPath: string;

  /**
   * Relative path to `<dir>/.modie/gists/GIST.md` from workspace root.
   */
  relativeDirectoryGistPath: string;

  /**
   * Absolute path to the freshness ledger `<dir>/.modie/gists/.gists` (RULE-20, ADR-11).
   */
  ledgerPath: string;

  /**
   * Relative path to `<dir>/.modie/gists/.gists` from workspace root.
   */
  relativeLedgerPath: string;
}

export interface FileGistPaths {
  /**
   * Absolute path to the enclosing directory `<dir>`.
   */
  scopeDir: string;

  /**
   * Normalized relative directory path from workspace root (e.g. "." or "src/core").
   */
  scope: string;

  /**
   * Full name of the source file including extension (e.g. "active-scanner.ts").
   */
  sourceFilename: string;

  /**
   * Absolute path to the target source file `<dir>/<filename>`.
   */
  sourceFilepath: string;

  /**
   * Relative path to the target source file from workspace root.
   */
  sourceRelativePath: string;

  /**
   * Basename of the GIST file (`<filename>.GIST.md`) per RULE-20.
   */
  gistFilename: string;

  /**
   * Absolute path to `<dir>/.modie/gists/<filename>.GIST.md` (RULE-20).
   */
  gistFilepath: string;

  /**
   * Relative path to `<dir>/.modie/gists/<filename>.GIST.md` from workspace root.
   */
  relativeGistFilepath: string;
}

export interface DirectoryGist {
  /**
   * Discriminator for directory-level GIST summary (`GIST.md`).
   */
  type: "directory";

  /**
   * Normalized relative directory path from workspace root (e.g. "." or "src/core").
   */
  scope: string;

  /**
   * Absolute path to the directory `<dir>`.
   */
  scopeDir: string;

  /**
   * Absolute path to `<dir>/.modie/gists/GIST.md`.
   */
  filepath: string;

  /**
   * Relative path to `<dir>/.modie/gists/GIST.md` from workspace root.
   */
  relativePath: string;

  /**
   * Trimmed natural-language prose summary.
   */
  content: string;

  /**
   * Unparsed raw file content.
   */
  rawContent: string;
}

export interface FileGist {
  /**
   * Discriminator for file-level implementation GIST proxy (`<filename>.GIST.md`).
   */
  type: "file";

  /**
   * Normalized relative directory path from workspace root (e.g. "." or "src/core").
   */
  scope: string;

  /**
   * Absolute path to the enclosing directory `<dir>`.
   */
  scopeDir: string;

  /**
   * Full name of the described source file including extension (e.g. "index.ts").
   */
  sourceFilename: string;

  /**
   * Absolute path to `<dir>/<filename>`.
   */
  sourceFilepath: string;

  /**
   * Relative path to `<dir>/<filename>` from workspace root.
   */
  sourceRelativePath: string;

  /**
   * Basename of the GIST proxy file (`<filename>.GIST.md`).
   */
  gistFilename: string;

  /**
   * Absolute path to `<dir>/.modie/gists/<filename>.GIST.md`.
   */
  filepath: string;

  /**
   * Relative path to `<dir>/.modie/gists/<filename>.GIST.md` from workspace root.
   */
  relativePath: string;

  /**
   * Trimmed natural-language prose summary.
   */
  content: string;

  /**
   * Unparsed raw file content.
   */
  rawContent: string;
}

export interface GistSignpost {
  /**
   * Immediate child directory name (e.g. "core", "interfaces").
   */
  name: string;

  /**
   * Normalized relative path to the child directory from workspace root (e.g. "src/core").
   */
  scope: string;

  /**
   * Absolute path to the child directory `<child>`.
   */
  scopeDir: string;

  /**
   * Absolute path to `<child>/.modie/gists/GIST.md` (ADR-8, RULE-20).
   */
  filepath: string;

  /**
   * Relative path to `<child>/.modie/gists/GIST.md` from workspace root.
   */
  relativePath: string;

  /**
   * Trimmed 1-2 sentence directory GIST summary prose.
   */
  content: string;
}

export interface LocalGistsResult {
  /**
   * Normalized relative directory path from workspace root (e.g. "." or "src/core").
   */
  scope: string;

  /**
   * Absolute path to the directory `<dir>`.
   */
  scopeDir: string;

  /**
   * Absolute path to `<dir>/.modie/gists`.
   */
  gistsDir: string;

  /**
   * Relative path to `<dir>/.modie/gists` from workspace root.
   */
  relativeGistsDir: string;

  /**
   * Directory-level summary (`<dir>/.modie/gists/GIST.md`), or null if absent.
   */
  directoryGist: DirectoryGist | null;

  /**
   * File-level GIST proxies (`<dir>/.modie/gists/<filename>.GIST.md`), sorted alphabetically by `sourceFilename`.
   */
  fileGists: FileGist[];
}

export interface GistDiscoveryResult extends LocalGistsResult {
  /**
   * Immediate child directory GIST signposts (`<child>/.modie/gists/GIST.md`, depth=1) per ADR-8,
   * sorted alphabetically by child directory name.
   */
  signposts: GistSignpost[];
}

