/**
 * Flat Zod schemas for the 5 consolidated Modie MCP tools.
 * Complies with RULE-25 (interface-core decoupling), RULE-26 (token economy),
 * and scratch/mcp-design.md specifications.
 */

import { z } from "zod";

// 1. modie_compile_context
export const contextMotiveItemSchema = z.object({
  scope: z.string().describe("Architectural scope of the motive"),
  relativePath: z.string().describe("Relative path to MOTIVE.md"),
  content: z.string().describe("Motive prose content"),
});

export const contextDirectoryGistSchema = z.object({
  type: z.string().optional().describe("Gist type discriminator"),
  scope: z.string().optional().describe("Directory scope"),
  scopeDir: z.string().optional().describe("Absolute directory path"),
  filepath: z.string().optional().describe("Absolute path to GIST.md"),
  relativePath: z.string().optional().describe("Relative path to GIST.md"),
  content: z.string().optional().describe("Gist summary prose"),
});

export const contextFileGistSchema = z.object({
  type: z.string().optional().describe("Gist type discriminator"),
  scope: z.string().optional().describe("Enclosing directory scope"),
  scopeDir: z.string().optional().describe("Absolute directory path"),
  filepath: z.string().optional().describe("Absolute path to file GIST.md"),
  relativePath: z.string().optional().describe("Relative path to file GIST.md"),
  sourceFilename: z
    .string()
    .optional()
    .describe("Name of target implementation file"),
  content: z.string().optional().describe("File proxy summary prose"),
});

export const contextSignpostSchema = z.object({
  scope: z.string().optional().describe("Child directory scope"),
  childScope: z.string().optional().describe("Alias for child scope"),
  relativePath: z
    .string()
    .optional()
    .describe("Relative path to child GIST.md"),
  summary: z.string().optional().describe("Child directory summary signpost"),
  hasChildren: z
    .boolean()
    .optional()
    .describe("Whether child directory contains nested scopes"),
});

export const contextGistsSchema = z.object({
  directoryGist: contextDirectoryGistSchema.nullable().optional(),
  fileGists: z.array(contextFileGistSchema).optional(),
  signposts: z.array(contextSignpostSchema).optional(),
  localGist: contextDirectoryGistSchema.nullable().optional(),
});

export const contextRuleItemSchema = z.object({
  tag: z.string().describe("Canonical rule tag (e.g. 'RULE-XXXX')"),
  title: z.string().optional().describe("Rule title"),
  invariant: z.string().optional().describe("Primary rule invariant"),
  scope: z.string().optional().describe("Governing architectural scope"),
  relativePath: z.string().optional().describe("Relative path to rule file"),
  links: z.array(z.string()).optional().describe("Outbound rule links"),
  body: z.string().optional().describe("Full rule markdown body"),
});

export const contextAdrItemSchema = z.object({
  tag: z.string().describe("Canonical ADR tag (e.g. 'ADR-XXXX')"),
  title: z.string().optional().describe("ADR title"),
  summary: z.string().optional().describe("Decision summary"),
  scope: z.string().optional().describe("Governing architectural scope"),
  relativePath: z.string().optional().describe("Relative path to ADR file"),
  links: z.array(z.string()).optional().describe("Outbound ADR links"),
  context: z.string().optional().describe("Decision context"),
  decision: z.string().optional().describe("Adopted decision"),
  consequences: z
    .string()
    .optional()
    .describe("Positive outcomes, new risks, and accepted trade-offs"),
});

export const contextSubmoduleItemSchema = z.object({
  name: z.string().optional().describe("Submodule or directory name"),
  path: z.string().optional().describe("Relative path to submodule"),
  scope: z.string().optional().describe("Submodule architectural scope"),
});

export const contextTaskCriterionSchema = z.object({
  item: z.number().optional().describe("1-based criterion index"),
  text: z.string().optional().describe("Criterion text"),
  completed: z.boolean().optional().describe("Whether criterion is completed"),
});

export const contextTaskSchema = z.object({
  tag: z.string().optional().describe("Task tag (e.g. 'TASK-XXXX')"),
  title: z.string().optional().describe("Task title"),
  relativePath: z.string().optional().describe("Relative path to task file"),
  scope: z.string().optional().describe("Governing architectural scope"),
  scopeDir: z.string().optional().describe("Scope directory path"),
  readiness: z.string().optional().describe("Task DAG readiness state"),
  blockedBy: z
    .array(z.string())
    .optional()
    .describe("Unfinished prerequisite task tags"),
  depends_on: z
    .array(z.string())
    .optional()
    .describe("Declared prerequisite tasks"),
  links: z.array(z.string()).optional().describe("Outbound governance links"),
  context: z.string().optional().describe("Task mission context"),
  criteriaTotal: z.number().optional().describe("Total criteria count"),
  criteriaCompleted: z.number().optional().describe("Completed criteria count"),
  criteriaProgress: z
    .string()
    .optional()
    .describe("Progress summary string (e.g. '2/3')"),
  acceptanceCriteria: z
    .array(contextTaskCriterionSchema)
    .optional()
    .describe("Task acceptance criteria items"),
  incompleteCriteria: z
    .array(z.string())
    .optional()
    .describe("List of incomplete criteria texts"),
  blastRadius: z
    .object({
      scope: z.string().optional(),
      scopeDir: z.string().optional(),
      enclosingModieDir: z.string().optional(),
      constraint: z.string().optional(),
    })
    .optional()
    .describe("Task blast radius constraint"),
});

export const contextReferenceItemSchema = z.object({
  tag: z.string().optional().describe("Citing artifact tag or relative path"),
  sourceTag: z
    .string()
    .optional()
    .describe("Citing artifact tag if applicable"),
  subtype: z.string().optional().describe("Citation category"),
  scope: z.string().optional().describe("Directory scope of the citation"),
  filepath: z.string().optional().describe("File path of the citation"),
  line: z.number().optional().describe("Line number of the citation"),
});

export const ancestralRuleChainNodeSchema = z.object({
  scope: z.string().describe("Ancestral scope level"),
  rules: z
    .array(contextRuleItemSchema)
    .describe("Rules originating at this scope level"),
});

export const contextScopeTaskItemSchema = z.object({
  tag: z.string().optional().describe("Task tag"),
  title: z.string().optional().describe("Task title"),
  relativePath: z.string().optional().describe("Relative path to task file"),
  scope: z.string().optional().describe("Governing scope"),
  readiness: z.string().optional().describe("Readiness state"),
  criteriaProgress: z.string().optional().describe("Criteria progress string"),
});

export const compileContextInputSchema = z.object({
  target: z
    .string()
    .optional()
    .describe(
      "File path, directory scope, task ID (e.g. 'TASK-XXXX'), or artifact tag (e.g. 'RULE-XXXX'). Defaults to active task branch or '.'",
    ),
  mode: z
    .enum(["context", "inspect", "scope"])
    .default("context")
    .describe(
      "Operation mode: 'context' for architectural cone compilation, 'inspect' for composite artifact view (path + content + refs), or 'scope' for spatial directory resolution",
    ),
  depth: z
    .enum(["shallow", "full"])
    .default("shallow")
    .describe("Signpost traversal recursion depth"),
  detail_level: z
    .enum(["gist", "full"])
    .default("gist")
    .describe(
      "Level of detail: compact GIST/invariant signposts ('gist') or full markdown content ('full')",
    ),
});

export const compileContextOutputSchema = z
  .object({
    mode: z.enum(["context", "inspect", "scope"]).optional(),
    target: z.string().optional(),
    scope: z.string().optional(),
    scopeDir: z.string().optional(),
    ancestralChain: z.array(z.string()).optional(),
    ancestralScopes: z.array(z.string()).optional(),
    motives: z.array(contextMotiveItemSchema).optional(),
    localGist: contextDirectoryGistSchema.nullable().optional(),
    gists: contextGistsSchema.optional(),
    governingRules: z.array(contextRuleItemSchema).optional(),
    rules: z.array(contextRuleItemSchema).optional(),
    linkedDecisions: z.array(contextAdrItemSchema).optional(),
    adrs: z.array(contextAdrItemSchema).optional(),
    submodules: z.array(contextSubmoduleItemSchema).optional(),
    signposts: z.array(contextSignpostSchema).optional(),
    task: contextTaskSchema.optional(),
    tag: z.string().optional(),
    subtype: z.string().optional(),
    filepath: z.string().optional(),
    relativePath: z.string().optional(),
    title: z.string().optional(),
    invariant: z.string().optional(),
    summary: z.string().optional(),
    links: z.array(z.string()).optional(),
    depends_on: z.array(z.string()).optional(),
    supersedes: z.array(z.string()).optional(),
    superseded_by: z.array(z.string()).optional(),
    referencedBy: z.array(contextReferenceItemSchema).optional(),
    content: z.string().optional(),
    body: z.string().optional(),
    sections: z.record(z.string(), z.string()).optional(),
    acceptanceCriteria: z.array(contextTaskCriterionSchema).optional(),
    rawContent: z.string().optional(),
    type: z.string().optional(),
    targetPath: z.string().optional(),
    targetAbsolutePath: z.string().optional(),
    containerPath: z.string().optional(),
    ancestralRuleChain: z.array(ancestralRuleChainNodeSchema).optional(),
    activeTasks: z.array(contextScopeTaskItemSchema).optional(),
    activeRules: z.array(contextRuleItemSchema).optional(),
    activeAdrs: z.array(contextAdrItemSchema).optional(),
  })
  .passthrough();

// 2. modie_query_catalog
export const catalogPlannedGovernanceSchema = z.object({
  rules: z.number().optional().describe("Planned rules count"),
  adrs: z.number().optional().describe("Planned ADRs count"),
});

export const catalogTaskItemSchema = z.object({
  tag: z.string().optional().describe("Task tag"),
  title: z.string().optional().describe("Task title"),
  scope: z.string().optional().describe("Architectural scope"),
  relativePath: z.string().optional().describe("Relative path to task file"),
  readiness: z.string().optional().describe("Readiness state"),
  criteriaCount: z.number().optional().describe("Total criteria count"),
  completedCriteriaCount: z
    .number()
    .optional()
    .describe("Completed criteria count"),
  criteriaProgress: z.string().optional().describe("Progress summary string"),
  blockedBy: z.array(z.string()).optional().describe("Blocking task tags"),
  plannedGovernance: catalogPlannedGovernanceSchema
    .optional()
    .describe("Planned governance items"),
});

export const catalogRuleItemSchema = z.object({
  tag: z.string().describe("Rule tag"),
  title: z.string().optional().describe("Rule title"),
  invariant: z.string().optional().describe("Core rule invariant"),
  scope: z.string().optional().describe("Architectural scope"),
  links: z.array(z.string()).optional().describe("Outbound links"),
  body: z.string().optional().describe("Rule body markdown"),
});

export const catalogAdrItemSchema = z.object({
  tag: z.string().describe("ADR tag"),
  title: z.string().optional().describe("ADR title"),
  summary: z.string().optional().describe("Decision summary"),
  scope: z.string().optional().describe("Architectural scope"),
  links: z.array(z.string()).optional().describe("Outbound links"),
  context: z.string().optional().describe("Context section"),
  decision: z.string().optional().describe("Decision section"),
  consequences: z
    .string()
    .optional()
    .describe("Positive outcomes, new risks, and accepted trade-offs"),
  relativePath: z.string().optional().describe("Relative path to ADR file"),
});

export const catalogItemSchema = z.object({
  tag: z.string().optional().describe("Artifact tag"),
  title: z.string().optional().describe("Artifact title"),
  scope: z.string().optional().describe("Architectural scope"),
  relativePath: z
    .string()
    .optional()
    .describe("Relative path to artifact file"),
  readiness: z.string().optional().describe("Task readiness state"),
  invariant: z.string().optional().describe("Rule invariant"),
  summary: z.string().optional().describe("ADR summary"),
  links: z.array(z.string()).optional().describe("Outbound governance links"),
  blockedBy: z.array(z.string()).optional().describe("Blocking task tags"),
  criteriaCount: z.number().optional().describe("Total criteria count"),
  completedCriteriaCount: z
    .number()
    .optional()
    .describe("Completed criteria count"),
  criteriaProgress: z.string().optional().describe("Criteria progress string"),
  plannedGovernance: catalogPlannedGovernanceSchema
    .optional()
    .describe("Planned governance metadata"),
  body: z.string().optional().describe("Full markdown body"),
});

export const queryCatalogInputSchema = z.object({
  kind: z
    .enum(["TASK", "BACKLOG", "RULE", "ADR"])
    .describe("Artifact catalog kind to query"),
  scope: z
    .string()
    .optional()
    .describe("Architectural directory scope filter (e.g. 'src/interfaces')"),
  ready_only: z
    .boolean()
    .default(true)
    .describe("For tasks, filter strictly to unblocked ready tasks"),
  detail_level: z
    .enum(["gist", "full"])
    .default("gist")
    .describe("Compact GIST summaries vs complete records"),
});

export const queryCatalogOutputSchema = z
  .object({
    kind: z.enum(["TASK", "BACKLOG", "RULE", "ADR"]).optional(),
    scope: z.string().optional(),
    totalCount: z.number().optional(),
    totalTasks: z.number().optional(),
    readyCount: z.number().optional(),
    blockedCount: z.number().optional(),
    items: z.array(catalogItemSchema).optional(),
    readyTasks: z.array(catalogTaskItemSchema).optional(),
    blockedTasks: z.array(catalogTaskItemSchema).optional(),
    rules: z.array(catalogRuleItemSchema).optional(),
    adrs: z.array(catalogAdrItemSchema).optional(),
  })
  .passthrough();

// 3. modie_task_lifecycle
export const taskLifecycleInputSchema = z.object({
  action: z
    .enum([
      "start",
      "check",
      "status",
      "complete",
      "merge",
      "complete_and_merge",
    ])
    .describe("Task lifecycle transition action"),
  task_id: z
    .string()
    .optional()
    .describe("Task tag or numeric ID (defaults to active git branch)"),
  check_items: z
    .array(z.number().int().positive())
    .optional()
    .describe("1-based criteria indices to check or uncheck in batch"),
  uncheck: z
    .boolean()
    .default(false)
    .describe("Marks specified criteria incomplete"),
  base_branch: z
    .string()
    .optional()
    .describe(
      "Base branch override for start or merge (defaults to parent task branch or trunk)",
    ),
  keep_branch: z.boolean().default(false).describe("Retain branch after merge"),
  force: z
    .boolean()
    .default(false)
    .describe("Bypass criteria verification check on complete"),
  include_context: z
    .boolean()
    .default(true)
    .describe(
      "Inline compiled context, mission brief, and guardrails on start",
    ),
});

export const taskLifecycleCriterionItemSchema = z.object({
  item: z.number().describe("1-based index of criterion"),
  text: z.string().describe("Criterion contract description"),
  completed: z.boolean().describe("Whether criterion is checked complete"),
});

export const ambientGoverningRuleSchema = z.object({
  tag: z.string().describe("RULE tag"),
  title: z.string().optional().describe("Rule title"),
  invariant: z.string().optional().describe("Core invariant assertion"),
});

export const ambientLinkedAdrSchema = z.object({
  tag: z.string().describe("ADR tag"),
  summary: z.string().optional().describe("Architectural decision summary"),
});

export const taskLifecycleOutputSchema = z
  .object({
    action: z.string(),
    taskId: z.string().optional(),
    branch: z.string().optional(),
    branchName: z.string().optional(),
    created: z.boolean().optional(),
    createdBranch: z.boolean().optional(),
    isSubtask: z.boolean().optional(),
    mission: z
      .object({
        title: z.string().optional(),
        scope: z.string().optional(),
        blastRadius: z
          .object({
            constraint: z.string(),
          })
          .optional(),
        acceptanceCriteria: z
          .array(taskLifecycleCriterionItemSchema)
          .optional(),
        plannedGovernance: z
          .object({
            rules: z.number(),
            adrs: z.number(),
          })
          .optional(),
      })
      .optional(),
    ambientGuardrails: z
      .object({
        governingRules: z.array(ambientGoverningRuleSchema).optional(),
        linkedAdrs: z.array(ambientLinkedAdrSchema).optional(),
      })
      .optional(),
    checkedItems: z.array(z.number()).optional(),
    progress: z.string().optional(),
    criteriaProgress: z.string().optional(),
    remainingCriteria: z.array(taskLifecycleCriterionItemSchema).optional(),
    acceptanceCriteria: z.array(taskLifecycleCriterionItemSchema).optional(),
    incompleteCriteria: z.array(z.string()).optional(),
    allCriteriaSatisfied: z.boolean().optional(),
    readiness: z.string().optional(),
    blockedBy: z.array(z.string()).optional(),
    phase1Commit: z.string().optional(),
    phase2Commit: z.string().optional(),
    deletedTaskPath: z.string().optional(),
    merged: z.boolean().optional(),
    targetBranch: z.string().optional(),
    deletedBranch: z.boolean().optional(),
    message: z.string().optional(),
  })
  .passthrough();

// 4. modie_create_artifact
export const createArtifactInputSchema = z.object({
  kind: z
    .enum(["RULE", "ADR", "TASK", "MOTIVE", "IDEA", "SPARK"])
    .describe("Artifact kind to author"),
  title: z.string().min(1).describe("Artifact title"),
  scope_dir: z
    .string()
    .optional()
    .describe(
      "Architectural directory scope (defaults to active task scope or '.')",
    ),
  sections: z
    .record(z.string(), z.string())
    .optional()
    .describe("Key-value map of section headings to body markdown text"),
  content: z.string().optional().describe("Raw markdown content override"),
  initial_links: z
    .array(z.string())
    .optional()
    .describe("Tags to link immediately on creation (atomic create + link)"),
  depends_on: z
    .array(z.string())
    .optional()
    .describe("Prerequisite task tags for TASK kind"),
  supersedes: z
    .array(z.string())
    .optional()
    .describe("Predecessor tags to supersede bidirectionally"),
  scaffold_only: z
    .boolean()
    .default(false)
    .describe("Return schema template blueprint without creating file on disk"),
});

export const createArtifactOutputSchema = z
  .object({
    tag: z
      .string()
      .optional()
      .describe("Created artifact tag (e.g. 'RULE-XXXX')"),
    kind: z.string().optional(),
    filepath: z.string().optional(),
    relativePath: z.string().optional(),
    scope: z.string().optional(),
    validatedLinks: z.array(z.string()).optional(),
    supersededUpdated: z.array(z.string()).optional(),
    requiredSections: z.array(z.string()).optional(),
    allowedFrontmatter: z.array(z.string()).optional(),
    linkTargetSubtypes: z.array(z.string()).optional(),
    ancestryRule: z.string().optional(),
    template: z.string().optional(),
  })
  .passthrough();

// 5. modie_mutate_governance
export const mutateGovernanceInputSchema = z.object({
  action: z
    .enum(["link", "unlink", "archive"])
    .describe("Governance mutation action"),
  target: z
    .string()
    .optional()
    .describe("Subject artifact tag (defaults to active task branch)"),
  targets: z
    .array(z.string())
    .optional()
    .describe("Batch target tags for link or unlink"),
  relationship: z
    .enum(["links", "depends_on", "supersedes"])
    .default("links")
    .describe("Frontmatter relationship field"),
  force: z
    .boolean()
    .default(false)
    .describe("Bypass inbound reference audit during archival"),
});

export const mutateGovernanceOutputSchema = z
  .object({
    action: z.string(),
    subject: z.string().optional(),
    target: z.string().optional(),
    tag: z.string().optional(),
    relationship: z.string().optional(),
    added: z.array(z.string()).optional(),
    alreadyPresent: z.array(z.string()).optional(),
    removed: z.array(z.string()).optional(),
    graphValidated: z.boolean().optional(),
    archivedPath: z.string().optional(),
    activeReferencesBypassed: z.boolean().optional(),
  })
  .passthrough();

export type CompileContextInput = z.infer<typeof compileContextInputSchema>;
export type CompileContextOutput = z.infer<typeof compileContextOutputSchema>;
export type QueryCatalogInput = z.infer<typeof queryCatalogInputSchema>;
export type QueryCatalogOutput = z.infer<typeof queryCatalogOutputSchema>;
export type TaskLifecycleInput = z.infer<typeof taskLifecycleInputSchema>;
export type TaskLifecycleOutput = z.infer<typeof taskLifecycleOutputSchema>;
export type CreateArtifactInput = z.infer<typeof createArtifactInputSchema>;
export type CreateArtifactOutput = z.infer<typeof createArtifactOutputSchema>;
export type MutateGovernanceInput = z.infer<typeof mutateGovernanceInputSchema>;
export type MutateGovernanceOutput = z.infer<
  typeof mutateGovernanceOutputSchema
>;
