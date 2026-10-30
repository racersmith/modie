/**
 * Artifact reference discovery and subtype-agnostic archival guard.
 * Implements ADR-4, ADR-5, RULE-13, RULE-14, RULE-15, RULE-25, RULE-27, and RULE-31.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import {
  basename,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { parseArtifactFilename } from "../common/filename.ts";
import { defaultVcsAdapter } from "../vcs/git-cli-adapter.ts";
import type { GitGrepMatch, IVcsAdapter } from "../vcs/types.ts";
import { getArtifactDetails, resolveArtifactByTag } from "./artifact-query.ts";
import type {
  ArchivalGuardResult,
  ArtifactFoundIn,
  ArtifactLinksTo,
  ArtifactReferencesResult,
  FindArtifactReferencesOptions,
  FoundInItem,
} from "./types.ts";

const DEFAULT_IGNORED_DIRECTORIES = new Set([
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

const BINARY_EXTENSIONS = new Set([
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

const TEST_FILE_REGEX = /\.(test|spec)\.[a-zA-Z0-9]+$/;
const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rs",
  ".go",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".cs",
  ".rb",
  ".php",
  ".swift",
  ".kt",
  ".sh",
  ".bash",
]);

const DOC_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".rst"]);

/**
 * Escapes regex special characters.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Evaluates whether a line within a test file represents a formal verification declaration
 * per ADR-7 and RULE-23.
 *
 * Recognized formats:
 * 1. Comment annotations: `@verifies ...TAG...` or `@satisfies ...TAG...`
 * 2. Bracketed test headers inside string quotes: `"[...TAG...]"` or `'[...TAG...]'`
 * 3. Suite/test block declaration headers: `describe("...(TAG)...")`, `it("...(TAG)...")`
 * 4. Idiomatic test functions: `test_<tag>`, `def test_<tag>`, `fn test_<tag>`
 */
export function isTestVerificationCitation(
  line: string,
  targetTag: string,
): boolean {
  const escaped = escapeRegex(targetTag);

  // 1. Comment annotations: @verifies or @satisfies containing the tag
  const annotationRegex = new RegExp(
    `@(?:verifies|satisfies)\\b[^\\n]*?\\b${escaped}\\b`,
    "i",
  );
  if (annotationRegex.test(line)) {
    return true;
  }

  // 2. Bracketed test header inside string quotes: "[RULE-1]..." or '[RULE-1]...'
  const bracketRegex = new RegExp(
    `['"\`][^'"\`\\n]*?\\[[^\\]\\n]*?\\b${escaped}\\b[^\\]\\n]*?\\]`,
    "i",
  );
  if (bracketRegex.test(line)) {
    return true;
  }

  // 3. Parenthetical or quoted tag within test block declarations (describe/suite/context/it/test)
  const suiteRegex = new RegExp(
    `(?:describe|suite|context|it|test)\\s*\\(\\s*['"\`][^'"\`\\n]*?\\b${escaped}\\b`,
    "i",
  );
  if (suiteRegex.test(line)) {
    return true;
  }

  // 4. Idiomatic function declaration: test_rule_1, def test_rule_1, fn test_rule_1
  const normalizedTag = escaped.replace(/[-.]/g, "_");
  const fnRegex = new RegExp(
    `(?:def|fn|function|test)\\s+test[a-zA-Z0-9_]*?_${normalizedTag}\\b`,
    "i",
  );
  if (fnRegex.test(line)) {
    return true;
  }

  return false;
}

/**
 * Parses frontmatter metadata lines to identify which lines are link declarations.
 */
interface ParsedFrontmatterLinkLines {
  /** Map of 1-based line number to relationship name */
  linkLines: Map<number, string>;
  /** 1-based end line of the frontmatter block */
  frontmatterEndLine: number;
}

function parseFrontmatterLineMap(lines: string[]): ParsedFrontmatterLinkLines {
  const linkLines = new Map<number, string>();
  let frontmatterEndLine = 0;

  if (lines.length === 0 || lines[0]!.trim() !== "---") {
    return { linkLines, frontmatterEndLine: 0 };
  }

  let inFrontmatter = true;
  let currentKey: string | null = null;

  for (let i = 1; i < lines.length; i++) {
    const lineNum = i + 1; // 1-based line index
    const line = lines[i]!;

    if (line.trim() === "---") {
      frontmatterEndLine = lineNum;
      inFrontmatter = false;
      break;
    }

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    if (trimmed.startsWith("links:")) {
      currentKey = "links";
      linkLines.set(lineNum, "links");
      continue;
    }

    if (trimmed.startsWith("depends_on:")) {
      currentKey = "depends_on";
      linkLines.set(lineNum, "depends_on");
      continue;
    }

    if (trimmed.startsWith("supersedes:")) {
      currentKey = "supersedes";
      linkLines.set(lineNum, "supersedes");
      continue;
    }

    if (trimmed.startsWith("superseded_by:")) {
      currentKey = "superseded_by";
      linkLines.set(lineNum, "superseded_by");
      continue;
    }

    if (trimmed.startsWith("- ")) {
      if (currentKey) {
        linkLines.set(lineNum, currentKey);
      }
      continue;
    }

    if (/^[a-zA-Z0-9_-]+:/.test(trimmed)) {
      currentKey = null;
    }
  }

  return { linkLines, frontmatterEndLine };
}

/**
 * Discovers and classifies all citations of an artifact tag across the workspace ("Found In")
 * and extracts all declared outbound links ("Links To").
 *
 * Implements subtype-agnostic archival safety evaluation per RULE-31.
 */
export async function findArtifactReferences(
  tagOrIdentifier: string,
  options: FindArtifactReferencesOptions = {},
): Promise<ArtifactReferencesResult> {
  const cwd = options.cwd ?? process.cwd();
  const ignoredDirs = options.ignoredDirectories
    ? new Set(options.ignoredDirectories)
    : DEFAULT_IGNORED_DIRECTORIES;

  // 1. Resolve target artifact details
  const details = await getArtifactDetails(tagOrIdentifier, { cwd });
  const targetTag = details.tag.toUpperCase();
  const targetFilepath = resolve(cwd, details.filepath);

  // 2. Build "Links To" (outbound declared links and dependencies)
  const adrs: string[] = [];
  const rules: string[] = [];
  const tasks: string[] = [];
  const supersedes: string[] = [];
  let superseded_by: string | undefined;

  for (const link of details.links) {
    const upper = link.toUpperCase().trim();
    if (upper.startsWith("ADR-")) {
      adrs.push(upper);
    } else if (upper.startsWith("RULE-")) {
      rules.push(upper);
    } else if (upper.startsWith("TASK-")) {
      tasks.push(upper);
    }
  }

  if (details.depends_on) {
    for (const dep of details.depends_on) {
      const upper = dep.toUpperCase().trim();
      const normalized = upper.startsWith("TASK-") ? upper : `TASK-${upper}`;
      if (!tasks.includes(normalized)) {
        tasks.push(normalized);
      }
    }
  }

  function parseFrontmatterList(content: string, fieldName: string): string[] {
    const lines = content.split("\n");
    const items: string[] = [];
    let inField = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line === "---" && inField) break;

      if (line.startsWith(`${fieldName}:`)) {
        inField = true;
        const inline = line.slice(fieldName.length + 1).trim();
        if (inline.startsWith("[") && inline.endsWith("]")) {
          const parsed = inline
            .slice(1, -1)
            .split(",")
            .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
            .filter(Boolean);
          items.push(...parsed);
          inField = false;
        } else if (inline.length > 0) {
          items.push(inline.replace(/^['"]|['"]$/g, ""));
          inField = false;
        }
        continue;
      }

      if (inField) {
        if (line.startsWith("- ")) {
          const val = line
            .slice(2)
            .trim()
            .replace(/^['"]|['"]$/g, "");
          if (val) items.push(val);
        } else if (/^[a-zA-Z0-9_-]+:/.test(line)) {
          inField = false;
        }
      }
    }

    return items;
  }

  // Parse supersedes / superseded_by from raw content if present
  const supersedesItems = parseFrontmatterList(
    details.rawContent,
    "supersedes",
  );
  supersedes.push(...supersedesItems);

  const supersededByItems = parseFrontmatterList(
    details.rawContent,
    "superseded_by",
  );
  if (supersededByItems.length > 0) {
    superseded_by = supersededByItems[0];
  }

  const linksTo: ArtifactLinksTo = {
    adrs: Array.from(new Set(adrs)),
    rules: Array.from(new Set(rules)),
    tasks: Array.from(new Set(tasks)),
    supersedes: Array.from(new Set(supersedes)),
    superseded_by,
    total:
      Array.from(new Set(adrs)).length +
      Array.from(new Set(rules)).length +
      Array.from(new Set(tasks)).length +
      Array.from(new Set(supersedes)).length +
      (superseded_by ? 1 : 0),
  };

  // 3. Prepare regex matching target tag occurrences
  // Enforce boundary that is not preceded or followed by alphanumeric, hyphen, or underscore
  const tagRegex = new RegExp(
    `(?<![A-Za-z0-9_-])${escapeRegex(targetTag)}(?![A-Za-z0-9_-])`,
    "i",
  );

  // 4. Scan workspace and gather "Found In" occurrences
  const governanceLinks: FoundInItem[] = [];
  const governanceProse: FoundInItem[] = [];
  const code: FoundInItem[] = [];
  const tests: FoundInItem[] = [];
  const documentation: FoundInItem[] = [];

  const vcs = options.vcs ?? defaultVcsAdapter;

  // Cache parsed governance artifact frontmatter to avoid redundant file I/O
  const govArtifactCache = new Map<
    string,
    {
      parsedArtifact: NonNullable<ReturnType<typeof parseArtifactFilename>>;
      linkLines: Map<number, string>;
      frontmatterEndLine: number;
      isSupersedingSuccessor: boolean;
    } | null
  >();

  async function getGovArtifactData(fullPath: string, fileName: string) {
    if (govArtifactCache.has(fullPath)) {
      return govArtifactCache.get(fullPath)!;
    }
    const parsedArtifact = parseArtifactFilename(fileName);
    if (!parsedArtifact) {
      govArtifactCache.set(fullPath, null);
      return null;
    }
    let content = "";
    try {
      content = await readFile(fullPath, "utf8");
    } catch {
      govArtifactCache.set(fullPath, null);
      return null;
    }
    const lines = content.split("\n");
    const { linkLines, frontmatterEndLine } = parseFrontmatterLineMap(lines);
    const candidateSupersedes = parseFrontmatterList(content, "supersedes").map(
      (s) => s.toUpperCase(),
    );
    const isSupersedingSuccessor = candidateSupersedes.includes(targetTag);
    const data = {
      parsedArtifact,
      linkLines,
      frontmatterEndLine,
      isSupersedingSuccessor,
    };
    govArtifactCache.set(fullPath, data);
    return data;
  }

  function processGovernanceMatch(
    gov: NonNullable<Awaited<ReturnType<typeof getGovArtifactData>>>,
    fullPath: string,
    relPath: string,
    lineNum: number,
    rawLine: string,
  ) {
    if (!tagRegex.test(rawLine)) {
      return;
    }
    const snippet = rawLine.trim();
    if (lineNum <= gov.frontmatterEndLine && gov.linkLines.has(lineNum)) {
      const relationship = gov.linkLines.get(lineNum)!;
      const isArchived = gov.parsedArtifact.isArchived;
      const isBlocking =
        !isArchived &&
        relationship !== "supersedes" &&
        !gov.isSupersedingSuccessor;

      governanceLinks.push({
        type: "governance-link",
        filepath: fullPath,
        relativePath: relPath,
        line: lineNum,
        snippet,
        sourceTag: gov.parsedArtifact.tag,
        isArchived,
        isBlocking,
        relationship,
      });
    } else {
      governanceProse.push({
        type: "governance-prose",
        filepath: fullPath,
        relativePath: relPath,
        line: lineNum,
        snippet,
        sourceTag: gov.parsedArtifact.tag,
        isArchived: gov.parsedArtifact.isArchived,
        isBlocking: false,
      });
    }
  }

  function processNonGovernanceMatch(
    fullPath: string,
    relPath: string,
    fileName: string,
    ext: string,
    lineNum: number,
    rawLine: string,
  ) {
    if (!tagRegex.test(rawLine)) {
      return;
    }
    const isTest =
      TEST_FILE_REGEX.test(fileName) || fullPath.includes("/__tests__/");
    const isCode = CODE_EXTENSIONS.has(ext);
    const isDoc = DOC_EXTENSIONS.has(ext);

    const category: "test" | "code" | "documentation" = isTest
      ? "test"
      : isDoc
        ? "documentation"
        : isCode
          ? "code"
          : "code";

    if (
      category === "test" &&
      !isTestVerificationCitation(rawLine, targetTag)
    ) {
      return;
    }

    const item: FoundInItem = {
      type: category,
      filepath: fullPath,
      relativePath: relPath,
      line: lineNum,
      snippet: rawLine.trim(),
    };

    if (category === "test") {
      tests.push(item);
    } else if (category === "documentation") {
      documentation.push(item);
    } else {
      code.push(item);
    }
  }

  // Attempt git-native citation discovery via git grep / index query
  let matches: GitGrepMatch[] | null = null;
  const isGitRepo = await vcs.isInsideWorkTree(cwd).catch(() => false);

  if (isGitRepo) {
    matches = await vcs
      .grep(targetTag, cwd, {
        untracked: true,
        caseSensitive: false,
        fixedStrings: true,
        ignoredDirectories: Array.from(ignoredDirs),
      })
      .catch(() => null);
  }

  if (matches !== null) {
    // 4a. Process results from git-native index query (covers tracked and untracked files)
    for (const match of matches) {
      const relPath = match.relativePath;
      const fullPath = resolve(cwd, relPath);

      // Skip target artifact file itself
      if (fullPath === targetFilepath) {
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

      const govData = await getGovArtifactData(fullPath, fileName);
      if (govData) {
        processGovernanceMatch(
          govData,
          fullPath,
          relPath,
          match.line,
          match.snippet,
        );
      } else {
        processNonGovernanceMatch(
          fullPath,
          relPath,
          fileName,
          ext,
          match.line,
          match.snippet,
        );
      }
    }
  } else {
    // 4b. Fallback to recursive filesystem traversal for non-git workspaces or untracked directories
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
          if (resolve(fullPath) === targetFilepath) {
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
          const relPath = relative(cwd, fullPath);
          const govData = await getGovArtifactData(fullPath, entry.name);

          for (let i = 0; i < lines.length; i++) {
            const lineNum = i + 1;
            const line = lines[i]!;

            if (govData) {
              processGovernanceMatch(govData, fullPath, relPath, lineNum, line);
            } else {
              processNonGovernanceMatch(
                fullPath,
                relPath,
                entry.name,
                ext,
                lineNum,
                line,
              );
            }
          }
        }
      }
    }

    await walk(cwd);
  }

  const foundIn: ArtifactFoundIn = {
    governanceLinks,
    governanceProse,
    code,
    tests,
    documentation,
    total:
      governanceLinks.length +
      governanceProse.length +
      code.length +
      tests.length +
      documentation.length,
  };

  // 5. Evaluate archival guard (RULE-31)
  const blockingLinks = governanceLinks.filter((item) => item.isBlocking);
  const blockingReasons: string[] = blockingLinks.map((item) => {
    const tagDisplay = item.sourceTag ?? "Artifact";
    const rel = item.relationship ? ` (${item.relationship})` : "";
    return `Active artifact ${tagDisplay}${rel} maintains link to ${targetTag} at ${item.relativePath}:${item.line}`;
  });

  const archivalGuard: ArchivalGuardResult = {
    canArchive: blockingLinks.length === 0,
    blockingReasons,
    blockingCount: blockingLinks.length,
  };

  return {
    target: {
      tag: details.tag,
      subtype: details.subtype,
      id: details.id,
      slug: details.slug,
      filename: details.filename,
      filepath: details.filepath,
      relativePath: details.relativePath,
      scope: details.scope,
      isArchived: details.isArchived,
    },
    linksTo,
    foundIn,
    archivalGuard,
  };
}
