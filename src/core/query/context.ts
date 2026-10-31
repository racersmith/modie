/**
 * Unified Architectural Context Compilation Service.
 * Synthesizes upward ancestral motives (RULE-2), active governing rules (RULE-9, RULE-12),
 * progressive-disclosure ADR summaries (ADR-8, RULE-26), task-scoped metadata and blast radius (RULE-6),
 * local directory/file GISTs (RULE-9, RULE-20), and shallow downward child signposts (ADR-8).
 */

import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
} from "node:path";
import { resolveGoverningScope } from "../common/directories.ts";
import { parseArtifactFilename } from "../common/filename.ts";
import { discoverGistsForScope } from "../gist/reader.ts";
import { collectAncestralMotives } from "../motive/reader.ts";
import { getTaskStatus, type TaskStatusDetails } from "../task/query.ts";
import { compareArtifactIds, listAdrs, listRules } from "./artifact-list.ts";
import {
  getArtifactDetails,
  parseCanonicalTag,
  resolveArtifactByTag,
} from "./artifact-query.ts";
import { splitMarkdownFrontmatter } from "./markdown-parser.ts";
import type {
  CompileContextOptions,
  CompiledContextAdr,
  CompiledContextMotive,
  CompiledContextResult,
  CompiledContextRule,
  CompiledContextTask,
  ResolvedArtifact,
} from "./types.ts";

function toPosixRelative(from: string, to: string): string {
  const rel = relative(from, to).replace(/\\/g, "/");
  return rel === "" ? "." : rel;
}

/**
 * Computes the ancestry scope path vector walking from `targetScope` upward to root `.`
 * (or root `.` down to `targetScope`).
 */
function buildAncestralScopes(targetScope: string): string[] {
  const normalized = targetScope.trim() || ".";
  if (normalized === ".") {
    return ["."];
  }
  const segments = normalized.split("/").filter(Boolean);
  const scopes: string[] = ["."];
  let accum = "";
  for (const seg of segments) {
    accum = accum ? `${accum}/${seg}` : seg;
    scopes.push(accum);
  }
  return scopes;
}

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
  const trimmed = pathInput.trim() || ".";
  const absResolved =
    trimmed === "."
      ? normCwd
      : isAbsolute(trimmed)
        ? normalize(trimmed)
        : normalize(resolve(normCwd, trimmed));

  const relTarget = toPosixRelative(normCwd, absResolved);
  if (relTarget.startsWith("..") || isAbsolute(relTarget)) {
    throw new Error(
      `Invalid path "${pathInput}": path must reside within the workspace root.`,
    );
  }

  const segments = absResolved.split(/[\\/]/);
  const modieIdx = segments.indexOf(".modie");

  let scopeDir: string;
  if (modieIdx !== -1) {
    scopeDir = segments.slice(0, modieIdx).join("/") || "/";
  } else {
    scopeDir = absResolved;
    try {
      const st = statSync(absResolved);
      if (st.isFile()) {
        scopeDir = dirname(absResolved);
      }
    } catch {
      if (basename(absResolved).includes(".")) {
        scopeDir = dirname(absResolved);
      }
    }
  }

  const scope = toPosixRelative(normCwd, scopeDir);
  return {
    targetPath: relTarget,
    scopeDir,
    scope,
  };
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
  const trimmed = targetInput?.trim() || ".";

  let type: "path" | "task" | "artifact" = "path";
  let targetPath = ".";
  let scopeDir = normCwd;
  let scope = ".";
  let compiledTask: CompiledContextTask | undefined;

  // 1. Check if targetInput is an explicit artifact tag, task filename, or artifact slug
  const canonicalTag = parseCanonicalTag(trimmed);
  const parsedFilename = parseArtifactFilename(basename(trimmed));

  if (canonicalTag?.subtype === "TASK" || parsedFilename?.subtype === "TASK") {
    const taskStatus = await getTaskStatus(trimmed, { cwd: normCwd });
    compiledTask = buildCompiledTask(taskStatus, normCwd);
    type = "task";
    targetPath = compiledTask.relativePath;
    scopeDir = compiledTask.scopeDir;
    scope = compiledTask.scope;
  } else if (canonicalTag || parsedFilename) {
    const resolvedArtifact = await resolveArtifactByTag(trimmed, {
      cwd: normCwd,
      includeArchived: true,
    });
    if (resolvedArtifact.subtype === "TASK") {
      const taskStatus = await getTaskStatus(resolvedArtifact.tag, {
        cwd: normCwd,
      });
      compiledTask = buildCompiledTask(taskStatus, normCwd);
      type = "task";
      targetPath = compiledTask.relativePath;
      scopeDir = compiledTask.scopeDir;
      scope = compiledTask.scope;
    } else {
      const gov = resolveGoverningScope(resolvedArtifact.filepath, normCwd);
      type = "artifact";
      targetPath = resolvedArtifact.relativePath;
      scopeDir = gov.scopeDir;
      scope = gov.relativeScope;
    }
  } else {
    // Check if it's an existing path on disk or a path containing slashes
    const candidatePath = resolve(normCwd, trimmed);
    const existsOnDisk = existsSync(candidatePath);

    if (
      !existsOnDisk &&
      !trimmed.includes("/") &&
      !trimmed.includes("\\") &&
      trimmed !== "."
    ) {
      // Could be a bare numeric task ID (e.g. "54") or artifact slug
      let matchedArtifact: ResolvedArtifact | null = null;
      try {
        matchedArtifact = await resolveArtifactByTag(trimmed, {
          cwd: normCwd,
          includeArchived: true,
        });
      } catch {
        matchedArtifact = null;
      }

      if (matchedArtifact) {
        if (matchedArtifact.subtype === "TASK") {
          const taskStatus = await getTaskStatus(matchedArtifact.tag, {
            cwd: normCwd,
          });
          compiledTask = buildCompiledTask(taskStatus, normCwd);
          type = "task";
          targetPath = compiledTask.relativePath;
          scopeDir = compiledTask.scopeDir;
          scope = compiledTask.scope;
        } else {
          const gov = resolveGoverningScope(matchedArtifact.filepath, normCwd);
          type = "artifact";
          targetPath = matchedArtifact.relativePath;
          scopeDir = gov.scopeDir;
          scope = gov.relativeScope;
        }
      } else {
        // Also check bare numeric task ID
        let taskStatus: TaskStatusDetails | null = null;
        if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
          try {
            taskStatus = await getTaskStatus(trimmed, { cwd: normCwd });
          } catch {
            taskStatus = null;
          }
        }
        if (taskStatus) {
          compiledTask = buildCompiledTask(taskStatus, normCwd);
          type = "task";
          targetPath = compiledTask.relativePath;
          scopeDir = compiledTask.scopeDir;
          scope = compiledTask.scope;
        } else {
          const resolvedDir = resolveTargetDirectoryScope(trimmed, normCwd);
          type = "path";
          targetPath = resolvedDir.targetPath;
          scopeDir = resolvedDir.scopeDir;
          scope = resolvedDir.scope;
        }
      }
    } else {
      const resolvedDir = resolveTargetDirectoryScope(trimmed, normCwd);
      type = "path";
      targetPath = resolvedDir.targetPath;
      scopeDir = resolvedDir.scopeDir;
      scope = resolvedDir.scope;
    }
  }

  // 2. Compute ancestral scope chain
  const ancestralScopes = buildAncestralScopes(scope);

  // 3. Collect upward ancestral motives (RULE-2, RULE-9)
  const rawMotives = await collectAncestralMotives(scopeDir, normCwd);
  const motives: CompiledContextMotive[] = rawMotives.map((m) => ({
    scope: m.scope,
    relativePath: m.relativePath,
    content: m.content,
  }));

  // 4. Collect active governing rules across upward ancestry (RULE-9)
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

  // 5. Collect active ADRs in ancestral scope plus ADRs linked from active rules or task (ADR-8, RULE-26)
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
  if (compiledTask) {
    for (const l of compiledTask.links) {
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
          title: details.slug.replace(/-/g, " "),
          scope: details.scope,
          relativePath: details.relativePath,
          summary: details.summary ?? details.slug.replace(/-/g, " "),
          links: details.links,
        });
      }
    } catch {
      // Ignore unresolvable or archived link target
    }
  }

  const adrs = Array.from(adrByTag.values()).sort((a, b) =>
    compareArtifactIds(a.id, b.id),
  );

  // 6. Collect local directory/file GISTs strictly at target scope `scope` and shallow downward signposts (RULE-9, RULE-20, ADR-8)
  const gistDiscovery = await discoverGistsForScope(scopeDir, { cwd: normCwd });

  const cleanDirectoryGist = gistDiscovery.directoryGist
    ? (({ rawContent: _raw, ...rest }) => rest)(gistDiscovery.directoryGist)
    : null;
  const cleanFileGists = gistDiscovery.fileGists.map(
    ({ rawContent: _raw, ...rest }) => rest,
  );
  const compiledSignposts = gistDiscovery.signposts.map((sp) => ({
    ...sp,
    childScope: sp.scope,
  }));

  return {
    target: trimmed,
    type,
    targetPath,
    scope,
    scopeDir,
    ancestralScopes,
    ...(compiledTask ? { task: compiledTask } : {}),
    motives,
    rules,
    adrs,
    gists: {
      directoryGist: cleanDirectoryGist,
      fileGists: cleanFileGists,
      signposts: compiledSignposts,
    },
    signposts: compiledSignposts,
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
