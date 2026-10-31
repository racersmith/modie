/**
 * Central index of all declared Modie interface commands and action definitions.
 * Serves as single source of truth for CLI dispatching and MCP tool auto-registration.
 */

import type { CliCommandDefinition } from "../framework/index.ts";
import { findCommand, handleFind } from "./find/index.ts";
import { readCommand, handleRead } from "./read/index.ts";
import { scopeCommand, handleScope } from "./scope/index.ts";
import {
  referencesCommandDefinition,
  handleReferences,
} from "./references/index.ts";
import { archiveCommand, handleArchive } from "./archive/index.ts";
import {
  linkCommand,
  handleLink,
  unlinkCommand,
  handleUnlink,
} from "./link/index.ts";
import {
  ruleCreateCommand,
  handleRuleCreate,
  ruleArchiveCommand,
  handleRuleArchive,
  ruleListCommand,
  handleRuleList,
} from "./rule/index.ts";
import {
  adrCreateCommand,
  handleAdrCreate,
  adrArchiveCommand,
  handleAdrArchive,
  adrListCommand,
  handleAdrList,
} from "./adr/index.ts";
import {
  motiveCreateCommand,
  handleMotiveCreate,
} from "./motive/index.ts";
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
import { mcpCommand, handleMcp } from "./mcp/index.ts";

export * from "./find/index.ts";
export * from "./read/index.ts";
export * from "./scope/index.ts";
export * from "./references/index.ts";
export * from "./archive/index.ts";
export * from "./link/index.ts";
export * from "./rule/index.ts";
export * from "./adr/index.ts";
export * from "./motive/index.ts";
export * from "./task/index.ts";
export * from "./mcp/index.ts";

/**
 * Complete list of all registered declarative commands.
 * Every command in this list conforms to CliCommandDefinition with a Zod input schema.
 */
export const allCliCommands: CliCommandDefinition<any, any, any>[] = [
  findCommand,
  readCommand,
  scopeCommand,
  referencesCommandDefinition,
  archiveCommand,
  linkCommand,
  unlinkCommand,
  ruleCreateCommand,
  ruleListCommand,
  ruleArchiveCommand,
  adrCreateCommand,
  adrListCommand,
  adrArchiveCommand,
  motiveCreateCommand,
  taskCreateCommand,
  taskStartCommand,
  taskCheckCommand,
  taskCompleteCommand,
  taskMergeCommand,
  taskListCommand,
  taskStatusCommand,
  mcpCommand,
];
