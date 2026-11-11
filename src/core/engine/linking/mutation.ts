/**
 * Core Frontmatter Link & Dependency Mutation Service.
 * Safely adds or removes links and dependencies in artifact YAML frontmatter blocks
 * while preserving Markdown bodies and unrelated frontmatter fields byte-for-byte.
 * Complies with RULE-7, RULE-13, RULE-14, RULE-15, RULE-16, and RULE-17
 * RULE-18, RULE-19, RULE-25, and RULE-36.
 */

import { readFile, writeFile } from "node:fs/promises";
import YAML from "yaml";
import {
  parseCanonicalTag,
  type ArtifactLinkRelationship,
  type FrontmatterListField,
} from "../../domain/index.ts";
import { resolveWorkspaceContext } from "../context/index.ts";
import { resolveArtifactByTag } from "../query/artifact-query.ts";
import {
  parseFrontmatterFields,
  splitMarkdownFrontmatter,
} from "../../platform/markdown/index.ts";
import type { ResolvedArtifact } from "../query/types.ts";
import type {
  LinkMutationResult,
  MutateArtifactLinkOptions,
} from "./types.ts";
import { inferLinkRelationship, validateArtifactLink } from "./validator.ts";

/**
 * Pure helper that adds or removes `targetTag` in the specified frontmatter list
 * field (`links`, `depends_on`, `supersedes`, or `superseded_by`) within `rawContent`,
 * updating frontmatter canonically while preserving the Markdown document body untouched (RULE-36).
 */
export function mutateFrontmatterListField(
  rawContent: string,
  field: FrontmatterListField,
  action: "add" | "remove",
  targetTag: string,
): { updatedContent: string; changed: boolean } {
  const canonicalTarget = targetTag.trim().toUpperCase();
  const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n[\s\S]*|$)/);

  if (!match) {
    if (action === "remove")
      return { updatedContent: rawContent, changed: false };
    const body = rawContent.replace(/^(?:\r?\n)+/, "");
    return {
      updatedContent: `---\n${field}:\n  - ${canonicalTarget}\n---\n\n${body}`,
      changed: true,
    };
  }

  const frontmatter = match[1] ?? "";
  const body = match[2] ?? "";
  let data: Record<string, any>;
  try {
    data = (YAML.parse(frontmatter) ?? {}) as Record<string, any>;
  } catch {
    data = {};
  }

  const items: string[] = Array.isArray(data[field])
    ? data[field].map(String)
    : data[field]
      ? [String(data[field])]
      : [];

  const exists = items.some((item) => item.toUpperCase() === canonicalTarget);

  if (action === "add") {
    if (exists) return { updatedContent: rawContent, changed: false };
    data[field] = [...items, canonicalTarget];
  } else {
    if (!exists) return { updatedContent: rawContent, changed: false };
    data[field] = items.filter(
      (item) => item.toUpperCase() !== canonicalTarget,
    );
  }

  const updatedFrontmatter = YAML.stringify(data, null, 2).trim();
  return {
    updatedContent: `---\n${updatedFrontmatter}\n---${body}`,
    changed: true,
  };
}

/**
 * Applies a frontmatter link/unlink mutation on `source`, updates disk if changed,
 * and shapes the standard `LinkMutationResult` response payload.
 * Eliminates structural duplication across `linkArtifact` and `unlinkArtifact`.
 */
export async function applyLinkMutation(
  source: ResolvedArtifact,
  target: ResolvedArtifact,
  relationship: ArtifactLinkRelationship,
  action: "link" | "unlink",
): Promise<LinkMutationResult> {
  const mutationAction = action === "link" ? "add" : "remove";
  const rawContent = await readFile(source.filepath, "utf8");

  const { updatedContent, changed } = mutateFrontmatterListField(
    rawContent,
    relationship,
    mutationAction,
    target.tag,
  );

  if (changed) {
    await writeFile(source.filepath, updatedContent, "utf8");
  }

  const { frontmatter } = splitMarkdownFrontmatter(updatedContent);
  const parsed = parseFrontmatterFields(frontmatter);

  return {
    action,
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
 * Validates and adds a frontmatter link or dependency from `options.source` to `options.target`.
 * Enforces all subtype, spatial scope, and DAG acyclicity invariants prior to writing to disk.
 * Complies with RULE-7, RULE-13, RULE-14, RULE-15, RULE-16, RULE-17, RULE-18, RULE-19, and RULE-36.
 */
export async function linkArtifact(
  options: MutateArtifactLinkOptions,
): Promise<LinkMutationResult> {
  const ctx = resolveWorkspaceContext(options);
  const cwd = ctx.root;

  const validated = await validateArtifactLink(options.source, options.target, {
    cwd,
    relationship: options.relationship,
  });

  return applyLinkMutation(
    validated.source,
    validated.target,
    validated.relationship,
    "link",
  );
}

/**
 * Removes a frontmatter link or dependency from `options.source` to `options.target`.
 * Preserves the Markdown body and unrelated frontmatter fields byte-for-byte.
 * Complies with RULE-36.
 */
export async function unlinkArtifact(
  options: MutateArtifactLinkOptions,
): Promise<LinkMutationResult> {
  const ctx = resolveWorkspaceContext(options);
  const cwd = ctx.root;

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
      scope: ".",
      isArchived: false,
    };
  }

  const relationship: ArtifactLinkRelationship =
    options.relationship ??
    inferLinkRelationship(source.subtype, target.subtype);

  if (relationship !== "links" && relationship !== "depends_on") {
    throw new Error(
      `Invalid relationship type "${String(relationship)}": expected "links" or "depends_on" (ADR-5, RULE-36).`,
    );
  }

  return applyLinkMutation(source, target, relationship, "unlink");
}
