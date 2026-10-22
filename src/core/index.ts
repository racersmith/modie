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
} from "./common/filename.ts";
export {
  generateSlug,
  isValidSlug,
} from "./common/slug.ts";
export {
  findDeepestCommonAncestor,
  getSubtypeContainerName,
  resolveArtifactDirectories,
} from "./common/directories.ts";

// Task domain module
export * as TaskPrimitive from "./task/index.ts";
export * from "./task/types.ts";
export {
  createTask,
  resolveTaskDirectories,
  validateTaskScope,
} from "./task/creation.ts";
export type {
  CreateTaskOptions,
  CreateTaskResult,
} from "./task/creation.ts";
export {
  checkTaskItem,
  completeTask,
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
  queryTaskQueue,
} from "./task/query.ts";
export type {
  TaskQueueItem,
  TaskQueueQueryOptions,
  TaskReadiness,
  TaskStatusDetails,
} from "./task/query.ts";

// Rule domain module
export * as RulePrimitive from "./rule/index.ts";
export * from "./rule/types.ts";
export {
  renderRuleMarkdown,
  validateRuleLinks,
} from "./rule/template.ts";
export {
  createRule,
  resolveRuleDirectories,
  validateRuleAncestry,
} from "./rule/creation.ts";
export type {
  CreateRuleOptions,
  CreateRuleResult,
} from "./rule/creation.ts";

// Query & inspection domain module
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
export {
  renderAdrMarkdown,
  validateAdrLinks,
} from "./adr/template.ts";
export {
  createAdr,
  resolveAdrDirectories,
  validateAdrScope,
} from "./adr/creation.ts";
export type {
  CreateAdrOptions,
  CreateAdrResult,
} from "./adr/creation.ts";

// Resolver & scan domain module
export * as Resolver from "./resolver/index.ts";
export * from "./resolver/types.ts";
