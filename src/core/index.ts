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
  getSubtypeContainerName,
  resolveArtifactDirectories,
  resolveGoverningScope,
  type GoverningScope,
} from "./common/directories.ts";

// Declarative artifact pipeline module
export * as PipelinePrimitive from "./pipeline/index.ts";
export * from "./pipeline/types.ts";
export {
  buildArtifactParseContext,
  createArtifact,
  getArtifactDefinition,
  parseArtifact,
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
  queryTaskHistory,
  queryTaskQueue,
  resolveCurrentTask,
} from "./task/query.ts";
export type {
  TaskQueueItem,
  TaskQueueQueryOptions,
  TaskReadiness,
  TaskStatusDetails,
  TaskStatusQueryOptions,
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
export {
  parseRuleFromContext,
  parseRuleMarkdown,
  renderRuleMarkdown,
  validateRuleLinks,
} from "./rule/template.ts";
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
  computeAncestralScopes,
  resolveScope,
} from "./query/scope.ts";
export {
  compileContext,
  formatCompiledContextMarkdown,
} from "./query/context.ts";
export {
  getArtifactDetails,
  parseCanonicalTag,
  resolveArtifactByTag,
} from "./query/artifact-query.ts";
export {
  compareArtifactIds,
  listActiveArtifacts,
  listAdrs,
  listRules,
} from "./query/artifact-list.ts";
export {
  extractAdrSummary,
  parseFrontmatterFields,
  parseFrontmatterLineMap,
  parseMarkdownDocument,
  parseMarkdownSections,
  splitMarkdownFrontmatter,
} from "./query/markdown-parser.ts";

// ADR domain module
export * as AdrPrimitive from "./adr/index.ts";
export * from "./adr/types.ts";
export {
  parseAdrFromContext,
  parseAdrMarkdown,
  renderAdrMarkdown,
  validateAdrLinks,
} from "./adr/template.ts";
export {
  createAdr,
  resolveAdrDirectories,
  validateAdrScope,
  type AdrDefinition,
} from "./adr/creation.ts";
export { archiveAdr } from "./adr/archive.ts";
export type { ArchiveAdrOptions } from "./adr/archive.ts";

// GIST domain module (ADR-2, ADR-4, ADR-8, ADR-10, RULE-9, RULE-20)
export * as GistPrimitive from "./gist/index.ts";
export * from "./gist/types.ts";
export {
  DIRECTORY_GIST_FILENAME,
  FILE_GIST_SUFFIX,
  GISTS_CONTAINER_DIR,
  GIST_LEDGER_FILENAME,
  formatFileGistFilename,
  isDirectoryGistFilename,
  isFileGistFilename,
  parseFileGistFilename,
  resolveDirectoryGistPath,
  resolveFileGistPath,
  resolveGistPaths,
} from "./gist/paths.ts";
export {
  discoverChildSignposts,
  discoverGistsForScope,
  readDirectoryGist,
  readFileGist,
  readLocalGists,
} from "./gist/reader.ts";

// MOTIVE domain module (ADR-2, ADR-4, ADR-10, RULE-2, RULE-8, RULE-10, RULE-12)
export * as MotivePrimitive from "./motive/index.ts";
export * from "./motive/types.ts";
export {
  MOTIVE_FILENAME,
  resolveMotivePath,
  resolveMotivePaths,
} from "./motive/paths.ts";
export {
  renderMotiveMarkdown,
  renderMotiveTemplate,
  validateMotiveContent,
} from "./motive/template.ts";
export { createMotive } from "./motive/creation.ts";
export {
  collectAncestralMotives,
  readMotive,
} from "./motive/reader.ts";

// Archival domain module (RULE-31)
export * as ArchivalPrimitive from "./archival/index.ts";
export * from "./archival/types.ts";
export { archiveArtifact } from "./archival/archive.ts";

// Rule domain archive export
export { archiveRule } from "./rule/archive.ts";
export type { ArchiveRuleOptions } from "./rule/archive.ts";

// Linking & graph invariant validation domain module (ADR-5, RULE-36)
export * as LinkingPrimitive from "./linking/index.ts";
export * from "./linking/types.ts";
export {
  detectTaskDependencyCycle,
  inferLinkRelationship,
  validateArtifactLink,
} from "./linking/validator.ts";
export {
  linkArtifact,
  mutateFrontmatterListField,
  unlinkArtifact,
} from "./linking/mutation.ts";

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

// VCS domain module
export * as Vcs from "./vcs/index.ts";
export * from "./vcs/types.ts";
export {
  GitCliAdapter,
  defaultVcsAdapter,
  MockVcsAdapter,
} from "./vcs/index.ts";
export type { MockVcsOptions } from "./vcs/index.ts";
