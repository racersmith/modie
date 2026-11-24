/**
 * Markdown Mission Brief Renderer for `task_context`, `start_task`, and `modie://task`.
 * Implements RULE-6, RULE-25, and RULE-26.
 */

import { dirname } from "node:path";
import {
  collectAncestralMotives,
  resolveGoverningScope,
  type TaskAcceptanceCriteriaItem,
  type TaskQueueItem,
  type TaskStatusDetails,
} from "../../../core/index.ts";
import { extractMotiveSummary, resolveArtifactSummary } from "./artifact.ts";

function resolveTaskScope(
  filepath: string | undefined,
  relativePath: string,
  cwd: string,
): string {
  if (!filepath) return ".";
  try {
    return resolveGoverningScope(filepath, cwd).relativeScope;
  } catch {
    return dirname(relativePath).replace(/\/\.modie\/tasks$/, "") || ".";
  }
}

function formatMissionBriefHeader(
  taskDetails: TaskStatusDetails | TaskQueueItem,
  activeBranch: string | null | undefined,
  scope: string,
): string[] {
  const taskTag =
    taskDetails.fullTaskId ||
    (taskDetails.id.startsWith("TASK-")
      ? taskDetails.id
      : `TASK-${taskDetails.id}`);

  const branchName =
    activeBranch ??
    taskDetails.branch ??
    `task/${taskDetails.id}-${taskDetails.slug}`;

  const criteriaTotal =
    taskDetails.criteriaTotal ?? taskDetails.acceptanceCriteria?.length ?? 0;
  const criteriaCompleted =
    taskDetails.criteriaCompleted ??
    taskDetails.acceptanceCriteria?.filter((c) => c.completed).length ??
    0;
  const progressText = `${criteriaCompleted}/${criteriaTotal} criteria satisfied`;

  const blastRadiusAlert =
    scope === "." || scope === ""
      ? "All modifications, new files, and tests must reside strictly within the workspace root or its subdirectories."
      : `All modifications, new files, and tests must reside strictly within \`${scope}/\` or its subdirectories. Never edit files in sibling or ancestor directories.`;

  const originBranch =
    "baseBranch" in taskDetails ? taskDetails.baseBranch : undefined;
  const targetBranch =
    "targetBranch" in taskDetails ? taskDetails.targetBranch : undefined;
  let branchLine = `**Active Branch**: \`${branchName}\`  `;
  if (originBranch && targetBranch && originBranch !== targetBranch) {
    branchLine = `**Active Branch**: \`${branchName}\` | **Origin**: \`${originBranch}\` | **Merge Target**: \`${targetBranch}\`  `;
  } else if (targetBranch ?? originBranch) {
    branchLine = `**Active Branch**: \`${branchName}\` | **Origin / Merge Target**: \`${targetBranch ?? originBranch}\`  `;
  }

  return [
    `# Mission Brief: ${taskTag}`,
    "",
    `**Title**: ${taskDetails.title}  `,
    branchLine,
    `**Scope**: \`${scope}\` | **Progress**: ${progressText}  `,
    "",
    "> **BLAST RADIUS CONSTRAINT**  ",
    `> ${blastRadiusAlert}`,
  ];
}

function formatMissionBriefCriteria(
  criteriaList?: TaskAcceptanceCriteriaItem[],
): string[] {
  const parts: string[] = ["", "---", "", "## Acceptance Criteria", ""];
  const criteria =
    criteriaList && criteriaList.length > 0
      ? criteriaList
      : [{ text: "Complete task requirements", completed: false }];

  for (let i = 0; i < criteria.length; i++) {
    const item = criteria[i]!;
    const mark = item.completed ? "x" : " ";
    parts.push(`- [${mark}] ${i + 1}. ${item.text}`);
  }
  return parts;
}

async function formatMissionBriefInvariants(
  links: string[] | undefined,
  cwd: string,
): Promise<string[]> {
  if (!links || links.length === 0) return [];
  const resolvedLinks = await Promise.all(
    links.map((tag) => resolveArtifactSummary(tag, cwd)),
  );
  const parts: string[] = [
    "",
    "---",
    "",
    "## Governing Architectural Invariants",
    "Modifications under this task must strictly adhere to the following rules:",
  ];
  for (const rule of resolvedLinks) {
    const slugPart = rule.slug ? ` (\`${rule.slug}\`)` : "";
    parts.push(`- **${rule.tag}**${slugPart}: ${rule.invariantOrSummary}`);
  }
  return parts;
}

async function formatMissionBriefDependencies(
  dependsOn: string[] | undefined,
  cwd: string,
): Promise<string[]> {
  if (!dependsOn || dependsOn.length === 0) return [];
  const resolvedDeps = await Promise.all(
    dependsOn.map((tag) => resolveArtifactSummary(tag, cwd)),
  );
  const parts: string[] = ["", "---", "", "## Prerequisites & Dependencies"];
  for (const dep of resolvedDeps) {
    parts.push(`- **${dep.tag}**: ${dep.invariantOrSummary}`);
  }
  return parts;
}

async function formatMissionBriefMotives(
  scope: string,
  cwd: string,
): Promise<string[]> {
  try {
    const motives = await collectAncestralMotives(scope, cwd);
    if (motives.length === 0) return [];
    const parts: string[] = ["", "---", "", "## Architectural Intent (Motives)"];
    for (const m of motives) {
      const summary = extractMotiveSummary(m.content);
      parts.push(`- **\`${m.scope}\`**: ${summary}`);
    }
    return parts;
  } catch {
    return [];
  }
}

/**
 * Renders a task into a high-signal Markdown Mission Brief.
 * Elevated blast radius constraint (RULE-6), numbered checklist, and governing invariants.
 */
export async function renderTaskMissionBrief(
  taskDetails: TaskStatusDetails | TaskQueueItem,
  activeBranch?: string | null,
  cwd: string = process.cwd(),
): Promise<string> {
  const scope = resolveTaskScope(taskDetails.filepath, taskDetails.relativePath, cwd);
  const parts: string[] = formatMissionBriefHeader(taskDetails, activeBranch, scope);

  if (taskDetails.context && taskDetails.context.trim().length > 0) {
    parts.push("", "---", "", "## Context", "", taskDetails.context.trim());
  }

  parts.push(...formatMissionBriefCriteria(taskDetails.acceptanceCriteria));

  const invariants = await formatMissionBriefInvariants(taskDetails.links, cwd);
  parts.push(...invariants);

  const deps = await formatMissionBriefDependencies(taskDetails.depends_on, cwd);
  parts.push(...deps);

  const motives = await formatMissionBriefMotives(scope, cwd);
  parts.push(...motives);

  return parts.join("\n") + "\n";
}
