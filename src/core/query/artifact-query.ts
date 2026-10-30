/**
 * Single-artifact resolution and deep inspection domain service.
 * Implements ADR-1, ADR-2, ADR-6, RULE-1, RULE-21, RULE-25, RULE-26, and RULE-29.
 */

import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { resolveGoverningScope } from "../common/directories.ts";
import { parseArtifactFilename } from "../common/filename.ts";
import type { IndexableSubtype } from "../common/types.ts";
import { scanActiveArtifacts } from "../resolver/active-scanner.ts";
import {
  inspectGitDeletedArtifacts,
  inspectMultiBranchActiveArtifacts,
  listGitBranches,
} from "../resolver/git-inspector.ts";
import { parseAcceptanceCriteria } from "../task/checklist.ts";
import type { TaskAcceptanceCriteriaItem } from "../task/types.ts";
import {
  extractAdrSummary,
  parseFrontmatterFields,
  parseMarkdownSections,
  splitMarkdownFrontmatter,
} from "./markdown-parser.ts";
import type {
  ArtifactDetails,
  ResolveArtifactOptions,
  ResolvedArtifact,
} from "./types.ts";

export type {
  ArtifactDetails,
  ResolveArtifactOptions,
  ResolvedArtifact,
} from "./types.ts";

/**
 * Parses a raw tag string into its canonical subtype and ID components.
 * Examples: "RULE-29" -> { subtype: "RULE", id: "29", tag: "RULE-29" }
 *           "adr-6" -> { subtype: "ADR", id: "6", tag: "ADR-6" }
 *           "task-12" -> { subtype: "TASK", id: "12", tag: "TASK-12" }
 */
export function parseCanonicalTag(
  raw: string,
): { subtype: IndexableSubtype; id: string; tag: string } | null {
  const trimmed = raw.trim();
  const match = trimmed.match(
    /^(RULE|ADR|TASK)-([A-Za-z0-9]+(?:[-.][A-Za-z0-9]+)*)$/i,
  );
  if (!match || !match[1] || !match[2]) {
    return null;
  }
  const subtype = match[1].toUpperCase() as IndexableSubtype;
  const id = match[2];
  const tag = `${subtype}-${id}`;
  return { subtype, id, tag };
}

/**
 * Resolves the governing codebase directory scope relative to cwd (RULE-8, RULE-12).
 * Returns the directory containing the artifact's .modie container relative to workspace root.
 */
function computeArtifactScope(
  filepath: string,
  _subtype: IndexableSubtype,
  cwd: string,
): string {
  return resolveGoverningScope(filepath, cwd).relativeScope;
}

/**
 * Resolves an indexable artifact (RULE, ADR, or TASK) by its canonical tag,
 * filename, or filepath across the repository workspace.
 *
 * By default, strictly searches active (and archived) .md files on disk.
 * When `options.history` is true, also searches Git deletion history and branches (ADR-6).
 *
 * @throws Error if the artifact is not found or identifier is empty.
 */
export async function resolveArtifactByTag(
  tagOrIdentifier: string,
  options: ResolveArtifactOptions = {},
): Promise<ResolvedArtifact> {
  const cwd = options.cwd ?? process.cwd();
  const trimmed = tagOrIdentifier.trim();

  if (!trimmed) {
    throw new Error("Artifact identifier must not be empty.");
  }

  // 1. Direct path check (only if the file actually exists on disk)
  const candidatePath = isAbsolute(trimmed) ? trimmed : resolve(cwd, trimmed);
  const parsedFromPath = parseArtifactFilename(candidatePath);
  if (parsedFromPath) {
    try {
      const fileStat = await stat(candidatePath);
      if (fileStat.isFile()) {
        const rel = relative(cwd, candidatePath).replace(/\\/g, "/");
        const scope = computeArtifactScope(
          candidatePath,
          parsedFromPath.subtype,
          cwd,
        );
        let summary: string | undefined;
        if (parsedFromPath.subtype === "ADR") {
          try {
            const rawContent = await readFile(candidatePath, "utf8");
            summary = extractAdrSummary(rawContent, parsedFromPath.slug);
          } catch {
            summary = parsedFromPath.slug.replace(/-/g, " ");
          }
        }
        return {
          tag: parsedFromPath.tag,
          subtype: parsedFromPath.subtype,
          id: parsedFromPath.id,
          slug: parsedFromPath.slug,
          filename: parsedFromPath.filename,
          filepath: candidatePath,
          relativePath: rel,
          scope,
          isArchived: parsedFromPath.isArchived,
          ...(summary ? { summary } : {}),
        };
      }
    } catch {
      // Fall through to scanner if path does not exist on disk
    }
  }

  // 2. Parse canonical tag or raw ID
  const tagInfo = parseCanonicalTag(trimmed);
  const targetTag = tagInfo?.tag.toUpperCase();

  // 3. Scan workspace for active/archived indexable artifacts on disk
  const targetSubtype = tagInfo?.subtype ?? options.subtype;
  const artifacts = await scanActiveArtifacts(cwd, targetSubtype);

  // Match by canonical tag, filename, or slug
  let matches = artifacts.filter((a) => {
    if (targetTag) {
      return a.tag.toUpperCase() === targetTag;
    }
    return (
      a.filename.toLowerCase() === trimmed.toLowerCase() ||
      a.slug.toLowerCase() === trimmed.toLowerCase()
    );
  });

  if (matches.length > 0) {
    // Filter archived if requested (defaults to including archived)
    if (options.includeArchived === false) {
      const nonArchived = matches.filter((a) => !a.isArchived);
      if (nonArchived.length > 0) {
        matches = nonArchived;
      }
    }

    // If both active and archived exist for the same tag, prefer the active artifact
    const activeMatch = matches.find((a) => !a.isArchived);
    const selected = activeMatch ?? matches[0]!;

    const scope = computeArtifactScope(selected.filepath, selected.subtype, cwd);
    let summary: string | undefined;
    if (selected.subtype === "ADR") {
      try {
        const rawContent = await readFile(selected.filepath, "utf8");
        summary = extractAdrSummary(rawContent, selected.slug);
      } catch {
        summary = selected.slug.replace(/-/g, " ");
      }
    }
    return {
      tag: selected.tag,
      subtype: selected.subtype,
      id: selected.id,
      slug: selected.slug,
      filename: selected.filename,
      filepath: selected.filepath,
      relativePath: relative(cwd, selected.filepath).replace(/\\/g, "/"),
      scope,
      isArchived: selected.isArchived,
      ...(summary ? { summary } : {}),
    };
  }

  // 4. Explicit historical query fallback (--history) across Git deletion logs and branches
  if (options.history) {
    const [deletedArtifacts, branchArtifacts] = await Promise.all([
      inspectGitDeletedArtifacts(cwd, targetSubtype, options.vcs),
      inspectMultiBranchActiveArtifacts(
        cwd,
        targetSubtype,
        { excludeCurrent: true },
        options.vcs,
      ),
    ]);

    const historicalCandidates = [...branchArtifacts, ...deletedArtifacts];

    // Also include task branches `task/<id>-<slug>` if not already present in candidates
    if (!targetSubtype || targetSubtype === "TASK") {
      const branches = await listGitBranches(cwd, options.vcs);
      for (const b of branches) {
        const branchMatch = b.match(
          /^task\/(?:TASK-)?([A-Za-z0-9]+(?:-[0-9]+)*)-(.+)$/i,
        );
        if (branchMatch && branchMatch[1] && branchMatch[2]) {
          const bId = branchMatch[1];
          const bSlug = branchMatch[2];
          const bTag = `TASK-${bId}`;
          if (
            !historicalCandidates.some(
              (c) => c.tag.toUpperCase() === bTag.toUpperCase() && c.filepath,
            )
          ) {
            const bFilename = `${bSlug}.${bTag}.md`;
            historicalCandidates.push({
              id: bId,
              subtype: "TASK",
              tag: bTag,
              slug: bSlug,
              filename: bFilename,
              filepath: `.modie/tasks/${bFilename}`,
              isArchived: false,
              status: "deleted",
            });
          }
        }
      }
    }

    const histMatches = historicalCandidates.filter((a) => {
      if (targetTag) {
        return a.tag.toUpperCase() === targetTag;
      }
      return (
        (a.filename && a.filename.toLowerCase() === trimmed.toLowerCase()) ||
        (a.slug && a.slug.toLowerCase() === trimmed.toLowerCase())
      );
    });

    const withPath = histMatches.find((a) => Boolean(a.filepath));
    const selectedHist = withPath ?? histMatches[0];

    if (selectedHist) {
      const slug = selectedHist.slug || `task-${selectedHist.id.toLowerCase()}`;
      const filename =
        selectedHist.filename || `${slug}.${selectedHist.tag}.md`;
      const relPath = selectedHist.filepath
        ? isAbsolute(selectedHist.filepath)
          ? relative(cwd, selectedHist.filepath)
          : selectedHist.filepath
        : `.modie/${selectedHist.subtype.toLowerCase()}s/${filename}`;
      const absPath = isAbsolute(selectedHist.filepath)
        ? selectedHist.filepath
        : resolve(cwd, relPath);

      const scope = computeArtifactScope(absPath, selectedHist.subtype, cwd);
      return {
        tag: selectedHist.tag,
        subtype: selectedHist.subtype,
        id: selectedHist.id,
        slug,
        filename,
        filepath: absPath,
        relativePath: relPath.replace(/\\/g, "/"),
        scope,
        isArchived: selectedHist.isArchived,
        isHistorical: true,
      };
    }
  }

  const subtypeLabel = targetSubtype ? ` ${targetSubtype}` : "";
  throw new Error(
    `Artifact "${trimmed}" was not found across active or archived${subtypeLabel} artifacts on disk.`,
  );
}

/**
 * Loads, parses, and inspects an indexable artifact by canonical tag, filename, or path.
 * Returns detailed structured metadata, links, depends_on, and section contents.
 */
export async function getArtifactDetails(
  tagOrIdentifier: string,
  options: ResolveArtifactOptions = {},
): Promise<ArtifactDetails> {
  const resolved = await resolveArtifactByTag(tagOrIdentifier, options);
  const rawContent = await readFile(resolved.filepath, "utf8");

  const { frontmatter, body } = splitMarkdownFrontmatter(rawContent);
  const { links, depends_on, summary: fmSummary } =
    parseFrontmatterFields(frontmatter);
  const sections = parseMarkdownSections(body);

  const summary =
    resolved.subtype === "ADR"
      ? extractAdrSummary(rawContent, resolved.slug)
      : fmSummary;
  const context = sections["Context"];
  let acceptanceCriteria: TaskAcceptanceCriteriaItem[] | undefined;

  if (resolved.subtype === "TASK") {
    acceptanceCriteria = parseAcceptanceCriteria(body);
  }

  return {
    ...resolved,
    ...(summary ? { summary } : {}),
    links,
    depends_on,
    body,
    rawContent,
    context,
    sections,
    acceptanceCriteria,
  };
}
