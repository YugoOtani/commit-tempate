import * as vscode from "vscode";

export const gitDiffDocumentScheme = "ai-change-review-git";

export type DiffDocumentUris = {
  base: vscode.Uri;
  target: vscode.Uri;
};

export class GitDiffContentProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly contents = new Map<string, string>();
  private sequence = 0;

  createDocuments(
    file: string,
    baseRevision: string,
    targetRevision: string,
    baseContent: string,
    targetContent: string,
  ): DiffDocumentUris {
    const sequence = this.sequence;
    this.sequence += 1;

    const base = createGitDocumentUri("base", file, baseRevision, sequence);
    const target = createGitDocumentUri("target", file, targetRevision, sequence);
    this.contents.set(base.toString(), baseContent);
    this.contents.set(target.toString(), targetContent);

    return { base, target };
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    const content = this.contents.get(uri.toString());
    if (content === undefined) {
      throw new Error(`Git Diff用の内容が見つかりません: ${uri.toString()}`);
    }

    return content;
  }

  dispose(): void {
    this.contents.clear();
  }
}

function createGitDocumentUri(
  side: "base" | "target",
  file: string,
  revision: string,
  sequence: number,
): vscode.Uri {
  const path = file.startsWith("/") ? file : `/${file}`;
  const query = `revision=${encodeURIComponent(revision)}&sequence=${sequence}`;
  return vscode.Uri.from({
    scheme: gitDiffDocumentScheme,
    authority: side,
    path,
    query,
  });
}
