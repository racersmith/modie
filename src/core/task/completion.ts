/**
 * Task completion and checklist progression domain services.
 * Implements ADR-6, RULE-21, RULE-22, and RULE-25.
 */

import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { parseArtifactFilename } from "../common/index.ts";
import { scanActiveTasks } from "../resolver/active-scanner.ts";
import {
  inspectGitDeletedTaskIds,
  runGit,
  runGitCommand,
} from "../resolver/git-inspector.ts";
import type { DiscoveredTask } from "../resolver/types.ts";
import { parseAcceptanceCriteria } from "./checklist.ts";
import { parseTaskMarkdown } from "./parser.ts";
import type { TaskArtifact } from "./types.ts";

export interface ResolveTaskOptions {
  /**
   * Root directory for active task scanning (defaults to process.cwd()).
   */
  cwd?: string;

  /**
   * Whether to allow resolving zombie tasks that were deleted in Git history.
   * Defaults to false per ADR-6 and RULE-21.
   */
  allowZombie?: boolean;
}

export interface CheckTaskItemOptions {
  /**
   * Root directory for active task scanning (defaults to process.cwd()).
   */
  cwd?: string;

  /**
   * Target checked state. Defaults to true (checked / complete).
   */
  completed?: boolean;
}

export interface CheckTaskItemResult {
  filepath: string;
  taskId: string;
  itemIndex: number;
  itemText: string;
  completed: boolean;
  totalItems: number;
  completedCount: number;
  allCompleted: boolean;
}

export interface CompleteTaskOptions {
  /**
   * Root directory for active task scanning (defaults to process.cwd()).
   */
  cwd?: string;

  /**
   * Whether to force completion even if some acceptance criteria remain unchecked.
   * Defaults to false per RULE-21 and RULE-22.
   */
  force?: boolean;

  /**
   * Whether to delete the task artifact file upon completion (enforcing RULE-21).
   * Defaults to true.
   */
  deleteArtifact?: boolean;

  /**
   * Whether to execute the atomic two-phase Git commit ceremony per ADR-6 and RULE-21.
   * Phase 1: feat: verify all acceptance criteria for TASK-<id>
   * Phase 2: chore(task): delete completed TASK-<id> artifact per RULE-21
   */
  commit?: boolean;

  /**
   * Whether to allow resolving zombie tasks without throwing an error.
   */
  allowZombie?: boolean;
}

export interface CompleteTaskResult {
  taskId: string;
  slug: string;
  filename: string;
  filepath: string;
  deleted: boolean;
  criteriaTotal: number;
  criteriaCompleted: number;
  incompleteCriteria: string[];
  commits?: {
    phase1?: string;
    phase2?: string;
  };
}

/**
 * Normalizes a task identifier input to match against task IDs or slugs.
 * Examples: "TASK-7-1" -> "7-1", "7-1" -> "7-1", "task-7" -> "7".
 */
export function normalizeTaskId(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^task-([A-Za-z0-9_-]+)$/i);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

/**
 * Scans active tasks on disk and detects any tasks whose IDs were previously deleted in Git history.
 */
export async function detectZombieTasks(
  cwd: string = process.cwd(),
): Promise<DiscoveredTask[]> {
  const activeTasks = await scanActiveTasks(cwd);
  const deletedIds = await inspectGitDeletedTaskIds(cwd);
  const deletedSet = new Set(deletedIds);
  return activeTasks.filter((t) => deletedSet.has(t.id));
}

/**
 * Asserts that a task ID was not previously deleted in Git history per ADR-6 and RULE-21.
 * Throws a descriptive Error if the task is a resurrected zombie task.
 */
export async function assertNotZombieTask(
  taskId: string,
  cwd: string = process.cwd(),
): Promise<void> {
  const normalized = normalizeTaskId(taskId);
  const deletedIds = await inspectGitDeletedTaskIds(cwd);
  if (deletedIds.includes(normalized)) {
    throw new Error(
      `Zombie task detected: Task "TASK-${normalized}" was previously completed and deleted in Git history per RULE-21. Resurrecting completed tasks is prohibited (ADR-6, RULE-21).`,
    );
  }
}

/**
 * Resolves a task identifier (path, task ID, or slug) to an active task file on disk.
 * Throws a descriptive Error if the task file cannot be resolved.
 */
export async function resolveTaskFile(
  taskIdentifier: string,
  options: ResolveTaskOptions = {},
): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const trimmed = taskIdentifier.trim();

  if (!trimmed) {
    throw new Error("Task identifier must not be empty.");
  }

  // 1. Direct path check (relative or absolute)
  const candidatePath = isAbsolute(trimmed) ? trimmed : resolve(cwd, trimmed);
  try {
    const fileStat = await stat(candidatePath);
    if (fileStat.isFile()) {
      const filename = basename(candidatePath);
      const parsedFilename = parseArtifactFilename(filename);
      if (parsedFilename && parsedFilename.subtype === "TASK" && !parsedFilename.isArchived) {
        if (!options.allowZombie) {
          await assertNotZombieTask(parsedFilename.id, cwd);
        }
        return candidatePath;
      }
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("Zombie task detected")) {
      throw error;
    }
    // Not a direct accessible file path; fall through to scanner
  }

  // 2. Scan active tasks on disk
  const activeTasks = await scanActiveTasks(cwd);
  const normalizedInput = normalizeTaskId(trimmed);

  // Exact ID match (case-insensitive)
  const matchById = activeTasks.find((t) => {
    return (
      t.id.toLowerCase() === normalizedInput.toLowerCase() ||
      `task-${t.id}`.toLowerCase() === trimmed.toLowerCase() ||
      t.id.toLowerCase() === trimmed.toLowerCase()
    );
  });

  if (matchById) {
    if (!options.allowZombie) {
      await assertNotZombieTask(matchById.id, cwd);
    }
    return matchById.filepath;
  }

  // Exact slug match (case-insensitive)
  const matchBySlug = activeTasks.find(
    (t) => t.slug.toLowerCase() === trimmed.toLowerCase(),
  );

  if (matchBySlug) {
    if (!options.allowZombie) {
      await assertNotZombieTask(matchBySlug.id, cwd);
    }
    return matchBySlug.filepath;
  }

  // Partial slug or substring match if unique
  const partialMatches = activeTasks.filter(
    (t) =>
      t.slug.toLowerCase().includes(trimmed.toLowerCase()) ||
      t.filename.toLowerCase().includes(trimmed.toLowerCase()),
  );

  if (partialMatches.length === 1 && partialMatches[0]) {
    if (!options.allowZombie) {
      await assertNotZombieTask(partialMatches[0].id, cwd);
    }
    return partialMatches[0].filepath;
  }

  if (partialMatches.length > 1) {
    const candidates = partialMatches.map((t) => `${t.id} (${t.slug})`).join(", ");
    throw new Error(
      `Ambiguous task identifier "${trimmed}". Matches multiple active tasks: ${candidates}. Please specify the full task ID or path.`,
    );
  }

  throw new Error(
    `Task "${trimmed}" was not found among active tasks on disk. Ensure the task exists and has not been deleted or completed per RULE-21.`,
  );
}

/**
 * Loads and parses an active task document by ID, slug, or file path.
 */
export async function getTask(
  taskIdentifier: string,
  options: ResolveTaskOptions = {},
): Promise<TaskArtifact> {
  const filepath = await resolveTaskFile(taskIdentifier, options);
  const content = await readFile(filepath, "utf8");
  return parseTaskMarkdown(content, filepath);
}

/**
 * Checks or unchecks an acceptance criteria item in a TASK markdown artifact.
 * Follows RULE-22 and preserves all surrounding markdown formatting and frontmatter.
 *
 * @param taskIdentifier Task ID (e.g. "TASK-7-1", "7-1"), slug, or filepath.
 * @param itemIndex 1-based index of the acceptance criteria item (e.g. 1 for first item).
 * @param options Options including desired completed state (default: true).
 */
export async function checkTaskItem(
  taskIdentifier: string,
  itemIndex: number,
  options: CheckTaskItemOptions = {},
): Promise<CheckTaskItemResult> {
  if (typeof itemIndex !== "number" || !Number.isInteger(itemIndex) || itemIndex < 1) {
    throw new Error(
      `Item index must be a positive integer (1-based index). Received: ${itemIndex}.`,
    );
  }

  const filepath = await resolveTaskFile(taskIdentifier, options);
  const content = await readFile(filepath, "utf8");
  const targetCompleted = options.completed ?? true;

  const lines = content.split("\n");
  let currentItemIndex = 0;
  let targetLineIndex = -1;
  let targetItemText = "";
  let inCriteriaSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (/^#\s+Acceptance Criteria\b/i.test(line)) {
      inCriteriaSection = true;
      continue;
    }

    if (inCriteriaSection && /^#\s+/.test(line)) {
      break;
    }

    if (inCriteriaSection) {
      const match = line.match(/^(\s*-\s*\[)([ xX])(\]\s*)(.+)$/);
      if (match && match[1] !== undefined && match[3] !== undefined && match[4] !== undefined) {
        currentItemIndex++;
        if (currentItemIndex === itemIndex) {
          targetLineIndex = i;
          targetItemText = match[4].trim();
          const newBox = targetCompleted ? "x" : " ";
          lines[i] = `${match[1]}${newBox}${match[3]}${match[4]}`;
          break;
        }
      }
    }
  }

  if (targetLineIndex === -1) {
    const filename = basename(filepath);
    const parsed = parseArtifactFilename(filename);
    const taskIdDisplay = parsed?.id ? `TASK-${parsed.id}` : filename;
    throw new Error(
      `Invalid item index ${itemIndex}. Task ${taskIdDisplay} has ${currentItemIndex} acceptance criteria item(s).`,
    );
  }

  const updatedContent = lines.join("\n");
  await writeFile(filepath, updatedContent, "utf8");

  const parsedUpdated = parseAcceptanceCriteria(updatedContent);
  const completedCount = parsedUpdated.filter((item) => item.completed).length;
  const totalItems = parsedUpdated.length;
  const allCompleted = totalItems > 0 && completedCount === totalItems;

  const filename = basename(filepath);
  const parsedFilename = parseArtifactFilename(filename);
  const taskId = parsedFilename?.id ?? "";

  return {
    filepath,
    taskId,
    itemIndex,
    itemText: targetItemText,
    completed: targetCompleted,
    totalItems,
    completedCount,
    allCompleted,
  };
}

/**
 * Completes an active TASK artifact.
 * Verifies that all acceptance criteria are completed per RULE-22.
 * Deletes the ephemeral task file from the working tree per RULE-21.
 * Optionally executes the atomic two-phase Git commit ceremony per ADR-6.
 *
 * @param taskIdentifier Task ID (e.g. "TASK-7-1", "7-1"), slug, or filepath.
 * @param options Options controlling force completion, artifact deletion, and Git commits.
 */
export async function completeTask(
  taskIdentifier: string,
  options: CompleteTaskOptions = {},
): Promise<CompleteTaskResult> {
  const cwd = options.cwd ?? process.cwd();
  const filepath = await resolveTaskFile(taskIdentifier, options);
  const content = await readFile(filepath, "utf8");
  const parsed = parseTaskMarkdown(content, filepath);

  const criteria = parsed.acceptanceCriteria ?? [];
  const incomplete = criteria.filter((c) => !c.completed).map((c) => c.text);
  const force = options.force ?? false;
  const deleteArtifact = options.deleteArtifact ?? true;
  const shouldCommit = Boolean(options.commit);

  if (criteria.length === 0 && !force) {
    throw new Error(
      `Cannot complete task ${parsed.id || "unnamed"}: Task declares no acceptance criteria checklist items. Per RULE-22, tasks must declare deliverables in an # Acceptance Criteria section.`,
    );
  }

  if (incomplete.length > 0 && !force) {
    const list = incomplete.map((item) => `  - [ ] ${item}`).join("\n");
    throw new Error(
      `Cannot complete task ${parsed.id}: ${incomplete.length} acceptance criteria remain unchecked.\n${list}\nPer RULE-21 and RULE-22, all acceptance criteria must be satisfied before completing a task (or pass --force).`,
    );
  }

  let commits: { phase1?: string; phase2?: string } | undefined;

  if (shouldCommit) {
    const isRepo = await runGit(["rev-parse", "--is-inside-work-tree"], cwd);
    if (!isRepo) {
      throw new Error(
        "Cannot execute two-phase Git commit: directory is not a git repository.",
      );
    }

    const relFilepath = relative(cwd, filepath);

    // If force is used and incomplete items exist, ensure criteria are checked on disk before Phase 1 commit
    if (incomplete.length > 0 && force) {
      const lines = content.split("\n");
      const updatedLines = lines.map((line) => {
        if (/^\s*-\s*\[\s*\]\s+/.test(line)) {
          return line.replace(/^(\s*-\s*\[)\s*(\]\s+)/, "$1x$2");
        }
        return line;
      });
      await writeFile(filepath, updatedLines.join("\n"), "utf8");
    }

    // Phase 1: Commit verified criteria state
    await runGitCommand(["add", relFilepath], cwd);

    const stagedDiff = await runGit(
      ["diff", "--cached", "--name-only", "--", relFilepath],
      cwd,
    );

    let phase1Hash: string | undefined;
    if (stagedDiff && stagedDiff.length > 0) {
      const phase1Msg = `feat: verify all acceptance criteria for TASK-${parsed.id}`;
      await runGitCommand(["commit", "-m", phase1Msg, "--", relFilepath], cwd);
      phase1Hash = (await runGitCommand(["rev-parse", "--short", "HEAD"], cwd)) || undefined;
    } else {
      phase1Hash = (await runGitCommand(["rev-parse", "--short", "HEAD"], cwd)) || undefined;
    }

    let phase2Hash: string | undefined;
    if (deleteArtifact) {
      // Phase 2: Commit artifact deletion
      await rm(filepath, { force: true });
      await runGitCommand(["add", "-u", "--", relFilepath], cwd);
      const phase2Msg = `chore(task): delete completed TASK-${parsed.id} artifact per RULE-21`;
      await runGitCommand(["commit", "-m", phase2Msg, "--", relFilepath], cwd);
      phase2Hash = (await runGitCommand(["rev-parse", "--short", "HEAD"], cwd)) || undefined;
    }

    commits = {
      phase1: phase1Hash,
      phase2: phase2Hash,
    };
  } else if (deleteArtifact) {
    await rm(filepath, { force: true });
  }

  const filename = basename(filepath);

  return {
    taskId: parsed.id,
    slug: parsed.slug,
    filename,
    filepath,
    deleted: deleteArtifact,
    criteriaTotal: criteria.length,
    criteriaCompleted: criteria.length - incomplete.length,
    incompleteCriteria: incomplete,
    commits,
  };
}

/**
 * Orchestrates the atomic two-phase Git commit ceremony for completing a task per ADR-6 and RULE-21.
 * Phase 1: Commits verified acceptance criteria (feat: verify all acceptance criteria for TASK-<id>).
 * Phase 2: Commits artifact deletion (chore(task): delete completed TASK-<id> artifact per RULE-21).
 */
export async function executeTwoPhaseTaskCommit(
  taskIdentifier: string,
  options: CompleteTaskOptions = {},
): Promise<CompleteTaskResult> {
  return completeTask(taskIdentifier, { ...options, commit: true });
}
