/**
 * Unified Architectural Context Compilation Service.
 * Synthesizes upward ancestral motives (RULE-2), active governing rules (RULE-9, RULE-12),
 * progressive-disclosure ADR summaries (ADR-8, RULE-26), task-scoped metadata and blast radius (RULE-6),
 * local directory/file GISTs (RULE-9, RULE-20), and shallow downward child signposts (ADR-8).
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, isAbsolute, join, normalize, resolve } from "node:path";
import {
  buildAncestralScopes,
  resolveGoverningScope,
  resolveScopeDirectory,
} from "../common/directories.ts";
import { parseArtifactFilename } from "../common/filename.ts";
import { parseCanonicalTag, slugToTitle, toPosixRelative } from "../common/index.ts";
import { discoverGistsForScope } from "../gist/reader.ts";
import type {
  DirectoryGist,
  FileGist,
  GistSignpost,
} from "../gist/types.ts";
import { collectAncestralMotives } from "../motive/reader.ts";
import { getTaskStatus, type TaskStatusDetails } from "../task/query.ts";
import { compareArtifactIds, listAdrs, listRules } from "./artifact-list.ts";
import {
  getArtifactDetails,
  resolveArtifactByTag,
} from "./artifact-query.ts";
import { splitMarkdownFrontmatter } from "../markdown/index.ts";
import type {
  CompileContextOptions,
  CompiledContextAdr,
  CompiledContextMotive,
  CompiledContextResult,
  CompiledContextRule,
  CompiledContextTask,
  ResolvedArtifact,
} from "./types.ts";

/**
 * Normalizes a filesystem path within `cwd` to its architectural directory `<dir>` (RULE-8),
 * stripping `.modie` container segments or file basenames while preserving exact directory paths
 * even if `<dir>/.modie` has not yet been created on disk.
 */
function resolveTargetDirectoryScope(
  pathInput: string,
  normCwd: string,
): {
  targetPath: string;
  scopeDir: string;
  scope: string;
} {
  const { scopeDir, scope, targetPath } = resolveScopeDirectory(
    pathInput,
    normCwd,
    "path",
  );
  return { targetPath, scopeDir, scope };
}

function buildCompiledTask(
  taskStatus: TaskStatusDetails,
  normCwd: string,
): CompiledContextTask {
  const gov = resolveGoverningScope(taskStatus.filepath, normCwd);
  const enclosingModieDir = toPosixRelative(
    normCwd,
    join(gov.scopeDir, ".modie"),
  );
  const constraint =
    gov.relativeScope === "."
      ? "All task file mutations must reside within the workspace root (.)."
      : `All task file mutations must reside at or strictly below "${gov.relativeScope}".`;

  return {
    id: taskStatus.id,
    tag: taskStatus.fullTaskId,
    fullTaskId: taskStatus.fullTaskId,
    slug: taskStatus.slug,
    title: taskStatus.title,
    relativePath: taskStatus.relativePath,
    scope: gov.relativeScope,
    scopeDir: gov.scopeDir,
    readiness: taskStatus.readiness,
    blockedBy: taskStatus.blockedBy,
    depends_on: taskStatus.depends_on,
    links: taskStatus.links,
    ...(taskStatus.context ? { context: taskStatus.context } : {}),
    criteriaTotal: taskStatus.criteriaTotal,
    criteriaCompleted: taskStatus.criteriaCompleted,
    criteriaProgress: taskStatus.criteriaProgress,
    acceptanceCriteria: taskStatus.acceptanceCriteria,
    incompleteCriteria: taskStatus.incompleteCriteria,
    blastRadius: {
      scope: gov.relativeScope,
      scopeDir: gov.scopeDir,
      enclosingModieDir,
      constraint,
    },
  };
}

export interface ContextTarget {
  target: string;
  type: "path" | "task" | "artifact";
  targetPath: string;
  scope: string;
  scopeDir: string;
  task?: CompiledContextTask;
}

function buildTaskTarget(
  taskStatus: TaskStatusDetails,
  normCwd: string,
  target: string,
): ContextTarget {
  const compiledTask = buildCompiledTask(taskStatus, normCwd);
  return {
    target,
    type: "task",
    targetPath: compiledTask.relativePath,
    scope: compiledTask.scope,
    scopeDir: compiledTask.scopeDir,
    task: compiledTask,
  };
}

function buildArtifactTarget(
  artifact: ResolvedArtifact,
  normCwd: string,
  target: string,
): ContextTarget {
  const gov = resolveGoverningScope(artifact.filepath, normCwd);
  return {
    target,
    type: "artifact",
    targetPath: artifact.relativePath,
    scope: gov.relativeScope,
    scopeDir: gov.scopeDir,
  };
}

async function tryTask(
  trimmed: string,
  normCwd: string,
): Promise<ContextTarget | null> {
  const canonicalTag = parseCanonicalTag(trimmed);
  const parsedFilename = parseArtifactFilename(basename(trimmed));

  if (canonicalTag?.subtype === "TASK" || parsedFilename?.subtype === "TASK") {
    const taskStatus = await getTaskStatus(trimmed, { cwd: normCwd });
    return buildTaskTarget(taskStatus, normCwd, trimmed);
  }
  return null;
}

async function tryArtifact(
  trimmed: string,
  normCwd: string,
): Promise<ContextTarget | null> {
  const canonicalTag = parseCanonicalTag(trimmed);
  const parsedFilename = parseArtifactFilename(basename(trimmed));

  if (canonicalTag || parsedFilename) {
    const resolvedArtifact = await resolveArtifactByTag(trimmed, {
      cwd: normCwd,
      includeArchived: true,
    });
    if (resolvedArtifact.subtype === "TASK") {
      const taskStatus = await getTaskStatus(resolvedArtifact.tag, {
        cwd: normCwd,
      });
      return buildTaskTarget(taskStatus, normCwd, trimmed);
    }
    return buildArtifactTarget(resolvedArtifact, normCwd, trimmed);
  }

  // Also check if candidate could be an artifact slug (no slashes, doesn't exist on disk, not ".")
  const candidatePath = resolve(normCwd, trimmed);
  const existsOnDisk = existsSync(candidatePath);

  if (
    !existsOnDisk &&
    !trimmed.includes("/") &&
    !trimmed.includes("\\") &&
    trimmed !== "."
  ) {
    try {
      const matched = await resolveArtifactByTag(trimmed, {
        cwd: normCwd,
        includeArchived: true,
      });
      if (matched.subtype === "TASK") {
        const taskStatus = await getTaskStatus(matched.tag, { cwd: normCwd });
        return buildTaskTarget(taskStatus, normCwd, trimmed);
      }
      return buildArtifactTarget(matched, normCwd, trimmed);
    } catch {
      return null;
    }
  }

  return null;
}

async function tryBareTaskId(
  trimmed: string,
  normCwd: string,
): Promise<ContextTarget | null> {
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return null;
  }
  const candidatePath = resolve(normCwd, trimmed);
  if (existsSync(candidatePath)) {
    return null;
  }
  try {
    const taskStatus = await getTaskStatus(trimmed, { cwd: normCwd });
    return buildTaskTarget(taskStatus, normCwd, trimmed);
  } catch {
    return null;
  }
}

function resolvePath(trimmed: string, normCwd: string): ContextTarget {
  const resolvedDir = resolveTargetDirectoryScope(trimmed, normCwd);
  return {
    target: trimmed,
    type: "path",
    targetPath: resolvedDir.targetPath,
    scope: resolvedDir.scope,
    scopeDir: resolvedDir.scopeDir,
  };
}

/**
 * Resolves context target metadata by evaluating early-return candidates:
 * `tryTask() ?? tryArtifact() ?? tryBareTaskId() ?? resolvePath()`.
 */
export async function resolveContextTarget(
  targetInput: string,
  normCwd: string,
): Promise<ContextTarget> {
  const trimmed = targetInput?.trim() || ".";
  return (
    (await tryTask(trimmed, normCwd)) ??
    (await tryArtifact(trimmed, normCwd)) ??
    (await tryBareTaskId(trimmed, normCwd)) ??
    resolvePath(trimmed, normCwd)
  );
}

async function collectMotives(
  scopeDir: string,
  normCwd: string,
): Promise<CompiledContextMotive[]> {
  const rawMotives = await collectAncestralMotives(scopeDir, normCwd);
  return rawMotives.map((m) => ({
    scope: m.scope,
    relativePath: m.relativePath,
    content: m.content,
  }));
}

async function collectRules(
  scope: string,
  normCwd: string,
): Promise<CompiledContextRule[]> {
  const listedRules = await listRules({ scope, cwd: normCwd });
  const rules: CompiledContextRule[] = [];

  for (const r of listedRules) {
    let body = "";
    try {
      const raw = await readFile(r.filepath, "utf8");
      body = splitMarkdownFrontmatter(raw).body.trim();
    } catch {
      body = "";
    }
    rules.push({
      tag: r.tag,
      id: r.id,
      slug: r.slug,
      title: r.title,
      scope: r.scope,
      relativePath: r.relativePath,
      links: r.links,
      body,
    });
  }
  return rules;
}

async function collectAdrs(
  scope: string,
  rules: CompiledContextRule[],
  task: CompiledContextTask | undefined,
  normCwd: string,
): Promise<CompiledContextAdr[]> {
  const ancestralAdrs = await listAdrs({ scope, cwd: normCwd });
  const adrByTag = new Map<string, CompiledContextAdr>();

  for (const a of ancestralAdrs) {
    adrByTag.set(a.tag, {
      tag: a.tag,
      id: a.id,
      slug: a.slug,
      title: a.title,
      scope: a.scope,
      relativePath: a.relativePath,
      summary: a.summary ?? a.title,
      links: a.links,
    });
  }

  // Ensure any ADRs explicitly linked by governing rules or by the target task are also included
  const linkedAdrTags = new Set<string>();
  for (const r of rules) {
    for (const l of r.links) {
      if (l.toUpperCase().startsWith("ADR-")) {
        linkedAdrTags.add(l.toUpperCase());
      }
    }
  }
  if (task) {
    for (const l of task.links) {
      if (l.toUpperCase().startsWith("ADR-")) {
        linkedAdrTags.add(l.toUpperCase());
      }
    }
  }

  for (const adrTag of linkedAdrTags) {
    if (adrByTag.has(adrTag)) continue;
    try {
      const details = await getArtifactDetails(adrTag, {
        cwd: normCwd,
        includeArchived: false,
      });
      if (details.subtype === "ADR" && !details.isArchived) {
        adrByTag.set(details.tag, {
          tag: details.tag,
          id: details.id,
          slug: details.slug,
          title: slugToTitle(details.slug),
          scope: details.scope,
          relativePath: details.relativePath,
          summary: details.summary ?? slugToTitle(details.slug),
          links: details.links,
        });
      }
    } catch {
      // Ignore unresolvable or archived link target
    }
  }

  return Array.from(adrByTag.values()).sort((a, b) =>
    compareArtifactIds(a.id, b.id),
  );
}

async function collectGists(
  scopeDir: string,
  normCwd: string,
): Promise<{
  directoryGist: Omit<DirectoryGist, "rawContent"> | null;
  fileGists: Omit<FileGist, "rawContent">[];
  signposts: (GistSignpost & { childScope: string })[];
}> {
  const gistDiscovery = await discoverGistsForScope(scopeDir, { cwd: normCwd });

  const directoryGist = gistDiscovery.directoryGist
    ? (({ rawContent: _raw, ...rest }) => rest)(gistDiscovery.directoryGist)
    : null;
  const fileGists = gistDiscovery.fileGists.map(
    ({ rawContent: _raw, ...rest }) => rest,
  );
  const signposts = gistDiscovery.signposts.map((sp) => ({
    ...sp,
    childScope: sp.scope,
  }));

  return {
    directoryGist,
    fileGists,
    signposts,
  };
}

/**
 * Compiles the unified Cone of Governance & Orientation for a target directory,
 * file path, task identifier, or artifact tag.
 *
 * Enforces:
 * - RULE-2: Upward ancestral motive traversal without sibling pollution.
 * - RULE-6: Task blast radius boundary resolution when scoped to a task.
 * - RULE-8 & ADR-10: `.modie/` container scope normalization.
 * - RULE-9: Ancestral rules and motives from P to R; local GISTs strictly at P.
 * - RULE-20: Directory (`GIST.md`) and file-level (`<filename>.GIST.md`) GIST resolution.
 * - ADR-8 & RULE-26: Progressive disclosure via ADR summaries and shallow child directory signposts.
 */
export async function compileContext(
  targetInput: string = ".",
  options: CompileContextOptions = {},
): Promise<CompiledContextResult> {
  const normCwd = normalize(resolve(options.cwd ?? process.cwd()));
  const target = await resolveContextTarget(targetInput, normCwd);
  const ancestralScopes = buildAncestralScopes(target.scope);

  const motives = await collectMotives(target.scopeDir, normCwd);
  const rules = await collectRules(target.scope, normCwd);
  const adrs = await collectAdrs(target.scope, rules, target.task, normCwd);
  const gists = await collectGists(target.scopeDir, normCwd);

  return {
    target: target.target,
    type: target.type,
    targetPath: target.targetPath,
    scope: target.scope,
    scopeDir: target.scopeDir,
    ancestralScopes,
    ...(target.task ? { task: target.task } : {}),
    motives,
    rules,
    adrs,
    gists: {
      directoryGist: gists.directoryGist,
      fileGists: gists.fileGists,
      signposts: gists.signposts,
    },
    signposts: gists.signposts,
  };
}

/**
 * Formats a `CompiledContextResult` into a deterministic Markdown document for `--raw` output.
 */
export function formatCompiledContextMarkdown(
  result: CompiledContextResult,
): string {
  const lines: string[] = [
    `# Architectural Context: ${result.target}`,
    "",
    `- **Target Type**: ${result.type}`,
    `- **Governing Scope**: \`${result.scope}\``,
    `- **Ancestral Chain**: ${result.ancestralScopes.map((s) => `\`${s}\``).join(" -> ")}`,
  ];

  if (result.task) {
    const t = result.task;
    lines.push(
      "",
      `## Task Specification (${t.tag}: ${t.title})`,
      "",
      `- **Readiness**: ${t.readiness} (${t.criteriaProgress})`,
      `- **Blast Radius**: \`${t.blastRadius.scope}\` — ${t.blastRadius.constraint}`,
    );
    if (t.depends_on.length > 0) {
      lines.push(`- **Depends On**: ${t.depends_on.join(", ")}`);
    }
    if (t.blockedBy.length > 0) {
      lines.push(`- **Blocked By**: ${t.blockedBy.join(", ")}`);
    }
    if (t.links.length > 0) {
      lines.push(`- **Links**: ${t.links.join(", ")}`);
    }
    if (t.context) {
      lines.push("", "### Context", "", t.context);
    }
    if (t.acceptanceCriteria.length > 0) {
      lines.push("", "### Acceptance Criteria", "");
      for (const item of t.acceptanceCriteria) {
        lines.push(`- [${item.completed ? "x" : " "}] ${item.text}`);
      }
    }
  }

  lines.push("", "## Upward Motives");
  if (result.motives.length === 0) {
    lines.push("", "_No motives defined in ancestral chain._");
  } else {
    for (const m of result.motives) {
      lines.push(
        "",
        `### Scope \`${m.scope}\` (\`${m.relativePath}\`)`,
        "",
        m.content,
      );
    }
  }

  lines.push("", "## Governing Rules");
  if (result.rules.length === 0) {
    lines.push("", "_No active rules in ancestral chain._");
  } else {
    lines.push("");
    for (const r of result.rules) {
      lines.push(`- **${r.tag}** (\`${r.scope}\` — ${r.title}): ${r.body}`);
    }
  }

  lines.push("", "## Architectural Decisions (ADR Summaries)");
  if (result.adrs.length === 0) {
    lines.push("", "_No active ADRs in ancestral chain._");
  } else {
    lines.push("");
    for (const a of result.adrs) {
      lines.push(`- **${a.tag}** (\`${a.scope}\` — ${a.title}): ${a.summary}`);
    }
  }

  lines.push("", `## Local GISTs (\`${result.scope}\`)`);
  if (!result.gists.directoryGist && result.gists.fileGists.length === 0) {
    lines.push("", "_No local GIST summaries in this scope._");
  } else {
    if (result.gists.directoryGist) {
      lines.push(
        "",
        `### Directory Summary (\`${result.gists.directoryGist.relativePath}\`)`,
        "",
        result.gists.directoryGist.content,
      );
    }
    if (result.gists.fileGists.length > 0) {
      lines.push("", "### File Summaries", "");
      for (const fg of result.gists.fileGists) {
        lines.push(`- **\`${fg.sourceFilename}\`**: ${fg.content}`);
      }
    }
  }

  lines.push("", "## Child Signposts");
  if (result.signposts.length === 0) {
    lines.push("", "_No immediate child directory signposts._");
  } else {
    lines.push("");
    for (const sp of result.signposts) {
      lines.push(
        `- **\`${sp.scope}\`** (\`${sp.relativePath}\`): ${sp.content}`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}
