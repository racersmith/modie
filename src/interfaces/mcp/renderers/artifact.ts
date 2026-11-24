/**
 * Artifact Markdown and Frontmatter Appendix Rendering Engine.
 * Implements RULE-25 and RULE-26.
 */

import {
  getArtifactDetails,
  slugToTitle,
  type ArtifactDetails,
  type ArtifactReferencesResult,
} from "../../../core/index.ts";

export interface ArtifactRenderContext {
  cwd: string;
  subtype?: string;
  tag?: string;
}

export interface ResolvedArtifactSummary {
  tag: string;
  slug: string;
  title: string;
  invariantOrSummary: string;
}

/**
 * Resolves an artifact tag into its display metadata (title, slug, invariant or summary).
 */
export async function resolveArtifactSummary(
  tag: string,
  cwd: string,
): Promise<ResolvedArtifactSummary> {
  try {
    const details = await getArtifactDetails(tag, { cwd });
    const slug = details.slug || "";
    const title = slugToTitle(slug);

    let invariantOrSummary = "";
    if (details.subtype === "RULE") {
      invariantOrSummary =
        details.body.trim().split("\n\n")[0]?.trim() || title;
    } else if (details.subtype === "ADR") {
      invariantOrSummary = details.summary || title;
    } else {
      invariantOrSummary = details.title || title;
    }

    return {
      tag: details.tag,
      slug,
      title,
      invariantOrSummary,
    };
  } catch {
    return {
      tag,
      slug: "",
      title: tag,
      invariantOrSummary: tag,
    };
  }
}

/**
 * Extracts a concise summary from MOTIVE markdown content.
 */
export function extractMotiveSummary(rawContent: string): string {
  const lines = rawContent
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line.startsWith("#")) continue;
    return line;
  }
  return lines[0]?.replace(/^#+\s*/, "") ?? "";
}

/**
 * Renders `depends_on` frontmatter into a Markdown section.
 */
export async function renderDependsOnSection(
  dependsOn: string[] | undefined,
  context: ArtifactRenderContext,
): Promise<string | null> {
  if (!dependsOn || dependsOn.length === 0) {
    return null;
  }

  const lines = [
    "### Prerequisites & Dependencies",
    "This task depends on the completed deliverables of the following tasks:",
  ];

  for (const tag of dependsOn) {
    const resolved = await resolveArtifactSummary(tag, context.cwd);
    lines.push(`- **${resolved.tag}**: ${resolved.invariantOrSummary}`);
  }

  return lines.join("\n");
}

/**
 * Subtype-aware renderer for `links` frontmatter.
 */
export async function renderLinksSection(
  links: string[] | undefined,
  context: ArtifactRenderContext,
): Promise<string | null> {
  if (!links || links.length === 0) {
    return null;
  }

  const resolvedItems = await Promise.all(
    links.map((tag) => resolveArtifactSummary(tag, context.cwd)),
  );

  if (context.subtype === "RULE") {
    const lines = [
      "### Architectural Justification",
      "This rule is justified by the following architectural decisions:",
    ];
    for (const item of resolvedItems) {
      lines.push(`- **${item.tag}**: ${item.invariantOrSummary}`);
    }
    return lines.join("\n");
  }

  if (context.subtype === "TASK") {
    const lines = [
      "### Governing Rules & Constraints",
      "Modifications under this task must strictly adhere to the following architectural rules:",
    ];
    for (const item of resolvedItems) {
      const slugPart = item.slug ? ` (\`${item.slug}\`)` : "";
      lines.push(`- **${item.tag}**${slugPart}: ${item.invariantOrSummary}`);
    }
    return lines.join("\n");
  }

  if (context.subtype === "ADR") {
    const lines = [
      "### Governed Rules & Related Decisions",
      "This decision governs or relates to the following artifacts:",
    ];
    for (const item of resolvedItems) {
      lines.push(`- **${item.tag}**: ${item.invariantOrSummary}`);
    }
    return lines.join("\n");
  }

  const lines = ["### Related Governance Artifacts"];
  for (const item of resolvedItems) {
    lines.push(`- **${item.tag}**: ${item.invariantOrSummary}`);
  }
  return lines.join("\n");
}

/**
 * Renders `supersedes` frontmatter into a Markdown section.
 */
export async function renderSupersedesSection(
  supersedes: string[] | undefined,
  context: ArtifactRenderContext,
): Promise<string | null> {
  if (!supersedes || supersedes.length === 0) {
    return null;
  }

  const lines = [
    "### Evolutionary Lineage",
    "This artifact supersedes the following predecessor artifacts:",
  ];

  for (const tag of supersedes) {
    const resolved = await resolveArtifactSummary(tag, context.cwd);
    lines.push(`- **${resolved.tag}**: ${resolved.invariantOrSummary}`);
  }

  return lines.join("\n");
}

/**
 * Renders `superseded_by` frontmatter into a Markdown section.
 */
export async function renderSupersededBySection(
  supersededBy: string[] | undefined,
  context: ArtifactRenderContext,
): Promise<string | null> {
  if (!supersededBy || supersededBy.length === 0) {
    return null;
  }

  const lines = [
    "### Successor Lineage",
    "This artifact is superseded by the following successor artifacts:",
  ];

  for (const tag of supersededBy) {
    const resolved = await resolveArtifactSummary(tag, context.cwd);
    lines.push(`- **${resolved.tag}**: ${resolved.invariantOrSummary}`);
  }

  return lines.join("\n");
}

/**
 * Renders inbound cross-references into an `Inbound Citations` Markdown section.
 */
export function renderReferencedBySection(
  references: ArtifactReferencesResult | null | undefined,
  _context: ArtifactRenderContext,
): string | null {
  if (!references) {
    return null;
  }

  const citationLines: string[] = [];
  const seen = new Set<string>();

  if (references.foundIn?.governanceLinks) {
    for (const ref of references.foundIn.governanceLinks) {
      const key = `${ref.sourceTag ?? ref.relativePath}:${ref.line}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (ref.sourceTag) {
        citationLines.push(
          `- **${ref.sourceTag}** (line ${ref.line} in \`${ref.relativePath}\`)`,
        );
      } else {
        citationLines.push(`- \`${ref.relativePath}\` (line ${ref.line})`);
      }
    }
  }

  if (references.foundIn?.governanceProse) {
    for (const ref of references.foundIn.governanceProse) {
      const key = `${ref.sourceTag ?? ref.relativePath}:${ref.line}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (ref.sourceTag) {
        citationLines.push(
          `- **${ref.sourceTag}** (prose citation at line ${ref.line} in \`${ref.relativePath}\`)`,
        );
      } else {
        citationLines.push(`- \`${ref.relativePath}\` (line ${ref.line})`);
      }
    }
  }

  if (citationLines.length === 0) {
    return null;
  }

  return [
    "### Inbound Citations",
    "This artifact is cited by:",
    ...citationLines,
  ].join("\n");
}

/**
 * Formats a scope directory with a canonical trailing slash (e.g. "src/" or "./").
 */
export function formatScopeDir(scope?: string | null): string {
  if (!scope || scope === "." || scope === "") {
    return "./";
  }
  const clean = scope
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+$/, "");
  return clean ? `${clean}/` : "./";
}

/**
 * Resolves an artifact's human title in clean Title Case from title or slug.
 */
export function resolveArtifactDisplayTitle(details: ArtifactDetails): string {
  const candidate = details.title?.trim() || details.slug;
  if (!candidate) return details.tag;

  return candidate
    .replace(/-/g, " ")
    .split(/\s+/)
    .map((w: string) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : ""))
    .join(" ")
    .trim();
}

/**
 * Renders an indexable artifact into clean, unescaped Markdown with tag, title,
 * and scope directory header, followed by a semantic `## Appendix: Relationships & Governance` section.
 */
export async function renderArtifactMarkdown(
  details: ArtifactDetails,
  references?: ArtifactReferencesResult | null,
  cwd: string = process.cwd(),
): Promise<string> {
  const context: ArtifactRenderContext = {
    cwd,
    subtype: details.subtype,
    tag: details.tag,
  };

  const sections: string[] = [];

  const dependsOnSection = await renderDependsOnSection(
    details.depends_on,
    context,
  );
  if (dependsOnSection) sections.push(dependsOnSection);

  const linksSection = await renderLinksSection(details.links, context);
  if (linksSection) sections.push(linksSection);

  const supersedesSection = await renderSupersedesSection(
    details.supersedes,
    context,
  );
  if (supersedesSection) sections.push(supersedesSection);

  const supersededBySection = await renderSupersededBySection(
    details.superseded_by,
    context,
  );
  if (supersededBySection) sections.push(supersededBySection);

  const refSection = renderReferencedBySection(references, context);
  if (refSection) sections.push(refSection);

  const title = resolveArtifactDisplayTitle(details);
  const scopeDir = formatScopeDir(details.scope);

  const parts: string[] = [
    `# ${details.tag}: ${title}`,
    `**Scope**: \`${scopeDir}\``,
    "",
    details.body.trim(),
  ];

  if (sections.length > 0) {
    parts.push(
      "",
      "---",
      "",
      "## Appendix: Relationships & Governance",
      "",
      sections.join("\n\n"),
    );
  }

  return parts.join("\n");
}
