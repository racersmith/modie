import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { promisify } from "node:util";
import { formatArtifactFilename } from "../common/filename.ts";
import { resolveArtifactDirectories } from "../common/directories.ts";
import type { IndexableSubtype } from "../common/types.ts";
import { renderAdrMarkdown } from "../adr/template.ts";
import { parseMarkdownSections } from "../query/markdown-parser.ts";
import { renderRuleMarkdown } from "../rule/template.ts";
import { renderTaskMarkdown } from "../task/template.ts";

const execFileAsync = promisify(execFile);

// Ensure Symbol.asyncDispose compatibility across runtimes
(Symbol as any).asyncDispose ??= Symbol("Symbol.asyncDispose");

/**
 * Programmatically constructs a canonical artifact tag (e.g. `makeTestTag("ABC", 123)` -> `"ABC-123"`).
 * Prevents literal tag strings from appearing in test source code, ensuring dogfooding citation
 * scans never match test fixture data as active repository artifacts while maintaining 100%
 * runtime parity with production tag formats.
 * @satisfies RULE-35
 */
export function makeTestTag(subtype: string, id: number | string): string {
  return `${subtype.toUpperCase()}-${id}`;
}

export type TaskCriterionItem = string | { text: string; completed?: boolean };

export interface CreateTaskOptions {
  id?: number | string;
  slug?: string;
  title?: string;
  context?: string;
  criteria?: TaskCriterionItem[];
  depends_on?: string[];
  links?: string[];
  plannedGovernance?: {
    rules?: TaskCriterionItem[];
    adrs?: TaskCriterionItem[];
  };
  scopeDir?: string;
  rawContent?: string;
}

export interface CreateRuleOptions {
  id?: number | string;
  slug?: string;
  title?: string;
  body?: string;
  links?: string[];
  supersedes?: string | string[];
  superseded_by?: string | string[];
  isArchived?: boolean;
  scopeDir?: string;
  rawContent?: string;
}

export interface CreateAdrOptions {
  id?: number | string;
  slug?: string;
  title?: string;
  summary?: string;
  context?: string;
  alternatives?: string;
  decision?: string;
  links?: string[];
  supersedes?: string | string[];
  superseded_by?: string | string[];
  isArchived?: boolean;
  scopeDir?: string;
  rawContent?: string;
}

export interface CreateGistOptions {
  /**
   * Target architectural scope directory (defaults to workspace root).
   */
  scopeDir?: string;

  /**
   * Optional source filename for a file-level GIST proxy (`<filename>.GIST.md`).
   * Omit to create a directory-level summary (`GIST.md`).
   */
  filename?: string;

  /**
   * Natural-language prose content of the GIST.
   */
  content: string;
}

export interface CreatedFixtureGist {
  type: "directory" | "file";
  scope: string;
  sourceFilename?: string;
  filename: string;
  filepath: string;
  relativePath: string;
}

export interface CreateMotiveFixtureOptions {
  /**
   * Target architectural scope directory (defaults to workspace root).
   */
  scopeDir?: string;

  /**
   * Natural-language prose content of the MOTIVE.md file.
   */
  content?: string;
}

export interface CreatedFixtureMotive {
  scope: string;
  filename: string;
  filepath: string;
  relativePath: string;
  content: string;
}

/**
 * Options for generating a fixture artifact in an isolated test workspace.
 */
export interface CreateFixtureArtifactOptions {
  subtype: "RULE" | "ADR" | "TASK" | string;
  id?: number | string;
  slug?: string;
  title?: string;
  summary?: string;
  links?: string[];
  depends_on?: string[];
  supersedes?: string | string[];
  superseded_by?: string | string[];
  context?: string;
  alternatives?: string;
  decision?: string;
  body?: string;
  acceptanceCriteria?: TaskCriterionItem[];
  plannedGovernance?: {
    rules?: TaskCriterionItem[];
    adrs?: TaskCriterionItem[];
  };
  isArchived?: boolean;
  rawContent?: string;
  scopeDir?: string;
  subDir?: string;
}

export interface CreatedFixtureArtifact {
  tag: string;
  subtype: IndexableSubtype;
  id: string;
  slug: string;
  filename: string;
  filepath: string;
  relativePath: string;
  isArchived: boolean;
}

export interface FixtureWorkspace {
  cwd: string;
  makeTag(subtype: string, id: number | string): string;
  resolve(...paths: string[]): string;
  mkdir(relativePath: string): Promise<string>;
  remove(target: string | CreatedFixtureArtifact): Promise<void>;
  createArtifact(
    options: CreateFixtureArtifactOptions,
  ): Promise<CreatedFixtureArtifact>;
  createTask(options?: CreateTaskOptions): Promise<CreatedFixtureArtifact>;
  createRule(options?: CreateRuleOptions): Promise<CreatedFixtureArtifact>;
  createAdr(options?: CreateAdrOptions): Promise<CreatedFixtureArtifact>;
  createGist(options: CreateGistOptions): Promise<CreatedFixtureGist>;
  createMotive(
    options?: CreateMotiveFixtureOptions,
  ): Promise<CreatedFixtureMotive>;
  readFile(target: string | CreatedFixtureArtifact): Promise<string>;
  fileExists(target: string | CreatedFixtureArtifact): Promise<boolean>;
  readJson<T = any>(target: string | CreatedFixtureArtifact): Promise<T>;
  writeFile(relativePath: string, content: string): Promise<string>;
  initGit(options?: {
    defaultBranch?: string;
    initialCommit?: boolean;
  }): Promise<void>;
  gitCommit(message: string): Promise<string>;
  gitCheckout(branch: string, options?: { create?: boolean }): Promise<void>;
  cleanup(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}

/**
 * Creates an isolated temporary directory for testing Modie core functions
 * without mutating or relying upon the host repository filesystem.
 * Enforces RULE-34 (fixture-based test isolation).
 */
export async function createFixtureWorkspace(
  prefix = "modie-core-test-",
): Promise<FixtureWorkspace> {
  const cwd = await mkdtemp(join(tmpdir(), prefix));

  let testIdCounter = 1;

  const workspace: FixtureWorkspace = {
    cwd,

    makeTag(subtype: string, id: number | string): string {
      return makeTestTag(subtype, id);
    },

    async createArtifact(
      options: CreateFixtureArtifactOptions,
    ): Promise<CreatedFixtureArtifact> {
      const upperSubtype = options.subtype.toUpperCase() as IndexableSubtype;
      const rawId = options.id ?? `TEST-${testIdCounter++}`;
      const id = String(rawId);
      const slug = options.slug ?? `sample-${upperSubtype.toLowerCase()}`;
      const isArchived = options.isArchived ?? false;

      const filename = formatArtifactFilename({
        slug,
        subtype: upperSubtype,
        id,
        isArchived,
      });

      let targetDir: string;
      if (options.subDir !== undefined) {
        targetDir = join(cwd, options.subDir);
      } else if (options.scopeDir !== undefined) {
        const resolved = resolveArtifactDirectories(
          upperSubtype,
          options.scopeDir,
          cwd,
        );
        targetDir = resolved.targetDir;
      } else {
        targetDir = join(
          cwd,
          upperSubtype === "RULE"
            ? ".modie/rules"
            : upperSubtype === "ADR"
              ? ".modie/adrs"
              : ".modie/tasks",
        );
      }

      await mkdir(targetDir, { recursive: true });

      const filepath = join(targetDir, filename);

      let content = options.rawContent;
      if (content === undefined) {
        const supersedesList = options.supersedes
          ? Array.isArray(options.supersedes)
            ? options.supersedes
            : [options.supersedes]
          : undefined;
        const supersededByList = options.superseded_by
          ? Array.isArray(options.superseded_by)
            ? options.superseded_by
            : [options.superseded_by]
          : undefined;

        if (upperSubtype === "RULE") {
          const assertionText =
            options.body ??
            (options.context
              ? `# Context\n\n${options.context}`
              : options.title
                ? `# Invariant\n\nRule body for ${options.title}.`
                : "Fixture RULE invariant body.");
          content = renderRuleMarkdown({
            id,
            slug,
            title: options.title,
            links: options.links ?? [],
            supersedes: supersedesList,
            superseded_by: supersededByList,
            assertion: assertionText,
            skipValidation: true,
          });
        } else if (upperSubtype === "ADR") {
          const parsedBodySections = options.body
            ? parseMarkdownSections(options.body)
            : {};
          const alternatives =
            options.alternatives ??
            parsedBodySections["Alternatives Considered"];
          const decision =
            options.decision ??
            parsedBodySections["Decision"] ??
            (!parsedBodySections["Alternatives Considered"] && options.body
              ? options.body
              : undefined);
          const contextText =
            options.context ??
            parsedBodySections["Context"] ??
            (options.title ? `Context for ${options.title}` : undefined);

          content = renderAdrMarkdown({
            id,
            slug,
            title: options.title,
            summary: options.summary,
            links: options.links ?? [],
            supersedes: supersedesList,
            superseded_by: supersededByList,
            context: contextText,
            alternatives,
            decision,
            skipValidation: true,
          });
        } else {
          content = renderTaskMarkdown({
            id,
            slug,
            title: options.title,
            context:
              options.context ??
              options.body ??
              (options.title
                ? `Context for ${options.title}`
                : "Fixture TASK invariant body."),
            depends_on: options.depends_on ?? [],
            links: options.links ?? [],
            plannedGovernance: options.plannedGovernance,
            acceptanceCriteria: options.acceptanceCriteria ?? [],
            skipValidation: true,
            allowEmptyCriteria: true,
          });
        }
      }

      await writeFile(filepath, content, "utf8");

      return {
        tag: makeTestTag(upperSubtype, id),
        subtype: upperSubtype,
        id,
        slug,
        filename,
        filepath,
        relativePath: relative(cwd, filepath),
        isArchived,
      };
    },

    async createTask(
      options: CreateTaskOptions = {},
    ): Promise<CreatedFixtureArtifact> {
      return workspace.createArtifact({
        subtype: "TASK",
        id: options.id,
        title: options.title,
        slug:
          options.slug ??
          (options.title
            ? options.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")
            : undefined),
        context: options.context,
        acceptanceCriteria: options.criteria,
        plannedGovernance: options.plannedGovernance,
        depends_on: options.depends_on,
        links: options.links,
        scopeDir: options.scopeDir,
        rawContent: options.rawContent,
      });
    },

    async createRule(
      options: CreateRuleOptions = {},
    ): Promise<CreatedFixtureArtifact> {
      return workspace.createArtifact({
        subtype: "RULE",
        id: options.id,
        title: options.title,
        slug:
          options.slug ??
          (options.title
            ? options.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")
            : undefined),
        body: options.body,
        links: options.links,
        supersedes: options.supersedes,
        superseded_by: options.superseded_by,
        isArchived: options.isArchived,
        scopeDir: options.scopeDir,
        rawContent: options.rawContent,
      });
    },

    async createAdr(
      options: CreateAdrOptions = {},
    ): Promise<CreatedFixtureArtifact> {
      return workspace.createArtifact({
        subtype: "ADR",
        id: options.id,
        title: options.title,
        slug:
          options.slug ??
          (options.title
            ? options.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")
            : undefined),
        summary: options.summary,
        context: options.context,
        alternatives: options.alternatives,
        decision: options.decision,
        links: options.links,
        supersedes: options.supersedes,
        superseded_by: options.superseded_by,
        isArchived: options.isArchived,
        scopeDir: options.scopeDir,
        rawContent: options.rawContent,
      });
    },

    async createGist(options: CreateGistOptions): Promise<CreatedFixtureGist> {
      const resolvedScope = options.scopeDir?.trim()
        ? join(cwd, options.scopeDir.trim())
        : cwd;
      const gistsDir = join(resolvedScope, ".modie", "gists");
      await mkdir(gistsDir, { recursive: true });

      const isFileGist = Boolean(options.filename?.trim());
      const sourceFilename = options.filename?.trim();
      const filename = isFileGist
        ? sourceFilename!.endsWith(".GIST.md")
          ? sourceFilename!
          : `${sourceFilename!}.GIST.md`
        : "GIST.md";

      const filepath = join(gistsDir, filename);
      await writeFile(filepath, options.content, "utf8");

      const relScope = relative(cwd, resolvedScope).replace(/\\/g, "/");
      return {
        type: isFileGist ? "file" : "directory",
        scope: relScope === "" ? "." : relScope,
        ...(sourceFilename ? { sourceFilename } : {}),
        filename,
        filepath,
        relativePath: relative(cwd, filepath).replace(/\\/g, "/"),
      };
    },

    async createMotive(
      options: CreateMotiveFixtureOptions = {},
    ): Promise<CreatedFixtureMotive> {
      const resolvedScope = options.scopeDir?.trim()
        ? join(cwd, options.scopeDir.trim())
        : cwd;
      const modieDir = join(resolvedScope, ".modie");
      await mkdir(modieDir, { recursive: true });

      const filename = "MOTIVE.md";
      const filepath = join(modieDir, filename);
      const relScope = relative(cwd, resolvedScope).replace(/\\/g, "/");
      const scope = relScope === "" ? "." : relScope;
      const content =
        options.content?.trim() ||
        `Establish architectural purpose for scope ${scope}.`;

      await writeFile(filepath, `${content}\n`, "utf8");

      return {
        scope,
        filename,
        filepath,
        relativePath: relative(cwd, filepath).replace(/\\/g, "/"),
        content,
      };
    },

    resolve(...paths: string[]): string {
      return join(cwd, ...paths);
    },

    async mkdir(relativePath: string): Promise<string> {
      const targetDir = join(cwd, relativePath);
      await mkdir(targetDir, { recursive: true });
      return targetDir;
    },

    async remove(target: string | CreatedFixtureArtifact): Promise<void> {
      const raw = typeof target === "string" ? target.trim() : target.filepath;
      const p = raw.startsWith("/") ? raw : join(cwd, raw);
      await rm(p, { recursive: true, force: true });
    },

    async readFile(target: string | CreatedFixtureArtifact): Promise<string> {
      const raw = typeof target === "string" ? target.trim() : target.filepath;
      const p = raw.startsWith("/") ? raw : join(cwd, raw);
      return readFile(p, "utf8");
    },

    async fileExists(
      target: string | CreatedFixtureArtifact,
    ): Promise<boolean> {
      const raw = typeof target === "string" ? target.trim() : target.filepath;
      const p = raw.startsWith("/") ? raw : join(cwd, raw);
      try {
        await stat(p);
        return true;
      } catch {
        return false;
      }
    },

    async readJson<T = any>(
      target: string | CreatedFixtureArtifact,
    ): Promise<T> {
      const text = await workspace.readFile(target);
      return JSON.parse(text);
    },

    async writeFile(relativePath: string, content: string): Promise<string> {
      const targetPath = join(cwd, relativePath);
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, content, "utf8");
      return targetPath;
    },

    async initGit(options?: {
      defaultBranch?: string;
      initialCommit?: boolean;
    }): Promise<void> {
      const branch = options?.defaultBranch ?? "dev";
      await execFileAsync("git", ["init", "-b", branch], { cwd });
      await execFileAsync("git", ["config", "user.name", "Test Runner"], {
        cwd,
      });
      await execFileAsync("git", ["config", "user.email", "test@example.com"], {
        cwd,
      });
      await execFileAsync("git", ["config", "gc.auto", "0"], { cwd });
      await execFileAsync("git", ["config", "core.compression", "0"], { cwd });
      await execFileAsync("git", ["config", "commit.gpgsign", "false"], {
        cwd,
      });
      await execFileAsync("git", ["config", "core.preloadindex", "true"], {
        cwd,
      });
      if (options?.initialCommit ?? true) {
        await execFileAsync(
          "git",
          ["commit", "--allow-empty", "-m", "chore: initial commit"],
          { cwd },
        );
      }
    },

    async gitCommit(message: string): Promise<string> {
      await execFileAsync("git", ["add", "-A"], { cwd });
      const { stdout } = await execFileAsync("git", ["commit", "-m", message], {
        cwd,
      });
      return stdout;
    },

    async gitCheckout(
      branch: string,
      options?: { create?: boolean },
    ): Promise<void> {
      const args = options?.create
        ? ["checkout", "-b", branch]
        : ["checkout", branch];
      await execFileAsync("git", args, { cwd });
    },

    async cleanup(): Promise<void> {
      await rm(cwd, { recursive: true, force: true });
    },

    async [Symbol.asyncDispose](): Promise<void> {
      await rm(cwd, { recursive: true, force: true });
    },
  };

  return workspace;
}
