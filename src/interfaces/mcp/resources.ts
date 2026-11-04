/**
 * Model Context Protocol (MCP) Resource Templates and Static/Dynamic Resources.
 * Provides lazy, parameterized context hydration and standardizes envelope boilerplate (RULE-25, RULE-26).
 */

import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { dirname } from "node:path";
import {
  compileContext,
  detectGitBranch,
  findArtifactReferences,
  getArtifactDetails,
  getTaskStatus,
  parseTaskIdFromBranch,
  queryTaskQueue,
  scanActiveArtifacts,
  slugToTitle,
} from "../../core/index.ts";
import { loadMcpInstructions } from "./instructions.ts";

export interface JsonResourceMetadata {
  title: string;
  description?: string;
  mimeType?: string;
}

/**
 * Reusable helper to register a JSON-serialized MCP resource or resource template,
 * standardizing envelope creation and eliminating boilerplate (TASK-49, RULE-26).
 */
export function registerJsonResource<TParams = any>(
  server: McpServer,
  name: string,
  uriOrTemplate: string | ResourceTemplate,
  metadata: JsonResourceMetadata,
  loader: (uri: URL, params: TParams) => Promise<any> | any,
) {
  return (server as any).registerResource(
    name,
    uriOrTemplate,
    {
      mimeType: "application/json",
      ...metadata,
    },
    async (uri: any, params: any) => {
      const data = await loader(uri, params as TParams);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    },
  );
}

export const jsonResource = registerJsonResource;

/**
 * Loads composite artifact inspection view for modie://artifact/{tag}.
 */
export async function handleArtifactResource(tag: string, cwd: string) {
  const details = await getArtifactDetails(tag, { cwd });
  const referencesResult = await findArtifactReferences(details.tag, { cwd });

  const allFound = [
    ...referencesResult.foundIn.governanceLinks,
    ...referencesResult.foundIn.governanceProse,
    ...referencesResult.foundIn.code,
    ...referencesResult.foundIn.tests,
    ...referencesResult.foundIn.documentation,
  ];

  const referencedBy = allFound.map((r) => ({
    tag: r.sourceTag ?? r.relativePath,
    sourceTag: r.sourceTag,
    subtype: r.type,
    scope: r.relativePath ? dirname(r.relativePath) : ".",
    filepath: r.relativePath ?? r.filepath,
    line: r.line,
  }));

  return {
    tag: details.tag,
    subtype: details.subtype,
    filepath: details.filepath,
    relativePath: details.relativePath,
    scope: details.scope,
    title: (details as any).title ?? slugToTitle(details.slug),
    summary: details.summary,
    invariant:
      details.sections["Invariant"] ??
      details.sections["assertion"] ??
      details.body.split("\n\n")[0]?.trim(),
    links: details.links,
    depends_on: details.depends_on,
    supersedes: details.supersedes,
    superseded_by: details.superseded_by,
    referencedBy,
    body: details.body,
    rawContent: details.rawContent,
  };
}

/**
 * Loads pre-compiled architectural cone for modie://context/{target}.
 */
export async function handleContextResource(target: string, cwd: string) {
  const normTarget =
    !target || target === "root" || target === "workspace" || target === "."
      ? "."
      : target;
  const compiled = await compileContext(normTarget, { cwd });

  const governingRules = compiled.rules.map((r) => ({
    tag: r.tag,
    title: r.title,
    invariant: (r as any).invariant ?? r.body?.split("\n\n")[0]?.trim(),
    scope: r.scope,
  }));

  const linkedDecisions = compiled.adrs.map((a) => ({
    tag: a.tag,
    title: a.title,
    summary: a.summary,
    scope: a.scope,
  }));

  return {
    target: compiled.target,
    scope: compiled.scope,
    scopeDir: compiled.scopeDir,
    ancestralScopes: compiled.ancestralScopes,
    motives: compiled.motives,
    localGist:
      (compiled.gists as any)?.localGist ?? compiled.gists?.directoryGist,
    gists: compiled.gists,
    governingRules,
    rules: governingRules,
    linkedDecisions,
    adrs: linkedDecisions,
    signposts: compiled.signposts,
    task: compiled.task,
  };
}

/**
 * Loads catalog listing with compact summaries for modie://catalog/{kind}.
 */
export async function handleCatalogResource(kind: string, cwd: string) {
  const normalized = (kind ?? "").trim().toUpperCase();

  if (normalized === "TASK" || normalized === "TASKS") {
    const tasks = await queryTaskQueue({ cwd });
    return tasks.map((t) => ({
      id: t.id,
      fullTaskId: t.fullTaskId,
      title: t.title,
      relativePath: t.relativePath,
      scope: (t as any).scope,
      readiness: t.readiness,
      blockedBy: t.blockedBy,
      depends_on: t.depends_on,
      criteriaProgress: t.criteriaProgress,
      allCriteriaSatisfied: t.allCriteriaSatisfied,
    }));
  }

  if (normalized === "READY") {
    const tasks = await queryTaskQueue({ cwd, readyOnly: true });
    return tasks.map((t) => ({
      id: t.id,
      fullTaskId: t.fullTaskId,
      title: t.title,
      relativePath: t.relativePath,
      readiness: t.readiness,
      criteriaProgress: t.criteriaProgress,
    }));
  }

  if (normalized === "RULE" || normalized === "RULES") {
    const discovered = await scanActiveArtifacts(cwd, "RULE");
    const activeRules = discovered.filter((r) => !r.isArchived);
    return Promise.all(
      activeRules.map(async (r) => {
        try {
          const details = await getArtifactDetails(r.tag, { cwd });
          return {
            tag: details.tag,
            title: (details as any).title ?? slugToTitle(details.slug),
            relativePath: details.relativePath,
            invariant:
              details.sections["Invariant"] ??
              details.sections["assertion"] ??
              details.body.split("\n\n")[0]?.trim(),
            scope: details.scope,
            links: details.links,
          };
        } catch {
          return {
            tag: r.tag,
            title: (r as any).title ?? slugToTitle(r.slug),
            relativePath: r.filepath,
          };
        }
      }),
    );
  }

  if (normalized === "ADR" || normalized === "ADRS") {
    const discovered = await scanActiveArtifacts(cwd, "ADR");
    const activeAdrs = discovered.filter((r) => !r.isArchived);
    return Promise.all(
      activeAdrs.map(async (a) => {
        try {
          const details = await getArtifactDetails(a.tag, { cwd });
          return {
            tag: details.tag,
            title: (details as any).title ?? slugToTitle(details.slug),
            relativePath: details.relativePath,
            summary: details.summary,
            scope: details.scope,
            links: details.links,
          };
        } catch {
          return {
            tag: a.tag,
            title: (a as any).title ?? slugToTitle(a.slug),
            relativePath: a.filepath,
          };
        }
      }),
    );
  }

  if (normalized === "BACKLOG") {
    const tasks = await queryTaskQueue({ cwd });
    return tasks
      .filter((t) => t.readiness === "BLOCKED")
      .map((t) => ({
        id: t.id,
        fullTaskId: t.fullTaskId,
        title: t.title,
        relativePath: t.relativePath,
        blockedBy: t.blockedBy,
        depends_on: t.depends_on,
      }));
  }

  throw new Error(
    `Unsupported catalog kind: "${kind}". Valid kinds: "task", "rule", "adr", "ready", "backlog".`,
  );
}

/**
 * Registers all static and dynamic resources and scoped resource templates on the MCP server.
 */
export function registerAllResources(
  server: McpServer,
  options: { cwd: string; instructions?: string },
) {
  const { cwd, instructions } = options;

  // 1. Scoped Resource Templates (TASK-49)
  // Dynamic template: modie://artifact/{tag}
  registerJsonResource(
    server,
    "artifact",
    new ResourceTemplate("modie://artifact/{tag}", { list: undefined }),
    {
      title: "Composite Artifact View",
      description:
        "Composite artifact view (file path, frontmatter, links, referencedBy, body/gist)",
    },
    async (_uri, { tag }: { tag: string }) => {
      return handleArtifactResource(tag, cwd);
    },
  );

  // Dynamic template: modie://context/{target}
  registerJsonResource(
    server,
    "context",
    new ResourceTemplate("modie://context/{target}", { list: undefined }),
    {
      title: "Compiled Architectural Context",
      description:
        "Pre-compiled architectural cone (motives, gists, compact rules with invariants, ADR summaries, signposts)",
    },
    async (_uri, { target }: { target: string }) => {
      return handleContextResource(target, cwd);
    },
  );

  // Dynamic template: modie://catalog/{kind}
  registerJsonResource(
    server,
    "catalog",
    new ResourceTemplate("modie://catalog/{kind}", { list: undefined }),
    {
      title: "Catalog Listing",
      description:
        "Catalog listing by kind (tasks, rules, adrs, ready, backlog) with compact GIST summaries",
    },
    async (_uri, { kind }: { kind: string }) => {
      return handleCatalogResource(kind, cwd);
    },
  );

  // 2. Static and Dynamic Resources
  // Root Architectural Context Resource
  registerJsonResource(
    server,
    "root-context",
    "modie://context",
    {
      title: "Root Architectural Context",
      description:
        "Pre-compiled root architectural cone (motives, gists, compact rules, signposts)",
    },
    async () => {
      return handleContextResource(".", cwd);
    },
  );

  // Active Ready Tasks Resource
  registerJsonResource(
    server,
    "ready-tasks",
    "modie://tasks/ready",
    {
      title: "Active Ready Tasks",
      description:
        "Active workspace tasks unblocked by dependencies and ready for execution",
    },
    async () => {
      return queryTaskQueue({ cwd, readyOnly: true });
    },
  );

  // All Tasks Resource
  registerJsonResource(
    server,
    "all-tasks",
    "modie://tasks",
    {
      title: "All Active Tasks",
      description:
        "All active tasks in the repository with DAG readiness status",
    },
    async () => {
      return queryTaskQueue({ cwd });
    },
  );

  // Current Task Dynamic Resource
  registerJsonResource(
    server,
    "current-task",
    "modie://task/current",
    {
      title: "Active Task Branch State",
      description:
        "Ambient active task progress, checklist, and blast radius stream",
    },
    async () => {
      const branch = await detectGitBranch(cwd);
      const taskId = branch ? parseTaskIdFromBranch(branch) : null;
      let status: any = null;
      if (taskId) {
        try {
          status = await getTaskStatus(taskId, { cwd });
        } catch {}
      }
      return { branch, taskId, status };
    },
  );

  // Active Governance Rules Resource
  registerJsonResource(
    server,
    "active-rules",
    "modie://rules",
    {
      title: "Workspace Governance Rules",
      description:
        "Active architectural, interface, and workflow governance rules enforced across the repository",
    },
    async () => {
      const discovered = await scanActiveArtifacts(cwd, "RULE");
      return Promise.all(
        discovered
          .filter((r) => !r.isArchived)
          .map(async (r) => {
            try {
              const details = await getArtifactDetails(r.tag, { cwd });
              return {
                tag: details.tag,
                title: (details as any).title ?? slugToTitle(details.slug),
                relativePath: details.relativePath,
                links: details.links,
                body: details.body,
              };
            } catch {
              return {
                tag: r.tag,
                title: (r as any).title ?? slugToTitle(r.slug),
                relativePath: r.filepath,
              };
            }
          }),
      );
    },
  );

  // Agent Instructions Resource (Markdown content)
  server.registerResource(
    "instructions",
    "modie://instructions",
    {
      title: "Agent Instructions & Governance Best Practices",
      description:
        "Comprehensive guidelines on ephemeral task decoupling, contract-based criteria, planned governance, and task lifecycle",
      mimeType: "text/markdown",
    },
    async (uri) => {
      const text = instructions ?? loadMcpInstructions();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text,
          },
        ],
      };
    },
  );
}
