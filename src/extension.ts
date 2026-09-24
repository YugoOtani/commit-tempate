import * as vscode from "vscode";
import { openOverviewPanel } from "./overview/overviewPanel";
import { loadBundledReview } from "./review/loader";

class EmptyFlowTreeDataProvider implements vscode.TreeDataProvider<never> {
  getTreeItem(element: never): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.ProviderResult<never[]> {
    return [];
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("AI Change Review");
  const flowTree = vscode.window.createTreeView("aiChangeReview.flowNavigator", {
    treeDataProvider: new EmptyFlowTreeDataProvider(),
  });
  const openReview = vscode.commands.registerCommand("aiChangeReview.openReview", async () => {
    try {
      const review = await loadBundledReview(context.extensionUri);
      openOverviewPanel(review, (flowId) => {
        output.appendLine(`openFlowを受信: ${flowId}`);
        void vscode.window.showInformationMessage(`Flowを受信しました: ${flowId}`);
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      output.appendLine(detail);
      void vscode.window.showErrorMessage(`AI Change Reviewを開けません: ${detail}`);
    }
  });

  context.subscriptions.push(output, flowTree, openReview);
}

export function deactivate(): void {}
