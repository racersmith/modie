import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { promisify } from "node:util";
import { formatArtifactFilename } from "../common/filename.ts";
import type { IndexableSubtype } from "../common/types.ts";

const execFileAsync = promisify(execFile);

// Ensure Symbol.asyncDispose compatibility across runtimes
(Symbol as any).asyncDispose ??= Symbol("Symbol.asyncDispose");

/**
 * Programmatically constructs a canonical artifact tag (e.g. `makeTestTag("ADR", 123)` -> `"ADR-123"`).
 * Prevents literal tag strings from appearing in test source code, ensuring dogfooding citation
 * scans never match test fixture data as active repository artifacts while maintaining 100%
 * runtime parity with production tag formats.
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
  subDir?: string;
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
  subDir?: string;
  rawContent?: string;
}

export interface CreateAdrOptions {
  id?: number | string;
  slug?: string;
  title?: string;
  context?: string;
  alternatives?: string;
  decision?: string;
  links?: string[];
  supersedes?: string | string[];
  superseded_by?: string | string[];
  isArchived?: boolean;
  subDir?: string;
  rawContent?: string;
}

/**
 * Options for generating a fixture artifact in an isolated test workspace.
 */
export interface CreateFixtureArtifactOptions {
  subtype: "RULE" | "ADR" | "TASK" | string;
  id?: number | string;
  slug?: string;
  links?: string[];
  depends_on?: string[];
  supersedes?: string | string[];
  superseded_by?: string | string[];
  context?: string;
  body?: string;
  acceptanceCriteria?: TaskCriterionItem[];
  plannedGovernance?: {
    rules?: TaskCriterionItem[];
    adrs?: TaskCriterionItem[];
  };
  isArchived?: boolean;
  rawContent?: string;
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
  createArtifact(options: CreateFixtureArtifactOptions): Promise<CreatedFixtureArtifact>;
  createTask(options?: CreateTaskOptions): Promise<CreatedFixtureArtifact>;
  createRule(options?: CreateRuleOptions): Promise<CreatedFixtureArtifact>;
  createAdr(options?: CreateAdrOptions): Promise<CreatedFixtureArtifact>;
  readFile(target: string | CreatedFixtureArtifact): Promise<string>;
  fileExists(target: string | CreatedFixtureArtifact): Promise<boolean>;
  readJson<T = any>(target: string | CreatedFixtureArtifact): Promise<T>;
  writeFile(relativePath: string, content: string): Promise<string>;
  initGit(options?: { defaultBranch?: string; initialCommit?: boolean }): Promise<void>;
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

    async createArtifact(options: CreateFixtureArtifactOptions): Promise<CreatedFixtureArtifact> {
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

      const subDir =
        options.subDir ??
        (upperSubtype === "RULE"
          ? ".modie/rules"
          : upperSubtype === "ADR"
            ? ".modie/adrs"
            : ".modie/tasks");

      const targetDir = join(cwd, subDir);
      await mkdir(targetDir, { recursive: true });

      const filepath = join(targetDir, filename);

      let content = options.rawContent;
      if (content === undefined) {
        const frontmatterLines: string[] = ["---"];
        if (options.depends_on !== undefined) {
          if (options.depends_on.length > 0) {
            frontmatterLines.push("depends_on:");
            for (const d of options.depends_on) {
              frontmatterLines.push(`  - ${d}`);
            }
          } else {
            frontmatterLines.push("depends_on: []");
          }
        }
        if (options.links && options.links.length > 0) {
          frontmatterLines.push("links:");
          for (const l of options.links) {
            frontmatterLines.push(`  - ${l}`);
          }
        } else {
          frontmatterLines.push("links: []");
        }
        if (options.supersedes) {
          frontmatterLines.push("supersedes:");
          const list = Array.isArray(options.supersedes) ? options.supersedes : [options.supersedes];
          for (const s of list) {
            frontmatterLines.push(`  - ${s}`);
          }
        }
        if (options.superseded_by) {
          frontmatterLines.push("superseded_by:");
          const list = Array.isArray(options.superseded_by) ? options.superseded_by : [options.superseded_by];
          for (const s of list) {
            frontmatterLines.push(`  - ${s}`);
          }
        }
        frontmatterLines.push("---");
        frontmatterLines.push("");

        const bodySections: string[] = [];
        if (options.context) {
          bodySections.push(`# Context\n\n${options.context}`);
        }
        if (options.plannedGovernance) {
          const govLines: string[] = ["# Planned Governance\n"];
          if (options.plannedGovernance.rules && options.plannedGovernance.rules.length > 0) {
            govLines.push("## Rules\n");
            for (const r of options.plannedGovernance.rules) {
              const text = typeof r === "string" ? r : r.text;
              const box = typeof r === "object" && r.completed ? "x" : " ";
              govLines.push(`- [${box}] ${text}`);
            }
            govLines.push("");
          }
          if (options.plannedGovernance.adrs && options.plannedGovernance.adrs.length > 0) {
            govLines.push("## ADRs\n");
            for (const a of options.plannedGovernance.adrs) {
              const text = typeof a === "string" ? a : a.text;
              const box = typeof a === "object" && a.completed ? "x" : " ";
              govLines.push(`- [${box}] ${text}`);
            }
            govLines.push("");
          }
          bodySections.push(govLines.join("\n").trim());
        }
        if (options.acceptanceCriteria && options.acceptanceCriteria.length > 0) {
          const criteriaLines = options.acceptanceCriteria.map((c) => {
            if (typeof c === "string") {
              return `- [ ] ${c}`;
            }
            return `- [${c.completed ? "x" : " "}] ${c.text}`;
          });
          bodySections.push(`# Acceptance Criteria\n\n${criteriaLines.join("\n")}`);
        }
        if (options.body) {
          bodySections.push(options.body);
        }
        if (bodySections.length === 0) {
          bodySections.push(`Fixture ${upperSubtype} invariant body.`);
        }
        content = `${frontmatterLines.join("\n")}\n${bodySections.join("\n\n")}\n`;
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

    async createTask(options: CreateTaskOptions = {}): Promise<CreatedFixtureArtifact> {
      return workspace.createArtifact({
        subtype: "TASK",
        id: options.id,
        slug: options.slug ?? (options.title ? options.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") : undefined),
        context: options.context ?? (options.title ? `Context for ${options.title}` : undefined),
        acceptanceCriteria: options.criteria,
        plannedGovernance: options.plannedGovernance,
        depends_on: options.depends_on,
        links: options.links,
        subDir: options.subDir,
        rawContent: options.rawContent,
      });
    },

    async createRule(options: CreateRuleOptions = {}): Promise<CreatedFixtureArtifact> {
      return workspace.createArtifact({
        subtype: "RULE",
        id: options.id,
        slug: options.slug ?? (options.title ? options.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") : undefined),
        body: options.body ?? (options.title ? `# Invariant\n\nRule body for ${options.title}.` : undefined),
        links: options.links,
        supersedes: options.supersedes,
        superseded_by: options.superseded_by,
        isArchived: options.isArchived,
        subDir: options.subDir,
        rawContent: options.rawContent,
      });
    },

    async createAdr(options: CreateAdrOptions = {}): Promise<CreatedFixtureArtifact> {
      const bodySections: string[] = [];
      if (options.alternatives) {
        bodySections.push(`# Alternatives Considered\n\n${options.alternatives}`);
      }
      if (options.decision) {
        bodySections.push(`# Decision\n\n${options.decision}`);
      }
      return workspace.createArtifact({
        subtype: "ADR",
        id: options.id,
        slug: options.slug ?? (options.title ? options.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") : undefined),
        context: options.context ?? (options.title ? `Context for ${options.title}` : undefined),
        body: bodySections.length > 0 ? bodySections.join("\n\n") : undefined,
        links: options.links,
        supersedes: options.supersedes,
        superseded_by: options.superseded_by,
        isArchived: options.isArchived,
        subDir: options.subDir,
        rawContent: options.rawContent,
      });
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

    async fileExists(target: string | CreatedFixtureArtifact): Promise<boolean> {
      const raw = typeof target === "string" ? target.trim() : target.filepath;
      const p = raw.startsWith("/") ? raw : join(cwd, raw);
      try {
        await stat(p);
        return true;
      } catch {
        return false;
      }
    },

    async readJson<T = any>(target: string | CreatedFixtureArtifact): Promise<T> {
      const text = await workspace.readFile(target);
      return JSON.parse(text);
    },

    async writeFile(relativePath: string, content: string): Promise<string> {
      const targetPath = join(cwd, relativePath);
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, content, "utf8");
      return targetPath;
    },

    async initGit(options?: { defaultBranch?: string; initialCommit?: boolean }): Promise<void> {
      const branch = options?.defaultBranch ?? "dev";
      await execFileAsync("git", ["init", "-b", branch], { cwd });
      await execFileAsync("git", ["config", "user.name", "Test Runner"], { cwd });
      await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd });
      await execFileAsync("git", ["config", "gc.auto", "0"], { cwd });
      await execFileAsync("git", ["config", "core.compression", "0"], { cwd });
      await execFileAsync("git", ["config", "commit.gpgsign", "false"], { cwd });
      await execFileAsync("git", ["config", "core.preloadindex", "true"], { cwd });
      if (options?.initialCommit ?? true) {
        await execFileAsync("git", ["commit", "--allow-empty", "-m", "chore: initial commit"], { cwd });
      }
    },

    async gitCommit(message: string): Promise<string> {
      await execFileAsync("git", ["add", "-A"], { cwd });
      const { stdout } = await execFileAsync("git", ["commit", "-m", message], { cwd });
      return stdout;
    },

    async gitCheckout(branch: string, options?: { create?: boolean }): Promise<void> {
      const args = options?.create ? ["checkout", "-b", branch] : ["checkout", branch];
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
