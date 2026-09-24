import * as vscode from "vscode";
import {
  FlowTreeDataProvider,
  selectFlowCommand,
  selectStepCommand,
} from "./flow/flowTreeProvider";
import { openOverviewPanel } from "./overview/overviewPanel";
import { loadBundledReview } from "./review/loader";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("AI Change Review");
  const flowTreeDataProvider = new FlowTreeDataProvider();
  const flowTree = vscode.window.createTreeView("aiChangeReview.flowNavigator", {
    treeDataProvider: flowTreeDataProvider,
  });
  const selectFlow = vscode.commands.registerCommand(selectFlowCommand, (flowId: unknown) => {
    if (typeof flowId === "string") {
      flowTreeDataProvider.selectFlow(flowId);
    }
  });
  const selectStep = vscode.commands.registerCommand(
    selectStepCommand,
    (flowId: unknown, stepId: unknown) => {
      if (typeof flowId === "string" && typeof stepId === "string") {
        flowTreeDataProvider.selectStep(flowId, stepId);
      }
    },
  );
  const openReview = vscode.commands.registerCommand("aiChangeReview.openReview", async () => {
    try {
      const review = await loadBundledReview(context.extensionUri);
      flowTreeDataProvider.setReview(review);
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

  context.subscriptions.push(
    output,
    flowTreeDataProvider,
    flowTree,
    selectFlow,
    selectStep,
    openReview,
  );
}

export function deactivate(): void {}
