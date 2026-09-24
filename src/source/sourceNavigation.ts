import * as vscode from "vscode";
import type { SourceLocation } from "../review/schema";

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
