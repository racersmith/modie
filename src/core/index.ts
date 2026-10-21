/**
 * Modie Core: Governance engine and context compiler domain logic.
 * Public API exposed to interfaces (RULE-25).
 */

export * as TaskPrimitive from "./primitives/task/index.ts";
export * from "./primitives/task/types.ts";

export * as Resolver from "./resolver/index.ts";
export * from "./resolver/types.ts";

export {
  createTask,
  findDeepestCommonAncestor,
  resolveTaskDirectories,
  validateTaskScope,
} from "./task-creation.ts";
export type {
  CreateTaskOptions,
  CreateTaskResult,
} from "./task-creation.ts";

export {
  checkTaskItem,
  completeTask,
  getTask,
  normalizeTaskId,
  resolveTaskFile,
} from "./task-completion.ts";
export type {
  CheckTaskItemOptions,
  CheckTaskItemResult,
  CompleteTaskOptions,
  CompleteTaskResult,
  ResolveTaskOptions,
} from "./task-completion.ts";

