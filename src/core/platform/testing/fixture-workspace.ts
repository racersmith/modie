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
import {
  formatArtifactFilename,
  formatArtifactTag,
  renderAdrMarkdown,
  renderRuleMarkdown,
  renderTaskMarkdown,
  resolveArtifactDirectories,
  type IndexableSubtype,
} from "../../domain/index.ts";
import { parseMarkdownSections } from "../markdown/index.ts";
import {
  createWorkspaceContextSync,
  type WorkspaceContext,
} from "../../engine/context/index.ts";

const execFileAsync = promisify(execFile);

// Ensure Symbol.asyncDispose compatibility across runtimes
(Symbol as any).asyncDispose ??= Symbol("Symbol.asyncDispose");

export type TaskCriterionItem = string | { text: string; completed?: boolean };

export interface CreateTaskOptions {
  id?: number | string;
  slug?: string;
  title?: string;
  summary?: string;
  contextSection?: string;
  context?: string;
  criteria?: TaskCriterionItem[];
  depends_on?: string[];
  links?: string[];
  scopeDir?: string;
  rawContent?: string;
}

export interface CreateRuleOptions {
  id?: number | string;
  slug?: string;
  title?: string;
  summary?: string;
  assertion?: string;
  contextSection?: string;
  context?: string;
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
  contextSection?: string;
  context?: string;
  alternatives?: string;
  decision?: string;
  consequences?: string;
  links?: string[];
  supersedes?: string | string[];
  superseded_by?: string | string[];
  isArchived?: boolean;
  scopeDir?: string;
  rawContent?: string;
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
  contextSection?: string;
  context?: string;
  alternatives?: string;
  decision?: string;
  consequences?: string;
  body?: string;
  acceptanceCriteria?: TaskCriterionItem[];
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
  context: WorkspaceContext;
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

function resolveFixtureTargetDir(
  options: CreateFixtureArtifactOptions,
  subtype: IndexableSubtype,
  cwd: string,
): string {
  if (options.subDir !== undefined) {
    return join(cwd, options.subDir);
  }
  if (options.scopeDir !== undefined) {
    return resolveArtifactDirectories(subtype, options.scopeDir, cwd).targetDir;
  }
  const defaultDir =
    subtype === "RULE"
      ? ".modie/rules"
      : subtype === "ADR"
        ? ".modie/adrs"
        : ".modie/tasks";
  return join(cwd, defaultDir);
}

function normalizeList(val?: string | string[]): string[] | undefined {
  if (!val) return undefined;
  return Array.isArray(val) ? val : [val];
}

function renderFixtureRuleContent(
  options: CreateFixtureArtifactOptions,
  id: string,
  slug: string,
  supersedes?: string[],
  superseded_by?: string[],
): string {
  const rawCtx = options.contextSection ?? options.context;
  const assertionText =
    options.body ??
    (rawCtx
      ? `# Context\n\n${rawCtx}`
      : options.title
        ? `# Invariant\n\nRule body for ${options.title}.`
        : "Fixture RULE invariant body.");

  return renderRuleMarkdown({
    id,
    slug,
    title: options.title,
    summary: options.summary,
    links: options.links ?? [],
    supersedes,
    superseded_by,
    assertion: assertionText,
    skipValidation: true,
  });
}

function renderFixtureAdrContent(
  options: CreateFixtureArtifactOptions,
  id: string,
  slug: string,
  supersedes?: string[],
  superseded_by?: string[],
): string {
  const parsedBodySections = options.body
    ? parseMarkdownSections(options.body)
    : {};
  const alternatives =
    options.alternatives ?? parsedBodySections["Alternatives Considered"];
  const decision =
    options.decision ??
    parsedBodySections["Decision"] ??
    (!parsedBodySections["Alternatives Considered"] && options.body
      ? options.body
      : undefined);
  const consequences =
    options.consequences ?? parsedBodySections["Consequences"];
  const contextText =
    options.contextSection ??
    options.context ??
    parsedBodySections["Context"] ??
    (options.title ? `Context for ${options.title}` : undefined);

  return renderAdrMarkdown({
    id,
    slug,
    title: options.title,
    summary: options.summary,
    links: options.links ?? [],
    supersedes,
    superseded_by,
    context: contextText,
    alternatives,
    decision,
    consequences,
    skipValidation: true,
  });
}

function renderFixtureTaskContent(
  options: CreateFixtureArtifactOptions,
  id: string,
  slug: string,
): string {
  return renderTaskMarkdown({
    id,
    slug,
    title: options.title,
    summary: options.summary,
    context:
      options.contextSection ??
      options.context ??
      options.body ??
      (options.title
        ? `Context for ${options.title}`
        : "Fixture TASK invariant body."),
    depends_on: options.depends_on ?? [],
    links: options.links ?? [],
    acceptanceCriteria: options.acceptanceCriteria ?? [],
    skipValidation: true,
    allowEmptyCriteria: true,
  });
}

function renderFixtureContent(
  options: CreateFixtureArtifactOptions,
  subtype: IndexableSubtype,
  id: string,
  slug: string,
): string {
  if (options.rawContent !== undefined) {
    return options.rawContent;
  }
  const supersedes = normalizeList(options.supersedes);
  const superseded_by = normalizeList(options.superseded_by);

  if (subtype === "RULE") {
    return renderFixtureRuleContent(options, id, slug, supersedes, superseded_by);
  }
  if (subtype === "ADR") {
    return renderFixtureAdrContent(options, id, slug, supersedes, superseded_by);
  }
  return renderFixtureTaskContent(options, id, slug);
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
  const context = createWorkspaceContextSync({ root: cwd });

  let testIdCounter = 1;

  const workspace: FixtureWorkspace = {
    cwd,
    context,

    makeTag(subtype: string, id: number | string): string {
      return formatArtifactTag(subtype, id);
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

      const targetDir = resolveFixtureTargetDir(options, upperSubtype, cwd);
      await mkdir(targetDir, { recursive: true });

      const filepath = join(targetDir, filename);
      const content = renderFixtureContent(options, upperSubtype, id, slug);
      await writeFile(filepath, content, "utf8");

      return {
        tag: formatArtifactTag(upperSubtype, id),
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
        summary: options.summary,
        context: options.contextSection ?? options.context,
        acceptanceCriteria: options.criteria,
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
        summary: options.summary,
        body:
          options.body ??
          options.assertion ??
          options.contextSection ??
          options.context,
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
        context: options.contextSection ?? options.context,
        alternatives: options.alternatives,
        decision: options.decision,
        consequences: options.consequences,
        links: options.links,
        supersedes: options.supersedes,
        superseded_by: options.superseded_by,
        isArchived: options.isArchived,
        scopeDir: options.scopeDir,
        rawContent: options.rawContent,
      });
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
