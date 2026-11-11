/**
 * Pure citation classification and rule verification disambiguation engine.
 * Implements ADR-4, ADR-5, ADR-7, RULE-23, RULE-25, and RULE-31.
 */

import { readFile } from "node:fs/promises";
import { basename, extname, isAbsolute, resolve } from "node:path";
import { escapeRegex, parseArtifactFilename } from "../../domain/index.ts";
import {
  parseFrontmatterFields,
  parseFrontmatterLineMap,
  splitMarkdownFrontmatter,
} from "../../platform/markdown/index.ts";
import { createTagRegex, type CitationMatch } from "./citation-source.ts";
import type { FoundInItem } from "./types.ts";

export const TEST_FILE_REGEX = /\.(test|spec)\.[a-zA-Z0-9]+$/;

export const DOC_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".rst"]);

/**
 * Parsed governance artifact details cached during citation classification.
 */
export interface GovernanceArtifactData {
  parsedArtifact: NonNullable<ReturnType<typeof parseArtifactFilename>>;
  linkLines: Map<number, string>;
  frontmatterEndLine: number;
  isSupersedingSuccessor: boolean;
}

/**
 * In-memory cache mapping full file paths or relative paths to parsed governance data.
 */
export type GovernanceArtifactCache = Map<
  string,
  GovernanceArtifactData | null
>;

/**
 * Loads and caches governance artifact frontmatter structure and supersession relationship.
 */
export async function getGovernanceArtifactData(
  fullPath: string,
  fileName: string,
  targetTag: string,
  cache: GovernanceArtifactCache,
): Promise<GovernanceArtifactData | null> {
  if (cache.has(fullPath)) {
    return cache.get(fullPath)!;
  }

  const parsedArtifact = parseArtifactFilename(fileName);
  if (!parsedArtifact) {
    cache.set(fullPath, null);
    return null;
  }

  let content = "";
  try {
    content = await readFile(fullPath, "utf8");
  } catch {
    cache.set(fullPath, null);
    return null;
  }

  const lines = content.split("\n");
  const { linkLines, frontmatterEndLine } = parseFrontmatterLineMap(lines);
  const { frontmatter } = splitMarkdownFrontmatter(content);
  const { supersedes: candidateSupersedesRaw = [] } =
    parseFrontmatterFields(frontmatter);
  const candidateSupersedes = candidateSupersedesRaw.map((s) =>
    s.toUpperCase(),
  );
  const isSupersedingSuccessor = candidateSupersedes.includes(
    targetTag.toUpperCase(),
  );

  const data: GovernanceArtifactData = {
    parsedArtifact,
    linkLines,
    frontmatterEndLine,
    isSupersedingSuccessor,
  };

  cache.set(fullPath, data);
  return data;
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
 * Pure function that classifies a single citation match into its categorical FoundInItem
 * or returns null if the citation is non-matching or an unverified test fixture occurrence.
 */
export function classifyCitation(
  match: CitationMatch,
  targetTag: string,
  cache: GovernanceArtifactCache = new Map(),
): FoundInItem | null {
  const tagRegex = createTagRegex(targetTag);
  if (!tagRegex.test(match.snippet)) {
    return null;
  }

  const relPath = match.relPath;
  const fullPath =
    match.filepath ?? (isAbsolute(relPath) ? relPath : resolve(relPath));
  const fileName = basename(relPath);
  const ext = extname(fileName).toLowerCase();

  const gov =
    cache.get(fullPath) ?? cache.get(relPath) ?? cache.get(fileName) ?? null;

  if (gov) {
    const snippet = match.snippet.trim();
    if (match.line <= gov.frontmatterEndLine && gov.linkLines.has(match.line)) {
      const relationship = gov.linkLines.get(match.line)!;
      const isArchived = gov.parsedArtifact.isArchived;
      const isBlocking =
        !isArchived &&
        relationship !== "supersedes" &&
        !gov.isSupersedingSuccessor;

      return {
        type: "governance-link",
        filepath: fullPath,
        relativePath: relPath,
        line: match.line,
        snippet,
        sourceTag: gov.parsedArtifact.tag,
        isArchived,
        isBlocking,
        relationship,
      };
    }

    return {
      type: "governance-prose",
      filepath: fullPath,
      relativePath: relPath,
      line: match.line,
      snippet,
      sourceTag: gov.parsedArtifact.tag,
      isArchived: gov.parsedArtifact.isArchived,
      isBlocking: false,
    };
  }

  const isTest =
    TEST_FILE_REGEX.test(fileName) ||
    relPath.includes("/__tests__/") ||
    fullPath.includes("/__tests__/");
  const isDoc = DOC_EXTENSIONS.has(ext);

  const category: "test" | "code" | "documentation" = isTest
    ? "test"
    : isDoc
      ? "documentation"
      : "code";

  if (
    category === "test" &&
    !isTestVerificationCitation(match.snippet, targetTag)
  ) {
    return null;
  }

  return {
    type: category,
    filepath: fullPath,
    relativePath: relPath,
    line: match.line,
    snippet: match.snippet.trim(),
  };
}
