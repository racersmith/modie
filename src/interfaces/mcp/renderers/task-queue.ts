/**
 * Ready Tasks Queue & Workspace Backlog Markdown Renderers.
 * Implements RULE-25 and RULE-26.
 */

import { dirname } from "node:path";
import type { TaskQueueItem } from "../../../core/index.ts";

/**
 * Extracts normalized scope directory from a task relative path.
 * E.g., "src/interfaces/mcp/.modie/tasks/my-task.TASK-1.md" -> "src/interfaces/mcp"
 * or ".modie/tasks/root.TASK-2.md" -> "."
 */
export function extractTaskScope(relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/");
  const modieTasksIndex = normalized.indexOf("/.modie/tasks/");
  if (modieTasksIndex !== -1) {
    const scope = normalized.slice(0, modieTasksIndex);
    return scope === "" ? "." : scope;
  }
  if (normalized.startsWith(".modie/tasks/")) {
    return ".";
  }
  const dir = dirname(relPath);
  return dir === "." ? "." : dir;
}

/**
 * Extracts a concise 1-sentence summary or teaser from a task's context markdown.
 */
export function extractTaskSummary(context?: string): string {
  if (!context) return "";
  const trimmed = context.trim();
  if (!trimmed) return "";
  const firstParagraph = trimmed.split(/\n\s*\n/)[0]?.trim() || "";
  const clean = firstParagraph.replace(/^[#*>-]+\s*/, "").trim();
  const match = clean.match(/^.*?[.!?](?:\s|$)/);
  if (match && match[0]) {
    return match[0].trim();
  }
  return clean.length > 140 ? `${clean.slice(0, 137)}...` : clean;
}

/**
 * Builds a downstream reverse dependency map (Blocks) from a list of tasks.
 */
export function buildBlocksMap(tasks: TaskQueueItem[]): Map<string, string[]> {
  const blocksMap = new Map<string, string[]>();
  const knownTags = new Set(tasks.map((t) => t.fullTaskId));
  const idToTag = new Map(tasks.map((t) => [t.id, t.fullTaskId]));

  for (const task of tasks) {
    for (const dep of task.depends_on) {
      const canonicalDep = knownTags.has(dep)
        ? dep
        : (idToTag.get(dep) ?? (dep.startsWith("TASK-") ? dep : `TASK-${dep}`));
      if (!blocksMap.has(canonicalDep)) {
        blocksMap.set(canonicalDep, []);
      }
      const list = blocksMap.get(canonicalDep)!;
      if (!list.includes(task.fullTaskId)) {
        list.push(task.fullTaskId);
      }
    }
  }
  return blocksMap;
}

/**
 * Renders a condensed, actionable Markdown triage queue of ready tasks
 * with summary teasers and downstream leverage (Blocks).
 */
export function renderReadyTasks(
  readyTasks: TaskQueueItem[],
  allTasks?: TaskQueueItem[],
): string {
  if (readyTasks.length === 0) {
    return (
      "# Ready Tasks Queue\n\n" +
      "No tasks are currently ready for execution. Inspect `modie://tasks/all` to see blocked tasks and their dependencies, or use `create_task` to author a new task.\n"
    );
  }

  const blocksMap = buildBlocksMap(allTasks ?? readyTasks);
  const count = readyTasks.length;
  const parts: string[] = [
    "# Ready Tasks Queue",
    "",
    `${count} task${count === 1 ? "" : "s"} unblocked and ready for execution. Use \`start_task\` to begin a task.`,
    "",
  ];

  for (const task of readyTasks) {
    const scope = extractTaskScope(task.relativePath);
    const criteriaCount =
      task.criteriaTotal || task.acceptanceCriteria?.length || 0;
    const blocks = blocksMap.get(task.fullTaskId) ?? [];
    const summary = task.summary ?? extractTaskSummary(task.context);
    const inProgressBadge = task.isCurrent ? " [In Progress]" : "";

    parts.push(
      `- **${task.fullTaskId}**${inProgressBadge} (${criteriaCount} criteria) \`${scope}\``,
    );
    parts.push(`  *Title*: ${task.title}`);
    if (summary) {
      parts.push(`  *Summary*: ${summary}`);
    }
    if (blocks.length > 0) {
      parts.push(`  *Blocks*: ${blocks.join(", ")}`);
    }
  }

  return parts.join("\n") + "\n";
}

/**
 * Renders a condensed, agent-optimized Markdown backlog of all workspace tasks,
 * grouped by status (In Progress, Ready, Blocked) with dependency blockers
 * and downstream leverage (Blocks).
 */
export function renderTasksBacklog(tasks: TaskQueueItem[]): string {
  if (tasks.length === 0) {
    return "# Workspace Tasks Backlog\n\nNo active tasks found in the workspace. Use `create_task` to create one.\n";
  }

  const blocksMap = buildBlocksMap(tasks);

  const inProgress: TaskQueueItem[] = [];
  const ready: TaskQueueItem[] = [];
  const blocked: TaskQueueItem[] = [];

  for (const task of tasks) {
    if (task.isCurrent) {
      inProgress.push(task);
    } else if (task.readiness === "READY") {
      ready.push(task);
    } else {
      blocked.push(task);
    }
  }

  const parts: string[] = [
    "# Workspace Tasks Backlog",
    "",
    `Total: ${tasks.length} task${tasks.length === 1 ? "" : "s"} (${inProgress.length} in progress, ${ready.length} ready, ${blocked.length} blocked)`,
    "",
  ];

  const renderSection = (
    heading: string,
    items: TaskQueueItem[],
    emptyMessage: string,
  ) => {
    parts.push(`## ${heading}`);
    if (items.length === 0) {
      parts.push(emptyMessage, "");
      return;
    }
    for (const item of items) {
      const scope = extractTaskScope(item.relativePath);
      const blocks = blocksMap.get(item.fullTaskId) ?? [];
      const blocksStr = blocks.join(", ");

      parts.push(
        `- **${item.fullTaskId}** (${item.criteriaProgress} criteria) \`${scope}\``,
      );
      parts.push(`  *Title*: ${item.title}`);
      if (item.blockedBy && item.blockedBy.length > 0) {
        parts.push(`  *Blocked by*: ${item.blockedBy.join(", ")}`);
      }
      if (blocks.length > 0) {
        parts.push(`  *Blocks*: ${blocksStr}`);
      }
    }
    parts.push("");
  };

  renderSection("In Progress", inProgress, "No task currently in progress.");
  renderSection("Ready (Unblocked)", ready, "No ready tasks.");
  renderSection("Blocked", blocked, "No blocked tasks.");

  return parts.join("\n").trimEnd() + "\n";
}
