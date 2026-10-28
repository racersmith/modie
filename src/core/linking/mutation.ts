/**
 * Core Frontmatter Link & Dependency Mutation Service.
 * Safely adds or removes links and dependencies in artifact YAML frontmatter blocks
 * while preserving Markdown bodies and unrelated frontmatter fields byte-for-byte.
 * Complies with ADR-5, RULE-7, RULE-13, RULE-14, RULE-15, RULE-16, RULE-17,
 * RULE-18, RULE-19, RULE-25, and RULE-36.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  parseCanonicalTag,
  resolveArtifactByTag,
} from "../query/artifact-query.ts";
import {
  parseFrontmatterFields,
  splitMarkdownFrontmatter,
} from "../query/markdown-parser.ts";
import type { ResolvedArtifact } from "../query/types.ts";
import type {
  ArtifactLinkRelationship,
  LinkMutationResult,
  MutateArtifactLinkOptions,
} from "./types.ts";
import { inferLinkRelationship, validateArtifactLink } from "./validator.ts";

/**
 * Pure helper that adds or removes `targetTag` in the specified frontmatter list
 * field (`links` or `depends_on`) within `rawContent`, preserving the Markdown
 * document body and unrelated frontmatter fields byte-for-byte (RULE-36).
 */
export function mutateFrontmatterListField(
  rawContent: string,
  field: ArtifactLinkRelationship,
  action: "add" | "remove",
  targetTag: string,
): { updatedContent: string; changed: boolean } {
  const canonicalTarget = targetTag.trim().toUpperCase();
  const isCrlf = rawContent.includes("\r\n");
  const newline = isCrlf ? "\r\n" : "\n";

  // Match an opening YAML frontmatter block at the start of the file
  const fmMatch = rawContent.match(
    /^---(?:\r?\n([\s\S]*?))?\r?\n---(\r?\n[\s\S]*|$)/,
  );

  // Case 1: No frontmatter block exists in the document
  if (!fmMatch) {
    if (action === "remove") {
      return { updatedContent: rawContent, changed: false };
    }
    const strippedLeading = rawContent.replace(/^(?:\r?\n)+/, "");
    const prefix = [
      "---",
      `${field}:`,
      `  - ${canonicalTarget}`,
      "---",
      "",
      "",
    ].join(newline);
    return {
      updatedContent: `${prefix}${strippedLeading}`,
      changed: true,
    };
  }

  const frontmatterInner = fmMatch[1] ?? "";
  const tailAfterClosingFence = fmMatch[2] ?? "";

  const lines = frontmatterInner.length > 0 ? frontmatterInner.split(/\r?\n/) : [];
  const keyRegex = new RegExp(`^(\\s*)${field}\\s*:(.*)$`);

  let keyLineIdx = -1;
  let inlineRemainder = "";

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(keyRegex);
    if (m) {
      keyLineIdx = i;
      inlineRemainder = (m[2] ?? "").trim();
      break;
    }
  }

  // Case 2: Frontmatter exists, but `field` key is not yet present
  if (keyLineIdx === -1) {
    if (action === "remove") {
      return { updatedContent: rawContent, changed: false };
    }
    const newFieldLines = [`${field}:`, `  - ${canonicalTarget}`];
    const updatedLines =
      lines.length > 0 ? [...lines, ...newFieldLines] : newFieldLines;
    const updatedContent = `---${newline}${updatedLines.join(newline)}${newline}---${tailAfterClosingFence}`;
    return {
      updatedContent,
      changed: true,
    };
  }

  // Case 3: `field` key exists in frontmatter; find the span of lines belonging to this key
  let blockEndIdx = keyLineIdx + 1;
  const currentItems: string[] = [];

  if (inlineRemainder.startsWith("[") && inlineRemainder.endsWith("]")) {
    const inner = inlineRemainder.slice(1, -1).trim();
    if (inner.length > 0) {
      const parsedInline = inner
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
      currentItems.push(...parsedInline);
    }
  } else {
    while (blockEndIdx < lines.length) {
      const line = lines[blockEndIdx]!;
      const trimmed = line.trim();

      if (trimmed.startsWith("- ") || trimmed === "-") {
        const val = trimmed
          .slice(1)
          .trim()
          .replace(/^['"]|['"]$/g, "");
        if (val) {
          currentItems.push(val);
        }
        blockEndIdx++;
        continue;
      }

      // Stop if we hit another YAML key
      if (/^[A-Za-z0-9_-]+\s*:/.test(trimmed)) {
        break;
      }

      // Blank or comment line: only consume if followed by more list items of the same key
      let hasFollowingListItem = false;
      for (let lookahead = blockEndIdx + 1; lookahead < lines.length; lookahead++) {
        const laTrimmed = lines[lookahead]!.trim();
        if (laTrimmed === "" || laTrimmed.startsWith("#")) {
          continue;
        }
        if (laTrimmed.startsWith("- ") || laTrimmed === "-") {
          hasFollowingListItem = true;
        }
        break;
      }

      if (hasFollowingListItem) {
        blockEndIdx++;
      } else {
        break;
      }
    }
  }

  const alreadyPresent = currentItems.some(
    (item) => item.toUpperCase() === canonicalTarget,
  );

  if (action === "add") {
    if (alreadyPresent) {
      return { updatedContent: rawContent, changed: false };
    }
    const nextItems = [...currentItems, canonicalTarget];
    const replacementLines = [
      `${field}:`,
      ...nextItems.map((item) => `  - ${item}`),
    ];
    const updatedLines = [
      ...lines.slice(0, keyLineIdx),
      ...replacementLines,
      ...lines.slice(blockEndIdx),
    ];
    const updatedContent = `---${newline}${updatedLines.join(newline)}${newline}---${tailAfterClosingFence}`;
    return {
      updatedContent,
      changed: true,
    };
  }

  // action === "remove"
  if (!alreadyPresent) {
    return { updatedContent: rawContent, changed: false };
  }

  const nextItems = currentItems.filter(
    (item) => item.toUpperCase() !== canonicalTarget,
  );
  const replacementLines =
    nextItems.length > 0
      ? [`${field}:`, ...nextItems.map((item) => `  - ${item}`)]
      : [`${field}: []`];

  const updatedLines = [
    ...lines.slice(0, keyLineIdx),
    ...replacementLines,
    ...lines.slice(blockEndIdx),
  ];
  const updatedContent = `---${newline}${updatedLines.join(newline)}${newline}---${tailAfterClosingFence}`;
  return {
    updatedContent,
    changed: true,
  };
}

/**
 * Validates and adds a frontmatter link or dependency from `options.source` to `options.target`.
 * Enforces all subtype, spatial scope, and DAG acyclicity invariants prior to writing to disk.
 * Complies with ADR-5, RULE-7, RULE-13, RULE-14, RULE-15, RULE-16, RULE-17, RULE-18, RULE-19, and RULE-36.
 */
export async function linkArtifact(
  options: MutateArtifactLinkOptions,
): Promise<LinkMutationResult> {
  const cwd = resolve(options.cwd ?? process.cwd());

  const validated = await validateArtifactLink(
    options.source,
    options.target,
    {
      cwd,
      relationship: options.relationship,
    },
  );

  const { source, target, relationship } = validated;
  const rawContent = await readFile(source.filepath, "utf8");

  const { updatedContent, changed } = mutateFrontmatterListField(
    rawContent,
    relationship,
    "add",
    target.tag,
  );

  if (changed) {
    await writeFile(source.filepath, updatedContent, "utf8");
  }

  const { frontmatter } = splitMarkdownFrontmatter(updatedContent);
  const parsed = parseFrontmatterFields(frontmatter);

  return {
    action: "link",
    relationship,
    changed,
    source,
    target,
    links: parsed.links,
    depends_on:
      source.subtype === "TASK" || parsed.depends_on !== undefined
        ? (parsed.depends_on ?? [])
        : undefined,
    filepath: source.filepath,
    relativePath: source.relativePath,
  };
}

/**
 * Removes a frontmatter link or dependency from `options.source` to `options.target`.
 * Preserves the Markdown body and unrelated frontmatter fields byte-for-byte.
 * Complies with ADR-5 and RULE-36.
 */
export async function unlinkArtifact(
  options: MutateArtifactLinkOptions,
): Promise<LinkMutationResult> {
  const cwd = resolve(options.cwd ?? process.cwd());

  const source = await resolveArtifactByTag(options.source, { cwd });

  let target: ResolvedArtifact;
  try {
    target = await resolveArtifactByTag(options.target, { cwd });
  } catch (err) {
    // Allow unlinking a canonical tag even if the target file was removed from disk
    const parsedTag = parseCanonicalTag(options.target);
    if (!parsedTag) {
      throw err;
    }
    target = {
      tag: parsedTag.tag,
      subtype: parsedTag.subtype,
      id: parsedTag.id,
      slug: parsedTag.tag.toLowerCase(),
      filename: `${parsedTag.tag.toLowerCase()}.${parsedTag.tag}.md`,
      filepath: "",
      relativePath: "",
      isArchived: false,
    };
  }

  const relationship: ArtifactLinkRelationship =
    options.relationship ?? inferLinkRelationship(source.subtype, target.subtype);

  if (relationship !== "links" && relationship !== "depends_on") {
    throw new Error(
      `Invalid relationship type "${String(relationship)}": expected "links" or "depends_on" (ADR-5, RULE-36).`,
    );
  }

  const rawContent = await readFile(source.filepath, "utf8");

  const { updatedContent, changed } = mutateFrontmatterListField(
    rawContent,
    relationship,
    "remove",
    target.tag,
  );

  if (changed) {
    await writeFile(source.filepath, updatedContent, "utf8");
  }

  const { frontmatter } = splitMarkdownFrontmatter(updatedContent);
  const parsed = parseFrontmatterFields(frontmatter);

  return {
    action: "unlink",
    relationship,
    changed,
    source,
    target,
    links: parsed.links,
    depends_on:
      source.subtype === "TASK" || parsed.depends_on !== undefined
        ? (parsed.depends_on ?? [])
        : undefined,
    filepath: source.filepath,
    relativePath: source.relativePath,
  };
}
