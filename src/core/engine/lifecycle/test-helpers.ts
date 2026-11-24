/**
 * Shared lifecycle Git ceremony and fixture helpers for isolated branching tests.
 * @verifies RULE-21, RULE-28, RULE-34, RULE-35
 */

import {
  createFixtureWorkspace,
  type FixtureWorkspace,
} from "../../platform/testing/index.ts";

/**
 * Creates an isolated temporary workspace initialized with Git (`main` protected, `dev` trunk).
 */
export async function createBranchingWorkspace(
  prefix: string = "modie-branching-test-",
): Promise<FixtureWorkspace> {
  const workspace = await createFixtureWorkspace(prefix);
  await workspace.initGit({ defaultBranch: "main", initialCommit: true });
  await Bun.$`git checkout -b dev`.cwd(workspace.cwd).quiet();
  await workspace.writeFile(
    ".modie/config.json",
    JSON.stringify({
      git: {
        trunk: "dev",
        protectedBranches: ["main"],
      },
    }),
  );
  return workspace;
}

/**
 * Writes a file in the fixture workspace, stages it, and creates a commit.
 */
export async function commitFile(
  workspace: FixtureWorkspace,
  relPath: string,
  content: string,
  message: string,
): Promise<void> {
  await workspace.writeFile(relPath, content);
  await Bun.$`git add ${relPath}`.cwd(workspace.cwd).quiet();
  await workspace.gitCommit(message);
}

/**
 * Executes the RULE-21 task deletion commit ceremony inside a fixture workspace.
 */
export async function completeTaskInGit(
  workspace: FixtureWorkspace,
  task: { filepath: string; tag: string },
): Promise<void> {
  await workspace.remove(task.filepath);
  await Bun.$`git add -u`.cwd(workspace.cwd).quiet();
  await workspace.gitCommit(
    `chore(task): delete completed ${task.tag} artifact`,
  );
}

/**
 * Returns the currently checked-out Git branch name in the fixture workspace.
 */
export async function getCurrentBranch(
  workspace: FixtureWorkspace,
): Promise<string> {
  return (
    await Bun.$`git branch --show-current`.cwd(workspace.cwd).text()
  ).trim();
}

/**
 * Returns the full commit hash for the given Git ref in the fixture workspace.
 */
export async function getHeadHash(
  workspace: FixtureWorkspace,
  ref: string = "HEAD",
): Promise<string> {
  return (
    await Bun.$`git rev-parse ${ref}`.cwd(workspace.cwd).text()
  ).trim();
}

/**
 * Returns true if the given local branch exists in the fixture workspace.
 */
export async function branchExistsInGit(
  workspace: FixtureWorkspace,
  branchName: string,
): Promise<boolean> {
  const out = (
    await Bun.$`git branch --list ${branchName}`.cwd(workspace.cwd).text()
  ).trim();
  return out.length > 0;
}
