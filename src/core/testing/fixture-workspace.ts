import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { formatArtifactFilename } from "../common/filename.ts";
import type { IndexableSubtype } from "../common/types.ts";

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

export interface FixtureWorkspace {
  cwd: string;
  createArtifact(options: CreateFixtureArtifactOptions): Promise<CreatedFixtureArtifact>;
  cleanup(): Promise<void>;
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

  return {
    cwd,

    async createArtifact(options: CreateFixtureArtifactOptions): Promise<CreatedFixtureArtifact> {
      const upperSubtype = options.subtype.toUpperCase() as IndexableSubtype;
      const id = options.id ?? `TEST-${testIdCounter++}`;
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

    async cleanup(): Promise<void> {
      await rm(cwd, { recursive: true, force: true });
    },
  };
}
