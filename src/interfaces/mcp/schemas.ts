/**
 * Flat Zod schemas for the 11 singular Modie MCP agent tools.
 * Complies with RULE-25 (interface-core decoupling), RULE-26 (token economy),
 * and scratch/mcp-design.md specifications.
 */

import { z } from "zod";

// ============================================================================
// 1. Spatial & Artifact Exploration Tools
// ============================================================================

/**
 * Input schema for ls_better tool.
 * Plaintext tab-separated directory explorer with GISTs.
 */
export const lsBetterSchema = z.object({
  path: z
    .string()
    .optional()
    .describe(
      "Directory path to inspect (e.g. 'src/core/archival'). Defaults to active task scope or '.'",
    ),
});
export type LsBetterInput = z.infer<typeof lsBetterSchema>;

/**
 * Input schema for read_artifact tool.
 * Reads any governance artifact tag and returns pure markdown with an appendix.
 */
export const readArtifactSchema = z.object({
  tag: z
    .string()
    .describe(
      "Canonical artifact tag (e.g. 'RULE-<id>', 'ADR-<id>', 'TASK-<id>')",
    ),
});
export type ReadArtifactInput = z.infer<typeof readArtifactSchema>;

/**
 * Input schema for task_context tool.
 * Returns the active Mission Brief in pure markdown.
 */
export const taskContextSchema = z.object({
  task_id: z
    .string()
    .optional()
    .describe("Task tag or numeric ID (defaults to active git branch)"),
});
export type TaskContextInput = z.infer<typeof taskContextSchema>;

// ============================================================================
// 2. Task Lifecycle State Machine Tools
// ============================================================================

/**
 * Input schema for start_task tool.
 * Switches to/creates task branch and returns the Mission Brief in markdown.
 */
export const startTaskSchema = z.object({
  task_id: z
    .string()
    .optional()
    .describe("Task tag or numeric ID (defaults to active git branch)"),
});
export type StartTaskInput = z.infer<typeof startTaskSchema>;

/**
 * Input schema for check_criteria tool.
 * Atomically marks acceptance criteria complete or incomplete.
 */
export const checkCriteriaSchema = z.object({
  items: z
    .array(z.number().int().positive())
    .describe("1-based criteria indices to check or uncheck"),
  task_id: z
    .string()
    .optional()
    .describe("Task tag (defaults to active git branch)"),
  uncheck: z
    .boolean()
    .default(false)
    .describe("Marks specified criteria incomplete if true"),
});
export type CheckCriteriaInput = z.infer<typeof checkCriteriaSchema>;

export const checkCriteriaOutputSchema = z
  .object({
    taskId: z.string(),
    checkedItems: z.array(z.number()),
    progress: z.string(),
    allCriteriaSatisfied: z.boolean(),
    acceptanceCriteria: z.array(
      z.object({
        item: z.number(),
        text: z.string(),
        completed: z.boolean(),
      }),
    ),
  })
  .passthrough();
export type CheckCriteriaOutput = z.infer<typeof checkCriteriaOutputSchema>;

/**
 * Input schema for complete_task tool.
 * Verifies criteria, executes two-phase commit ceremony, merges to trunk, and deletes branch.
 */
export const completeTaskSchema = z.object({
  task_id: z
    .string()
    .optional()
    .describe("Task tag (defaults to active git branch)"),
});
export type CompleteTaskInput = z.infer<typeof completeTaskSchema>;

export const completeTaskOutputSchema = z
  .object({
    taskId: z.string(),
    merged: z.boolean(),
    targetBranch: z.string(),
    deletedBranch: z.string().describe("Name of the deleted task branch"),
    message: z.string(),
  })
  .passthrough();
export type CompleteTaskOutput = z.infer<typeof completeTaskOutputSchema>;

// ============================================================================
// 3. Dedicated Artifact Authoring Tools
// ============================================================================

/**
 * Input schema for create_rule tool.
 */
export const createRuleSchema = z.object({
  title: z.string().min(3).describe("Rule title"),
  invariant: z
    .string()
    .min(10)
    .describe("Core invariant assertion (single imperative sentence)"),
  links: z
    .array(z.string())
    .optional()
    .describe("Justifying ancestor ADR tags"),
  scope_dir: z
    .string()
    .optional()
    .describe(
      "Architectural directory scope (defaults to active task scope or '.')",
    ),
  supersedes: z
    .string()
    .optional()
    .describe("Prior rule tag that this rule supersedes"),
});
export type CreateRuleInput = z.infer<typeof createRuleSchema>;

/**
 * Input schema for create_adr tool.
 */
export const createAdrSchema = z.object({
  title: z.string().min(3).describe("Decision title"),
  decision: z
    .string()
    .min(10)
    .describe("Adopted architectural decision"),
  context: z
    .string()
    .optional()
    .describe("Problem statement and motivating context"),
  consequences: z
    .string()
    .optional()
    .describe("Positive outcomes, risks, and trade-offs"),
  links: z
    .array(z.string())
    .optional()
    .describe("Linked descendant rules or ancestor ADRs"),
  scope_dir: z
    .string()
    .optional()
    .describe("Architectural directory scope"),
  supersedes: z
    .string()
    .optional()
    .describe("Prior ADR tag superseded by this decision"),
});
export type CreateAdrInput = z.infer<typeof createAdrSchema>;

/**
 * Input schema for create_task tool.
 */
export const createTaskSchema = z.object({
  title: z.string().min(3).describe("Task title"),
  summary: z
    .string()
    .optional()
    .describe("Concise 1-2 sentence summary of task intent for triage queues"),
  acceptance_criteria: z
    .array(z.string())
    .min(1)
    .describe(
      "List of contract-based acceptance criteria (must end with User Review)",
    ),
  context: z
    .string()
    .optional()
    .describe("Task mission and technical context"),
  depends_on: z
    .array(z.string())
    .optional()
    .describe("Prerequisite task tags"),
  links: z
    .array(z.string())
    .optional()
    .describe("Governing RULE and ADR tags"),
  scope_dir: z
    .string()
    .optional()
    .describe("Blast radius root directory"),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const createArtifactOutputSchema = z
  .object({
    tag: z.string().describe("Created artifact tag (e.g. 'RULE-XXXX')"),
    kind: z.string(),
    filepath: z.string(),
    relativePath: z.string(),
    scope: z.string(),
    validatedLinks: z.array(z.string()).optional(),
  })
  .passthrough();
export type CreateArtifactOutput = z.infer<typeof createArtifactOutputSchema>;

// ============================================================================
// 4. Graph Mutation Tools
// ============================================================================

/**
 * Input schema for link_artifacts tool.
 */
export const linkArtifactsSchema = z.object({
  targets: z
    .array(z.string())
    .min(1)
    .describe("Target artifact tags to link"),
  source: z
    .string()
    .optional()
    .describe("Source artifact tag (defaults to active task branch)"),
});
export type LinkArtifactsInput = z.infer<typeof linkArtifactsSchema>;

export const linkArtifactsOutputSchema = z
  .object({
    source: z.string(),
    targets: z.array(z.string()),
    relationship: z.string(),
    added: z.array(z.string()),
  })
  .passthrough();
export type LinkArtifactsOutput = z.infer<typeof linkArtifactsOutputSchema>;

/**
 * Input schema for archive_artifact tool.
 */
export const archiveArtifactSchema = z.object({
  tag: z.string().describe("Tag of the RULE or ADR to archive"),
  reason: z.string().optional().describe("Optional archival rationale"),
});
export type ArchiveArtifactInput = z.infer<typeof archiveArtifactSchema>;

export const archiveArtifactOutputSchema = z
  .object({
    tag: z.string(),
    archivedPath: z.string(),
    reason: z.string().optional(),
  })
  .passthrough();
export type ArchiveArtifactOutput = z.infer<typeof archiveArtifactOutputSchema>;
