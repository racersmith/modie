/**
 * Central index of all declared Modie interface commands and action definitions.
 * Serves as single source of truth for CLI dispatching and MCP tool auto-registration.
 */

import type { CliCommandDefinition } from "../framework/index.ts";
import { findCommand, handleFind } from "./find/index.ts";
import { showCommand, handleShow } from "./show/index.ts";
import {
  referencesCommandDefinition,
  handleReferences,
} from "./references/index.ts";
import { ruleCreateCommand, handleRuleCreate } from "./rule/index.ts";
import { adrCreateCommand, handleAdrCreate } from "./adr/index.ts";
import {
  taskCreateCommand,
  handleTaskCreate,
  taskListCommand,
  handleTaskList,
  taskStatusCommand,
  handleTaskStatus,
  taskCheckCommand,
  handleTaskCheck,
  taskStartCommand,
  handleTaskStart,
  taskCompleteCommand,
  handleTaskComplete,
  taskMergeCommand,
  handleTaskMerge,
} from "./task/index.ts";

export * from "./find/index.ts";
export * from "./show/index.ts";
export * from "./references/index.ts";
export * from "./rule/index.ts";
export * from "./adr/index.ts";
export * from "./task/index.ts";

/**
 * Complete list of all registered declarative commands.
 * Every command in this list conforms to CliCommandDefinition with a Zod input schema.
 */
export const allCliCommands: CliCommandDefinition<any, any, any>[] = [
  findCommand,
  showCommand,
  referencesCommandDefinition,
  ruleCreateCommand,
  adrCreateCommand,
  taskCreateCommand,
  taskListCommand,
  taskStatusCommand,
  taskCheckCommand,
  taskStartCommand,
  taskCompleteCommand,
  taskMergeCommand,
];
