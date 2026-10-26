import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { formatArtifactFilename } from "../../core/common/filename.ts";
import type { IndexableSubtype } from "../../core/common/types.ts";
import { runCli } from "./cli.ts";
import type { CliIoOptions } from "./types.ts";

const execFileAsync = promisify(execFile);

export interface CapturedCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Options for generating a fixture artifact in an isolated test workspace.
 */
export interface CreateFixtureArtifactOptions {
  subtype: "RULE" | "ADR" | "TASK" | string;
  id?: string;
  slug?: string;
  links?: string[];
  depends_on?: string[];
  context?: string;
  body?: string;
  acceptanceCriteria?: string[];
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

export interface TestWorkspace {
  cwd: string;
  binPath: string;
  createArtifact(options: CreateFixtureArtifactOptions): Promise<CreatedFixtureArtifact>;
  captureCli(args: string[]): Promise<CapturedCliResult>;
  execBin(args: string[]): Promise<{ stdout: string; stderr: string }>;
  cleanup(): Promise<void>;
}

/**
 * Helper to capture stdout, stderr, and exitCode from in-process CLI execution.
 */
export async function captureCli(
  args: string[],
  cwd: string = process.cwd(),
): Promise<CapturedCliResult> {
  let stdout = "";
  let stderr = "";

  const io: CliIoOptions = {
    stdout: (msg) => {
      stdout += (stdout ? "\n" : "") + msg;
    },
    stderr: (msg) => {
      stderr += (stderr ? "\n" : "") + msg;
    },
    cwd,
  };

  const exitCode = await runCli(args, io);
  return { exitCode, stdout, stderr };
}

/**
 * Creates an isolated temporary test workspace with helpers for creating
 * test-scoped fixture artifacts and executing CLI commands in-process and via subprocess.
 * Enforces RULE-34 (Fixture-Based Test Isolation).
 */
export async function createTestWorkspace(
  prefix: string = "modie-test-workspace-",
): Promise<TestWorkspace> {
  const cwd = await mkdtemp(join(tmpdir(), prefix));
  const binPath = join(process.cwd(), "src/interfaces/cli/bin.ts");
  let sequence = 1;

  return {
    cwd,
    binPath,
    async createArtifact(options: CreateFixtureArtifactOptions): Promise<CreatedFixtureArtifact> {
      const upperSubtype = options.subtype.toUpperCase() as IndexableSubtype;
      const id = options.id ?? `TEST-${sequence++}`;
      const slug = options.slug ?? `fixture-${upperSubtype.toLowerCase()}-${id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      const isArchived = Boolean(options.isArchived);

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
        if (options.depends_on && options.depends_on.length > 0) {
          frontmatterLines.push("depends_on:");
          for (const d of options.depends_on) {
            frontmatterLines.push(`  - ${d}`);
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
        frontmatterLines.push("---");
        frontmatterLines.push("");

        const bodySections: string[] = [];
        if (options.context) {
          bodySections.push(`# Context\n${options.context}`);
        }
        if (options.acceptanceCriteria && options.acceptanceCriteria.length > 0) {
          const criteriaLines = options.acceptanceCriteria.map((c) => `- [ ] ${c}`);
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
        tag: `${upperSubtype}-${id}`,
        subtype: upperSubtype,
        id,
        slug,
        filename,
        filepath,
        relativePath: relative(cwd, filepath),
        isArchived,
      };
    },

    async captureCli(args: string[]): Promise<CapturedCliResult> {
      return captureCli(args, cwd);
    },

    async execBin(args: string[]): Promise<{ stdout: string; stderr: string }> {
      return execFileAsync(process.execPath, [binPath, ...args], { cwd });
    },

    async cleanup(): Promise<void> {
      await rm(cwd, { recursive: true, force: true });
    },
  };
}
