/**
 * Shared Frontmatter-to-Markdown Presentation Engine.
 * Converts on-disk YAML frontmatter into a semantic Appendix for read_artifact,
 * and composes pure Markdown Mission Briefs for task_context and start_task.
 * Implements RULE-6, RULE-25, and RULE-26.
 */

import { dirname } from "node:path";
import {
  collectAncestralMotives,
  getArtifactDetails,
  resolveGoverningScope,
  slugToTitle,
  type ArtifactDetails,
  type ArtifactReferencesResult,
  type TaskAcceptanceCriteriaItem,
  type TaskQueueItem,
  type TaskStatusDetails,
} from "../../core/index.ts";

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
 * Extracts a concise single-line summary from a GIST file or directory content.
 */
export function extractGistSummary(rawContent: string): string {
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

// ============================================================================
// Frontmatter Field Renderers
// ============================================================================

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

  // Prioritize governance links
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

  // Include governance prose citations
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

// ============================================================================
// Document Presentation Renderers
// ============================================================================

/**
 * Renders an indexable artifact into clean, unescaped Markdown with file location comments
 * and a semantic `## Appendix: Relationships & Governance` section.
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

  const parts: string[] = [
    `<!-- File: ${details.relativePath} -->`,
    `<!-- Scope: ${details.scope} -->`,
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

/**
 * Renders a task into a high-signal Markdown Mission Brief.
 * Elevated blast radius constraint (RULE-6), numbered checklist, and governing invariants.
 */
export async function renderTaskMissionBrief(
  taskDetails: TaskStatusDetails | TaskQueueItem,
  activeBranch?: string | null,
  cwd: string = process.cwd(),
): Promise<string> {
  const taskTag =
    taskDetails.fullTaskId ||
    (taskDetails.id.startsWith("TASK-")
      ? taskDetails.id
      : `TASK-${taskDetails.id}`);

  // Resolve scope directory
  let scope = ".";
  if (taskDetails.filepath) {
    try {
      scope = resolveGoverningScope(taskDetails.filepath, cwd).relativeScope;
    } catch {
      scope = dirname(taskDetails.relativePath).replace(/\/\.modie\/tasks$/, "") || ".";
    }
  }

  const branchName =
    activeBranch ??
    taskDetails.branch ??
    `task/${taskDetails.id}-${taskDetails.slug}`;

  const criteriaTotal =
    taskDetails.criteriaTotal ??
    taskDetails.acceptanceCriteria?.length ??
    0;
  const criteriaCompleted =
    taskDetails.criteriaCompleted ??
    taskDetails.acceptanceCriteria?.filter((c) => c.completed).length ??
    0;
  const progressText = `${criteriaCompleted}/${criteriaTotal} criteria satisfied`;

  const blastRadiusAlert =
    scope === "." || scope === ""
      ? "All modifications, new files, and tests must reside strictly within the workspace root or its subdirectories."
      : `All modifications, new files, and tests must reside strictly within \`${scope}/\` or its subdirectories. Never edit files in sibling or ancestor directories.`;

  const parts: string[] = [
    `# Mission Brief: ${taskTag}`,
    "",
    `**Title**: ${taskDetails.title}  `,
    `**Active Branch**: \`${branchName}\`  `,
    `**Scope**: \`${scope}\` | **Progress**: ${progressText}  `,
    "",
    "> **BLAST RADIUS CONSTRAINT (RULE-6)**  ",
    `> ${blastRadiusAlert}`,
  ];

  // Context section if present
  if (taskDetails.context && taskDetails.context.trim().length > 0) {
    parts.push("", "---", "", "## Context", "", taskDetails.context.trim());
  }

  // Acceptance Criteria Checklist (1-based numbered items)
  parts.push("", "---", "", "## Acceptance Criteria", "");
  const criteria: TaskAcceptanceCriteriaItem[] =
    taskDetails.acceptanceCriteria && taskDetails.acceptanceCriteria.length > 0
      ? taskDetails.acceptanceCriteria
      : [{ text: "Complete task requirements", completed: false }];

  for (let i = 0; i < criteria.length; i++) {
    const item = criteria[i]!;
    const mark = item.completed ? "x" : " ";
    parts.push(`- [${mark}] ${i + 1}. ${item.text}`);
  }

  // Governing Architectural Invariants
  if (taskDetails.links && taskDetails.links.length > 0) {
    const resolvedLinks = await Promise.all(
      taskDetails.links.map((tag) => resolveArtifactSummary(tag, cwd)),
    );
    parts.push(
      "",
      "---",
      "",
      "## Governing Architectural Invariants",
      "Modifications under this task must strictly adhere to the following rules:",
    );
    for (const rule of resolvedLinks) {
      const slugPart = rule.slug ? ` (\`${rule.slug}\`)` : "";
      parts.push(`- **${rule.tag}**${slugPart}: ${rule.invariantOrSummary}`);
    }
  }

  // Prerequisites & Dependencies
  if (taskDetails.depends_on && taskDetails.depends_on.length > 0) {
    const resolvedDeps = await Promise.all(
      taskDetails.depends_on.map((tag) => resolveArtifactSummary(tag, cwd)),
    );
    parts.push("", "---", "", "## Prerequisites & Dependencies");
    for (const dep of resolvedDeps) {
      parts.push(`- **${dep.tag}**: ${dep.invariantOrSummary}`);
    }
  }

  // Motives (Architectural Intent)
  try {
    const motives = await collectAncestralMotives(scope, cwd);
    if (motives.length > 0) {
      parts.push("", "---", "", "## Architectural Intent (Motives)");
      for (const m of motives) {
        const summary = extractMotiveSummary(m.content);
        parts.push(`- **\`${m.scope}\`**: ${summary}`);
      }
    }
  } catch {
    // If motives fail to load, omit section gracefully
  }

  return parts.join("\n") + "\n";
}

/**
 * Renders an augmented directory listing into clean plaintext tab-separated format
 * (<file|dir/>\t<gist>\n) per Unix ls -F conventions.
 */
export function renderDirectoryListing(
  dirPath: string,
  entries: Array<{ name: string; isDirectory: boolean; gist?: string | null }>,
): string {
  const normDir =
    dirPath === "" || dirPath === "." ? "." : dirPath.replace(/\/+$/, "");
  const lines: string[] = [`${normDir}:`];

  for (const entry of entries) {
    const entryName = entry.isDirectory ? `${entry.name}/` : entry.name;
    const gist = entry.gist ? entry.gist.trim() : "";
    lines.push(gist ? `${entryName}\t${gist}` : `${entryName}\t`);
  }

  return lines.join("\n") + "\n";
}
