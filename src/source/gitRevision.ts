import { execFile } from "node:child_process";

const gitOutputLimit = 16 * 1024 * 1024;

export type GitCommandRunner = (
  workingDirectory: string,
  args: readonly string[],
) => Promise<string>;

export type RevisionFileContents = {
  repositoryRoot: string;
  baseContent: string;
  targetContent: string;
};

export async function readRevisionFileContents(
  workspaceRoots: readonly string[],
  baseRevision: string,
  targetRevision: string,
  file: string,
  runGit: GitCommandRunner = executeGit,
): Promise<RevisionFileContents> {
  if (workspaceRoots.length === 0) {
    throw new Error("Git Diffを開くワークスペースがありません。");
  }

  const repositoryRoots = await findRepositoryRoots(workspaceRoots, runGit);
  if (repositoryRoots.length === 0) {
    throw new Error("開いているワークスペースにGit repositoryが見つかりません。");
  }

  const gitPath = normalizeGitPath(file);
  let revisionsFound = false;

  for (const repositoryRoot of repositoryRoots) {
    const baseCommit = await resolveCommit(repositoryRoot, baseRevision, runGit);
    const targetCommit = await resolveCommit(repositoryRoot, targetRevision, runGit);
    if (!baseCommit || !targetCommit) {
      continue;
    }

    revisionsFound = true;
    const targetContent = await readBlob(repositoryRoot, targetCommit, gitPath, runGit);
    if (targetContent === undefined) {
      continue;
    }

    const baseContent = await readBlob(repositoryRoot, baseCommit, gitPath, runGit);
    return {
      repositoryRoot,
      baseContent: baseContent ?? "",
      targetContent,
    };
  }

  if (!revisionsFound) {
    throw new Error(
      `baseRevisionまたはtargetRevisionを解決できません: ${baseRevision} / ${targetRevision}`,
    );
  }

  throw new Error(`targetRevisionにファイルが見つかりません: ${targetRevision}:${gitPath}`);
}

async function findRepositoryRoots(
  workspaceRoots: readonly string[],
  runGit: GitCommandRunner,
): Promise<string[]> {
  const repositoryRoots: string[] = [];

  for (const workspaceRoot of workspaceRoots) {
    const repositoryRoot = await tryGit(
      runGit,
      workspaceRoot,
      ["rev-parse", "--show-toplevel"],
    );
    const normalizedRoot = repositoryRoot?.trim();
    if (normalizedRoot && !repositoryRoots.includes(normalizedRoot)) {
      repositoryRoots.push(normalizedRoot);
    }
  }

  return repositoryRoots;
}

async function resolveCommit(
  repositoryRoot: string,
  revision: string,
  runGit: GitCommandRunner,
): Promise<string | undefined> {
  const output = await tryGit(
    runGit,
    repositoryRoot,
    [
      "rev-parse",
      "--verify",
      "--quiet",
      "--end-of-options",
      `${revision}^{commit}`,
    ],
  );
  return output?.trim() || undefined;
}

async function readBlob(
  repositoryRoot: string,
  revision: string,
  file: string,
  runGit: GitCommandRunner,
): Promise<string | undefined> {
  return tryGit(runGit, repositoryRoot, ["cat-file", "blob", `${revision}:${file}`]);
}

async function tryGit(
  runGit: GitCommandRunner,
  workingDirectory: string,
  args: readonly string[],
): Promise<string | undefined> {
  try {
    return await runGit(workingDirectory, args);
  } catch {
    return undefined;
  }
}

function normalizeGitPath(file: string): string {
  return file.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function executeGit(workingDirectory: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      {
        cwd: workingDirectory,
        encoding: "utf8",
        maxBuffer: gitOutputLimit,
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr.trim() || error.message;
          reject(new Error(detail));
          return;
        }

        resolve(stdout);
      },
    );
  });
}
