/**
 * Domain handlers for the 4 consolidated Modie MCP tools.
 * Exclusively consumes pure domain logic from src/core/ public API (RULE-25).
 * Implements token economy and progressive disclosure (RULE-26).
 */

import { dirname } from "node:path";
import {
  archiveArtifact,
  checkTaskItem,
  compileContext,
  completeTask,
  createAdr,
  createArtifact,
  createMotive,
  createRule,
  createTask,
  detectGitBranch,
  findArtifactReferences,
  getArtifactDetails,
  getTaskStatus,
  linkArtifact,
  mergeTaskBranch,
  normalizeTaskId,
  parseTaskIdFromBranch,
  resolveGoverningScope,
  resolveScope,
  startTaskBranch,
  unlinkArtifact,
} from "../../core/index.ts";
import type {
  CompileContextInput,
  CompileContextOutput,
  CreateArtifactInput,
  CreateArtifactOutput,
  MutateGovernanceInput,
  MutateGovernanceOutput,
  TaskLifecycleInput,
  TaskLifecycleOutput,
} from "./schemas.ts";
import { McpToolError } from "./errors.ts";

/**
 * Resolves the active task ID from an explicit argument or falls back to the current Git branch.
 */
export async function resolveActiveTaskId(
  explicitId: string | undefined,
  cwd: string,
): Promise<string> {
  if (explicitId && explicitId.trim().length > 0) {
    return explicitId.trim();
  }
  const branch = await detectGitBranch(cwd);
  if (branch) {
    const fromBranch = parseTaskIdFromBranch(branch);
    if (fromBranch) {
      return fromBranch;
    }
  }
  throw McpToolError.invalidParameter({
    message: `No task_id specified and active Git branch "${branch ?? "unknown"}" is not a task branch.`,
    parameter: "task_id",
    tool: "modie_task_lifecycle",
    suggestedParameters: { action: "start", task_id: "<TASK_ID>" },
  });
}

/**
 * Resolves the context target, inferring from active task branch if target was omitted.
 */
export async function resolveContextTarget(
  explicitTarget: string | undefined,
  cwd: string,
): Promise<string> {
  if (explicitTarget && explicitTarget.trim().length > 0) {
    return explicitTarget.trim();
  }
  const branch = await detectGitBranch(cwd);
  if (branch) {
    const fromBranch = parseTaskIdFromBranch(branch);
    if (fromBranch) {
      return normalizeTaskId(fromBranch);
    }
  }
  return ".";
}

/**
 * 1. modie_compile_context handler
 */
export async function handleCompileContext(
  args: CompileContextInput,
  cwd: string,
): Promise<CompileContextOutput> {
  const target = await resolveContextTarget(args.target, cwd);
  const mode = args.mode ?? "context";
  const detailLevel = args.detail_level ?? "gist";

  if (mode === "inspect") {
    const details = await getArtifactDetails(target, { cwd });
    const referencesResult = await findArtifactReferences(details.tag, { cwd });

    const allFound = [
      ...referencesResult.foundIn.governanceLinks,
      ...referencesResult.foundIn.governanceProse,
      ...referencesResult.foundIn.code,
      ...referencesResult.foundIn.tests,
      ...referencesResult.foundIn.documentation,
    ];

    const referencedBy = allFound.map((r) => ({
      tag: r.sourceTag ?? r.relativePath,
      sourceTag: r.sourceTag,
      subtype: r.type,
      scope: r.relativePath ? dirname(r.relativePath) : ".",
      filepath: r.relativePath ?? r.filepath,
      line: r.line,
    }));

    const result: CompileContextOutput = {
      mode: "inspect",
      tag: details.tag,
      subtype: details.subtype,
      filepath: details.filepath,
      relativePath: details.relativePath,
      scope: details.scope,
      title: details.title,
      summary: details.summary,
      invariant:
        details.sections["Invariant"] ??
        details.sections["assertion"] ??
        details.body.split("\n\n")[0]?.trim(),
      links: details.links,
      depends_on: details.depends_on,
      supersedes: details.supersedes,
      superseded_by: details.superseded_by,
      referencedBy,
    };

    if (detailLevel === "full") {
      result.content = details.rawContent;
      result.body = details.body;
      result.sections = details.sections;
      result.acceptanceCriteria = details.acceptanceCriteria;
    }

    return result;
  }

  if (mode === "scope") {
    const scopeRes = await resolveScope(target, { cwd });
    const rules = scopeRes.rules ?? [];
    const tasks = scopeRes.tasks ?? [];

    return {
      mode: "scope",
      target: scopeRes.target,
      type: scopeRes.type,
      targetPath: scopeRes.targetPath,
      targetAbsolutePath: scopeRes.targetAbsolutePath,
      scope: scopeRes.scope,
      scopeDir: scopeRes.scopeDir,
      containerPath: scopeRes.enclosingModieDir,
      ancestralChain: scopeRes.ancestralScopes,
      ancestralRuleChain: scopeRes.ancestralRuleChains,
      activeTasks: tasks.map((t) => ({
        tag: t.tag,
        title: t.title,
        relativePath: t.relativePath,
        scope: t.scope,
        readiness: t.readiness,
        criteriaProgress: t.criteriaProgress,
      })),
      activeRules:
        detailLevel === "gist"
          ? rules.map((r) => ({
              tag: r.tag,
              title: r.title,
              invariant: r.invariant,
              scope: r.scope,
            }))
          : rules.map((r) => ({
              tag: r.tag,
              title: r.title,
              invariant: r.invariant,
              scope: r.scope,
              relativePath: r.relativePath,
              links: r.links,
              body: r.body,
            })),
    };
  }

  // mode === "context"
  const compiled = await compileContext(target, {
    cwd,
  });

  const rules =
    detailLevel === "gist"
      ? compiled.rules.map((r) => ({
          tag: r.tag,
          title: r.title,
          invariant: (r as any).invariant ?? r.body?.split("\n\n")[0]?.trim(),
          scope: r.scope,
        }))
      : compiled.rules;

  const adrs =
    detailLevel === "gist"
      ? compiled.adrs.map((a) => ({
          tag: a.tag,
          title: a.title,
          summary: a.summary,
          scope: a.scope,
        }))
      : compiled.adrs;

  return {
    mode: "context",
    target: compiled.target,
    scope: compiled.scope,
    scopeDir: compiled.scopeDir,
    ancestralChain: compiled.ancestralScopes,
    ancestralScopes: compiled.ancestralScopes,
    motives: compiled.motives,
    localGist: compiled.gists?.localGist,
    gists: compiled.gists,
    governingRules: rules,
    rules,
    linkedDecisions: adrs,
    adrs,
    signposts: compiled.signposts,
    task: compiled.task,
  };
}

/**
 * 2. modie_task_lifecycle handler
 */
export async function handleTaskLifecycle(
  args: TaskLifecycleInput,
  cwd: string,
): Promise<TaskLifecycleOutput> {
  const taskId = await resolveActiveTaskId(args.task_id, cwd);

  if (args.action === "start") {
    const branchResult = await startTaskBranch(taskId, {
      baseBranch: args.base_branch,
      force: args.force,
      cwd,
    });

    const output: TaskLifecycleOutput = {
      action: "start",
      taskId,
      branch: branchResult.branchName,
      branchName: branchResult.branchName,
      created: branchResult.created,
      createdBranch: branchResult.created,
      isSubtask: branchResult.isSubtask,
    };

    if (args.include_context !== false) {
      const status = await getTaskStatus(taskId, { cwd });
      const taskScope = status.relativePath
        ? dirname(status.relativePath).replace(/(^|\/)\.modie\/tasks$/, "") ||
          "."
        : ".";

      let plannedGov = { rules: 0, adrs: 0 };
      try {
        const details = await getArtifactDetails(taskId, { cwd });
        if (details.plannedGovernance) {
          plannedGov = details.plannedGovernance;
        }
      } catch {}

      // Resolve ambient guardrails from links and task scope
      const governingRules: any[] = [];
      const linkedAdrs: any[] = [];

      for (const link of status.links) {
        try {
          const details = await getArtifactDetails(link, { cwd });
          if (link.startsWith("RULE-")) {
            governingRules.push({
              tag: details.tag,
              title: details.title,
              invariant:
                details.sections["Invariant"] ??
                details.sections["assertion"] ??
                details.body.split("\n\n")[0]?.trim(),
            });
          } else if (link.startsWith("ADR-")) {
            linkedAdrs.push({
              tag: details.tag,
              summary:
                details.summary ??
                (details.sections["Context"] ?? details.body)
                  .split("\n\n")[0]
                  ?.trim(),
            });
          }
        } catch {}
      }

      output.mission = {
        title: status.title,
        scope: taskScope,
        blastRadius: {
          constraint: `All implementation mutations must reside at or strictly below '${taskScope}' (RULE-6).`,
        },
        acceptanceCriteria: status.acceptanceCriteria.map((c, i) => ({
          item: i + 1,
          text: c.text,
          completed: c.completed,
        })),
        plannedGovernance: plannedGov,
      };

      output.ambientGuardrails = {
        governingRules,
        linkedAdrs,
      };
    }

    return output;
  }

  if (args.action === "check") {
    const checkItems = args.check_items ?? [];
    for (const item of checkItems) {
      await checkTaskItem(taskId, item, {
        uncheck: args.uncheck,
        cwd,
      });
    }

    const status = await getTaskStatus(taskId, { cwd });
    const total = status.acceptanceCriteria.length;
    const completed = status.acceptanceCriteria.filter(
      (c) => c.completed,
    ).length;
    const remainingCriteria = status.acceptanceCriteria
      .map((c, i) => ({ item: i + 1, text: c.text, completed: c.completed }))
      .filter((c) => !c.completed);

    const progressPercent =
      total > 0 ? Math.round((completed / total) * 100) : 100;

    return {
      action: "check",
      taskId,
      checkedItems: checkItems,
      progress: `${completed}/${total} completed (${progressPercent}%)`,
      criteriaProgress: status.criteriaProgress,
      remainingCriteria,
      acceptanceCriteria: status.acceptanceCriteria.map((c, i) => ({
        item: i + 1,
        text: c.text,
        completed: c.completed,
      })),
      allCriteriaSatisfied: status.allCriteriaSatisfied,
    };
  }

  if (args.action === "status") {
    const status = await getTaskStatus(taskId, { cwd });
    return {
      action: "status",
      taskId,
      title: status.title,
      readiness: status.readiness,
      blockedBy: status.blockedBy,
      criteriaProgress: status.criteriaProgress,
      allCriteriaSatisfied: status.allCriteriaSatisfied,
      acceptanceCriteria: status.acceptanceCriteria.map((c, i) => ({
        item: i + 1,
        text: c.text,
        completed: c.completed,
      })),
      incompleteCriteria: status.incompleteCriteria,
    };
  }

  if (args.action === "complete") {
    const completeResult = await completeTask(taskId, {
      commit: true,
      force: args.force,
      cwd,
    });
    return {
      action: "complete",
      taskId,
      phase1Commit: completeResult.commits?.phase1,
      phase2Commit: completeResult.commits?.phase2,
      deletedTaskPath: completeResult.filepath,
    };
  }

  if (args.action === "merge") {
    const mergeResult = await mergeTaskBranch(taskId, {
      baseBranch: args.base_branch,
      keepBranch: args.keep_branch,
      cwd,
    });
    return {
      action: "merge",
      taskId,
      merged: true,
      targetBranch: mergeResult.targetBranch,
      deletedBranch: mergeResult.deletedSourceBranch,
      message: `Merged ${mergeResult.sourceBranch} into ${mergeResult.targetBranch}.`,
    };
  }

  if (args.action === "complete_and_merge") {
    const completeResult = await completeTask(taskId, {
      commit: true,
      force: args.force,
      cwd,
    });
    const mergeResult = await mergeTaskBranch(taskId, {
      baseBranch: args.base_branch,
      keepBranch: args.keep_branch,
      cwd,
    });
    return {
      action: "complete_and_merge",
      taskId,
      phase1Commit: completeResult.commits?.phase1,
      phase2Commit: completeResult.commits?.phase2,
      deletedTaskPath: completeResult.filepath,
      merged: true,
      targetBranch: mergeResult.targetBranch,
      deletedBranch: mergeResult.deletedSourceBranch,
      message: `Merged ${mergeResult.sourceBranch} into ${mergeResult.targetBranch}.`,
    };
  }

  throw new Error(`Unsupported task lifecycle action: "${args.action}".`);
}

/**
 * 3. modie_create_artifact handler
 */
export async function handleCreateArtifact(
  args: CreateArtifactInput,
  cwd: string,
): Promise<CreateArtifactOutput> {
  // Resolve scopeDir with active task branch fallback
  let resolvedScopeDir = args.scope_dir;
  if (!resolvedScopeDir || resolvedScopeDir === ".") {
    try {
      const branch = await detectGitBranch(cwd);
      if (branch) {
        const fromBranch = parseTaskIdFromBranch(branch);
        if (fromBranch) {
          const status = await getTaskStatus(fromBranch, { cwd });
          resolvedScopeDir = status.relativePath
            ? dirname(status.relativePath).replace(/\/\.modie\/tasks$/, "") ||
              "."
            : ".";
        }
      }
    } catch {}
  }
  resolvedScopeDir = resolvedScopeDir || ".";

  switch (args.kind) {
    case "RULE": {
      const assertion =
        args.sections?.["Invariant"] ??
        args.sections?.["assertion"] ??
        args.content ??
        "Rule assertion claim statement.";
      const res = await createRule({
        title: args.title,
        scopeDir: resolvedScopeDir,
        assertion,
        links: args.initial_links,
        cwd,
      });
      const artifactObj = (res as any).artifact ?? {};
      return {
        tag: res.tag,
        kind: "RULE",
        filepath: res.filepath,
        relativePath: res.relativePath,
        scope: resolvedScopeDir,
        validatedLinks: artifactObj.links ?? args.initial_links ?? [],
        supersededUpdated: [],
      };
    }
    case "ADR": {
      const summary =
        args.sections?.["Summary"] ?? args.sections?.["summary"] ?? args.title;
      const context =
        args.sections?.["Context"] ??
        args.sections?.["context"] ??
        args.content ??
        "Context statement.";
      const alternatives =
        args.sections?.["Alternatives Considered"] ??
        args.sections?.["alternatives_considered"] ??
        args.sections?.["Alternatives"] ??
        args.sections?.["alternatives"];
      const decision =
        args.sections?.["Decision"] ??
        args.sections?.["decision"] ??
        "Decision statement.";
      const consequences =
        args.sections?.["Consequences"] ?? args.sections?.["consequences"];

      const res = await createAdr({
        title: args.title,
        scopeDir: resolvedScopeDir,
        summary,
        context,
        decision,
        alternatives,
        consequences,
        links: args.initial_links,
        supersedes: args.supersedes,
        cwd,
      });
      const artifactObj = (res as any).artifact ?? {};
      return {
        tag: res.tag,
        kind: "ADR",
        filepath: res.filepath,
        relativePath: res.relativePath,
        scope: resolvedScopeDir,
        validatedLinks: artifactObj.links ?? args.initial_links ?? [],
        supersededUpdated: artifactObj.supersedes ?? args.supersedes ?? [],
      };
    }
    case "TASK": {
      const context =
        args.sections?.["Context"] ?? args.content ?? "Task context.";
      const critText =
        args.sections?.["Acceptance Criteria"] ?? args.sections?.["criteria"];
      const criteria = critText
        ? critText
            .split("\n")
            .map((line) => line.replace(/^[-*]\s*(\[[ xX]\]\s*)?/, "").trim())
            .filter(Boolean)
        : ["Implementation verified", "User Review"];

      const res = await createTask({
        title: args.title,
        scopeDir: resolvedScopeDir,
        context,
        criteria,
        depends_on: args.depends_on,
        links: args.initial_links,
        targetPaths: args.target_paths,
        cwd,
      });
      const artifactObj = (res as any).artifact ?? {};
      return {
        tag: res.tag,
        kind: "TASK",
        filepath: res.filepath,
        relativePath: res.relativePath,
        scope: resolvedScopeDir,
        validatedLinks: artifactObj.links ?? args.initial_links ?? [],
        supersededUpdated: [],
      };
    }
    case "MOTIVE": {
      const intent = args.sections?.["Intent"] ?? args.content ?? args.title;
      const res = await createMotive({
        scopeDir: resolvedScopeDir,
        intent,
        cwd,
      });
      return {
        tag: "MOTIVE",
        kind: "MOTIVE",
        filepath: res.filepath,
        relativePath: res.relativePath,
        scope: resolvedScopeDir,
        validatedLinks: [],
        supersededUpdated: [],
      };
    }
    default: {
      const res = await createArtifact({
        definitionId: args.kind.toLowerCase(),
        title: args.title,
        scopeDir: resolvedScopeDir,
        rawContent: args.content,
        cwd,
      });
      return {
        tag: res.tag,
        kind: args.kind,
        filepath: res.filepath,
        relativePath: res.relativePath,
        scope: resolvedScopeDir,
        validatedLinks: [],
        supersededUpdated: [],
      };
    }
  }
}

/**
 * 4. modie_mutate_governance handler
 */
export async function handleMutateGovernance(
  args: MutateGovernanceInput,
  cwd: string,
): Promise<MutateGovernanceOutput> {
  let target = args.target;
  if (!target || target.trim().length === 0) {
    const branch = await detectGitBranch(cwd);
    if (branch) {
      const fromBranch = parseTaskIdFromBranch(branch);
      if (fromBranch) {
        target = normalizeTaskId(fromBranch);
      }
    }
  }
  if (!target) {
    throw new Error(
      "Subject artifact target must be specified when not on an active task branch.",
    );
  }

  const relationship = args.relationship ?? "links";

  if (args.action === "link") {
    const targets = args.targets ?? [];
    if (targets.length === 0) {
      throw new Error("No target artifacts specified for linking.");
    }

    const added: string[] = [];
    const alreadyPresent: string[] = [];

    for (const t of targets) {
      const res = await linkArtifact({
        source: target,
        target: t,
        relationship,
        cwd,
      });
      if (res.changed) {
        added.push(t);
      } else {
        alreadyPresent.push(t);
      }
    }

    return {
      action: "link",
      subject: target,
      target,
      relationship,
      added,
      alreadyPresent,
      graphValidated: true,
    };
  }

  if (args.action === "unlink") {
    const targets = args.targets ?? [];
    if (targets.length === 0) {
      throw new Error("No target artifacts specified for unlinking.");
    }

    const removed: string[] = [];

    for (const t of targets) {
      const res = await unlinkArtifact({
        source: target,
        target: t,
        relationship,
        cwd,
      });
      if (res.changed) {
        removed.push(t);
      }
    }

    return {
      action: "unlink",
      subject: target,
      target,
      relationship,
      removed,
    };
  }

  if (args.action === "archive") {
    const res = await archiveArtifact({
      tag: target,
      force: args.force,
      cwd,
    });
    return {
      action: "archive",
      tag: target,
      target,
      archivedPath: res.archivedRelativePath ?? res.archivedFilepath,
      activeReferencesBypassed: args.force,
    };
  }

  throw new Error(`Unsupported governance mutation action: "${args.action}".`);
}
