/**
 * Modie Core Domain Layer: Task Scope & Spatial Placement Invariant Validators.
 * Pure domain logic enforcing ADR-13, RULE-6, RULE-12, and RULE-38 with zero platform/engine dependencies.
 */

import { isAbsolute, relative, resolve } from "node:path";
import { findDeepestCommonAncestor } from "../common/directories.ts";

/**
 * Validates task placement constraints per RULE-6 and RULE-12.
 */
export function validateTaskScope(
  normalizedScopeDir: string,
  targetPaths: string[] = [],
  allowBroadScope: boolean = false,
  cwd: string = process.cwd(),
): void {
  if (targetPaths.length === 0) return;

  // 1. Downward blast radius check (RULE-6)
  for (const target of targetPaths) {
    const absTarget = resolve(cwd, target);
    const rel = relative(normalizedScopeDir, absTarget);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      throw new Error(
        `Downward blast radius violation: target path "${target}" escapes task scope directory "${normalizedScopeDir}".`,
      );
    }
  }

  // 2. Least scope placement check (RULE-12)
  if (!allowBroadScope) {
    const commonAncestor = findDeepestCommonAncestor(targetPaths, cwd);
    if (commonAncestor && commonAncestor !== normalizedScopeDir) {
      const relToAncestor = relative(normalizedScopeDir, commonAncestor);
      if (relToAncestor.length > 0 && !relToAncestor.startsWith("..")) {
        throw new Error(
          `Least scope placement violation: target paths share a deeper common ancestor "${commonAncestor}", but task was scoped at higher ancestor "${normalizedScopeDir}".`,
        );
      }
    }
  }
}

