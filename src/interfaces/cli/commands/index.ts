/**
 * Central index of all declared Modie interface commands and action definitions.
 * Serves as single source of truth for CLI dispatching and MCP tool auto-registration.
 */

import type { CliCommandDefinition } from "../framework/index.ts";
import { findCommand } from "./find/index.ts";
import { readCommand } from "./read/index.ts";
import { scopeCommand } from "./scope/index.ts";
import { contextCommand } from "./context/index.ts";
import { referencesCommandDefinition } from "./references/index.ts";
import { archiveCommand } from "./archive/index.ts";
import { linkCommand, unlinkCommand } from "./link/index.ts";
import {
  ruleCreateCommand,
  ruleArchiveCommand,
  ruleListCommand,
} from "./rule/index.ts";
import {
  adrCreateCommand,
  adrArchiveCommand,
  adrListCommand,
} from "./adr/index.ts";
import { motiveCreateCommand } from "./motive/index.ts";
import {
  taskCreateCommand,
  taskListCommand,
  taskStatusCommand,
  taskCheckCommand,
  taskStartCommand,
  taskCompleteCommand,
  taskMergeCommand,
} from "./task/index.ts";
import {
  sparkAddCommand,
  sparkListCommand,
  sparkPromoteCommand,
  sparkRejectCommand,
} from "./spark/index.ts";
import { mcpCommand } from "./mcp/index.ts";

export * from "./find/index.ts";
export * from "./read/index.ts";
export * from "./scope/index.ts";
export * from "./context/index.ts";
export * from "./references/index.ts";
export * from "./archive/index.ts";
export * from "./link/index.ts";
export * from "./rule/index.ts";
export * from "./adr/index.ts";
export * from "./motive/index.ts";
export * from "./task/index.ts";
export * from "./spark/index.ts";
export * from "./mcp/index.ts";

/**
 * Complete list of all registered declarative commands.
 * Every command in this list conforms to CliCommandDefinition with a Zod input schema.
 */
export const allCliCommands: CliCommandDefinition<any, any, any>[] = [
  findCommand,
  readCommand,
  scopeCommand,
  contextCommand,
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
  sparkAddCommand,
  sparkListCommand,
  sparkPromoteCommand,
  sparkRejectCommand,
  mcpCommand,
];
