/**
 * Bidirectional scope resolution and architectural governance query service.
 * Complies with RULE-6, RULE-8, RULE-9, RULE-12, RULE-25, and ADR-10.
 */

import { existsSync } from "node:fs";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";
import { resolveGoverningScope } from "../common/directories.ts";
import { parseArtifactFilename } from "../common/filename.ts";
import { queryTaskQueue } from "../task/query.ts";
import { listActiveArtifacts } from "./artifact-list.ts";
import { parseCanonicalTag, resolveArtifactByTag } from "./artifact-query.ts";
import type {
  AncestralRuleChainNode,
  ResolveScopeOptions,
  ResolvedArtifact,
  ScopeResolutionResult,
  ScopeRuleItem,
  ScopeTaskItem,
} from "./types.ts";

/**
 * Computes ancestral scope relative paths along the path vector from root down to `targetScope`.
 * Filters to directories having a `.modie` container (or root `.`).
 */
export function computeAncestralScopes(
  targetScope: string,
  cwd: string,
): string[] {
  const normCwd = normalize(resolve(cwd));
  const scopes: string[] = ["."];

  if (targetScope === ".") {
    return scopes;
  }

  const segments = targetScope.split("/").filter(Boolean);
  let accumulated = "";

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    accumulated = accumulated ? `${accumulated}/${seg}` : seg;
    const abs = resolve(normCwd, accumulated);
    const modieDir = join(abs, ".modie");
    const rulesDir = join(abs, ".rules");

    if (
      existsSync(modieDir) ||
      existsSync(rulesDir) ||
      accumulated === targetScope
    ) {
      if (!scopes.includes(accumulated)) {
        scopes.push(accumulated);
      }
    }
  }

  return scopes;
}

/**
 * Bidirectionally resolves architectural scope boundaries, enclosing .modie root,
 * ancestral rule chains, and active tasks for an artifact identifier or filesystem path.
 *
 * @param targetOrIdentifier Artifact tag (e.g. RULE-6, TASK-51), slug, or filesystem path.
 * @param options Workspace configuration options.
 */
export async function resolveScope(
  targetOrIdentifier: string,
  options: ResolveScopeOptions = {},
): Promise<ScopeResolutionResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const trimmed = targetOrIdentifier?.trim();

  if (!trimmed) {
    throw new Error("Target path or artifact identifier is required.");
  }

  // 1. Determine if input resolves to an indexable artifact
  let resolvedArtifact: ResolvedArtifact | null = null;

  if (parseCanonicalTag(trimmed) || parseArtifactFilename(trimmed)) {
    try {
      resolvedArtifact = await resolveArtifactByTag(trimmed, {
        cwd,
        includeArchived: true,
      });
    } catch {
      resolvedArtifact = null;
    }
  } else if (
    !trimmed.includes("/") &&
    !trimmed.includes("\\") &&
    trimmed !== "."
  ) {
    // Potential artifact slug
    try {
      resolvedArtifact = await resolveArtifactByTag(trimmed, {
        cwd,
        includeArchived: true,
      });
    } catch {
      resolvedArtifact = null;
    }
  }

  // 2. Branch: Artifact resolution
  if (resolvedArtifact) {
    const governingScope = resolveGoverningScope(
      resolvedArtifact.filepath,
      cwd,
    );
    const scope = governingScope.relativeScope;
    const scopeDir = governingScope.scopeDir;
    const enclosingModieDir = relative(cwd, join(scopeDir, ".modie")).replace(
      /\\/g,
      "/",
    );

    const ancestralScopes = computeAncestralScopes(scope, cwd);

    const activeRules = await listActiveArtifacts("RULE", { scope, cwd });
    const rules: ScopeRuleItem[] = activeRules.map((r) => ({
      tag: r.tag,
      id: r.id,
      slug: r.slug,
      title: r.title,
      relativePath: r.relativePath,
      scope: r.scope,
    }));

    const ancestralRuleChains: AncestralRuleChainNode[] = ancestralScopes.map(
      (s) => ({
        scope: s,
        rules: rules.filter((r) => r.scope === s),
      }),
    );

    const allTasks = await queryTaskQueue({ cwd });
    const tasks: ScopeTaskItem[] = allTasks
      .filter(
        (t) =>
          resolveGoverningScope(t.filepath, cwd).relativeScope === scope,
      )
      .map((t) => ({
        id: t.id,
        tag: t.fullTaskId,
        title: t.title,
        slug: t.slug,
        relativePath: t.relativePath,
        scope,
        readiness: t.readiness,
        criteriaProgress: t.criteriaProgress,
      }));

    return {
      target: trimmed,
      type: "artifact",
      targetPath: resolvedArtifact.relativePath,
      targetAbsolutePath: resolvedArtifact.filepath,
      scope,
      scopeDir,
      enclosingModieDir,
      ancestralScopes,
      ancestralRuleChains,
      rules,
      tasks,
      artifact: resolvedArtifact,
    };
  }

  // 3. Branch: Filesystem path resolution
  const absPath = isAbsolute(trimmed)
    ? normalize(trimmed)
    : resolve(cwd, trimmed);
  const relFromRoot = relative(cwd, absPath).replace(/\\/g, "/");

  if (relFromRoot.startsWith("..") || isAbsolute(relFromRoot)) {
    throw new Error(
      `Invalid path "${trimmed}": path must reside within the workspace root.`,
    );
  }

  const targetPath = relFromRoot === "" ? "." : relFromRoot;
  const governingScope = resolveGoverningScope(absPath, cwd);
  const scope = governingScope.relativeScope;
  const scopeDir = governingScope.scopeDir;
  const enclosingModieDir = relative(cwd, join(scopeDir, ".modie")).replace(
    /\\/g,
    "/",
  );

  const ancestralScopes = computeAncestralScopes(scope, cwd);

  const activeRules = await listActiveArtifacts("RULE", { scope, cwd });
  const rules: ScopeRuleItem[] = activeRules.map((r) => ({
    tag: r.tag,
    id: r.id,
    slug: r.slug,
    title: r.title,
    relativePath: r.relativePath,
    scope: r.scope,
  }));

  const ancestralRuleChains: AncestralRuleChainNode[] = ancestralScopes.map(
    (s) => ({
      scope: s,
      rules: rules.filter((r) => r.scope === s),
    }),
  );

  const allTasks = await queryTaskQueue({ cwd });
  const tasks: ScopeTaskItem[] = allTasks
    .filter(
      (t) =>
        resolveGoverningScope(t.filepath, cwd).relativeScope === scope,
    )
    .map((t) => ({
      id: t.id,
      tag: t.fullTaskId,
      title: t.title,
      slug: t.slug,
      relativePath: t.relativePath,
      scope,
      readiness: t.readiness,
      criteriaProgress: t.criteriaProgress,
    }));

  return {
    target: trimmed,
    type: "path",
    targetPath,
    targetAbsolutePath: absPath,
    scope,
    scopeDir,
    enclosingModieDir,
    ancestralScopes,
    ancestralRuleChains,
    rules,
    tasks,
  };
}
