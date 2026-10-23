/**
 * Modie Core: Governance engine and context compiler domain logic.
 * Public API exposed to interfaces (RULE-25).
 */

// Common primitive utilities & types
export * as CommonPrimitive from "./common/index.ts";
export * from "./common/types.ts";
export {
  formatArtifactFilename,
  parseArtifactFilename,
  isArtifactFilename,
  isValidArtifactId,
  isRegisteredArtifactSubtype,
  registerArtifactSubtype,
  resetRegisteredArtifactSubtypes,
} from "./common/filename.ts";
export { generateSlug, isValidSlug } from "./common/slug.ts";
export {
  findDeepestCommonAncestor,
  getLegacySubtypeContainerName,
  getSubtypeContainerName,
  resolveArtifactDirectories,
} from "./common/directories.ts";

// Declarative artifact pipeline module
export * as PipelinePrimitive from "./pipeline/index.ts";
export * from "./pipeline/types.ts";
export {
  createArtifact,
  updateSupersededArtifactFrontmatter,
  ruleDefinition,
  adrDefinition,
  taskDefinition,
} from "./pipeline/index.ts";
export type { UpdateSupersededFrontmatterOptions } from "./pipeline/index.ts";

// Task domain module
export * as TaskPrimitive from "./task/index.ts";
export * from "./task/types.ts";
export {
  createTask,
  resolveTaskDirectories,
  validateTaskScope,
} from "./task/creation.ts";
export {
  assertNotZombieTask,
  checkTaskItem,
  completeTask,
  detectZombieTasks,
  executeTwoPhaseTaskCommit,
  getTask,
  normalizeTaskId,
  resolveTaskFile,
} from "./task/completion.ts";
export type {
  CheckTaskItemOptions,
  CheckTaskItemResult,
  CompleteTaskOptions,
  CompleteTaskResult,
  ResolveTaskOptions,
} from "./task/completion.ts";
export {
  compareTaskIds,
  getTaskStatus,
  parseTaskIdFromBranch,
  queryTaskQueue,
  resolveCurrentTask,
} from "./task/query.ts";
export type {
  TaskQueueItem,
  TaskQueueQueryOptions,
  TaskReadiness,
  TaskStatusDetails,
} from "./task/query.ts";
export {
  branchExists,
  computeTaskBranchTopology,
  formatTaskBranchName,
  mergeTaskBranch,
  parseSubtaskId,
  startTaskBranch,
} from "./task/branching.ts";
export type {
  MergeTaskBranchOptions,
  MergeTaskBranchResult,
  StartTaskBranchOptions,
  StartTaskBranchResult,
  TaskBranchTopology,
} from "./task/types.ts";

// Rule domain module
export * as RulePrimitive from "./rule/index.ts";
export * from "./rule/types.ts";
export { renderRuleMarkdown, validateRuleLinks } from "./rule/template.ts";
export {
  createRule,
  resolveRuleDirectories,
  validateRuleAncestry,
} from "./rule/creation.ts";

// Query & inspection domain module
export * as QueryPrimitive from "./query/index.ts";
export * from "./query/types.ts";
export { findArtifactReferences } from "./query/references.ts";
export {
  getArtifactDetails,
  parseCanonicalTag,
  resolveArtifactByTag,
} from "./query/artifact-query.ts";
export type {
  ArtifactDetails,
  ResolveArtifactOptions,
  ResolvedArtifact,
} from "./query/artifact-query.ts";

// ADR domain module
export * as AdrPrimitive from "./adr/index.ts";
export * from "./adr/types.ts";
export { renderAdrMarkdown, validateAdrLinks } from "./adr/template.ts";
export {
  createAdr,
  resolveAdrDirectories,
  validateAdrScope,
} from "./adr/creation.ts";
export { archiveAdr } from "./adr/archive.ts";
export type { ArchiveAdrOptions } from "./adr/archive.ts";

// Archival domain module (RULE-31)
export * as ArchivalPrimitive from "./archival/index.ts";
export * from "./archival/types.ts";
export { archiveArtifact } from "./archival/archive.ts";

// Rule domain archive export
export { archiveRule } from "./rule/archive.ts";
export type { ArchiveRuleOptions } from "./rule/archive.ts";

// Resolver & scan domain module
export * as Resolver from "./resolver/index.ts";
export * from "./resolver/types.ts";
export {
  runGit,
  runGitCommand,
  detectGitBranch,
  listGitBranches,
  inspectGitTreeArtifacts,
  inspectMultiBranchActiveArtifacts,
  inspectMultiBranchActiveArtifactIds,
} from "./resolver/git-inspector.ts";
export {
  scanActiveArtifacts,
  scanActiveTasks,
} from "./resolver/active-scanner.ts";

// Configuration domain module
export * as ConfigPrimitive from "./config/index.ts";
export * from "./config/types.ts";
export {
  DEFAULT_PROTECTED_BRANCHES,
  DEFAULT_TRUNK_BRANCH,
  findModieConfigFile,
  loadModieConfig,
} from "./config/loader.ts";
