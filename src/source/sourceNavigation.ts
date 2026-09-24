import * as vscode from "vscode";
import type { ChangeReview, SourceLocation } from "../review/schema";
import type { SourceLocationHighlighter } from "./decoration";
import type { GitDiffContentProvider } from "./diffProvider";
import type { ExplanationCodeLensProvider } from "./explanation";
import { readRevisionFileContents } from "./gitRevision";

export const openFullSourceCommand = "aiChangeReview.openFullSource";

export async function openDiffLocation(
  review: ChangeReview,
  location: SourceLocation,
  contentProvider: GitDiffContentProvider,
  highlighter: SourceLocationHighlighter,
  explanationProvider: ExplanationCodeLensProvider,
): Promise<vscode.Uri> {
  const workspaceRoots = vscode.workspace.workspaceFolders?.map(
    (workspaceFolder) => workspaceFolder.uri.fsPath,
  ) ?? [];
  const contents = await readRevisionFileContents(
    workspaceRoots,
    review.change.baseRevision,
    review.change.targetRevision,
    location.file,
  );
  const documents = contentProvider.createDocuments(
    location.file,
    review.change.baseRevision,
    review.change.targetRevision,
    contents.baseContent,
    contents.targetContent,
  );
  const explanation = review.explanations.find(
    (candidate) => candidate.locationId === location.id,
  );
  if (explanation) {
    explanationProvider.register(documents.target, location, explanation);
  }

  await vscode.commands.executeCommand(
    "vscode.diff",
    documents.base,
    documents.target,
    diffTitle(review, location),
    { preview: true },
  );

  const editor = vscode.window.visibleTextEditors.find(
    (candidate) => candidate.document.uri.toString() === documents.target.toString(),
  );
  if (!editor) {
    throw new Error("Git Diffのtarget側Editorを特定できません。");
  }

  const range = createLocationRange(editor.document, location);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  highlighter.highlight(editor, range);
  return documents.target;
}

export async function openFullSourceLocation(
  documentUri: vscode.Uri,
  location: SourceLocation,
  highlighter: SourceLocationHighlighter,
): Promise<void> {
  const editor = await vscode.window.showTextDocument(documentUri, {
    preview: true,
  });
  const range = createLocationRange(editor.document, location);

  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  highlighter.highlight(editor, range);
}

export async function openSourceLocation(location: SourceLocation): Promise<void> {
  const uri = await resolveSourceUri(location.file);
  const editor = await vscode.window.showTextDocument(uri);
  const range = new vscode.Range(
    location.startLine - 1,
    0,
    location.endLine - 1,
    0,
  );

  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

async function resolveSourceUri(file: string): Promise<vscode.Uri> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    throw new Error("SourceLocationを開くワークスペースがありません。");
  }

  for (const workspaceFolder of workspaceFolders) {
    const uri = vscode.Uri.joinPath(workspaceFolder.uri, file);
    try {
      await vscode.workspace.fs.stat(uri);
      return uri;
    } catch {
      // 複数ルートの場合は、同じ相対パスを次のルートでも確認する。
    }
  }

  throw new Error(`SourceLocationのファイルがワークスペース内に見つかりません: ${file}`);
}

function createLocationRange(
  document: vscode.TextDocument,
  location: SourceLocation,
): vscode.Range {
  if (location.startLine > document.lineCount) {
    throw new Error(
      `SourceLocationの開始行がtargetRevisionの行数を超えています: ${location.file}:${location.startLine}`,
    );
  }

  const startLine = location.startLine - 1;
  const endLine = Math.min(location.endLine, document.lineCount) - 1;
  const endCharacter = document.lineAt(endLine).text.length;
  return new vscode.Range(startLine, 0, endLine, endCharacter);
}

function diffTitle(review: ChangeReview, location: SourceLocation): string {
  return `${location.file} (${shortRevision(review.change.baseRevision)} ↔ ${shortRevision(review.change.targetRevision)})`;
}

function shortRevision(revision: string): string {
  return revision.length > 8 ? revision.slice(0, 8) : revision;
}
