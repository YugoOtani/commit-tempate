import * as vscode from "vscode";
import {
  FlowTreeDataProvider,
  selectFlowCommand,
  selectStepCommand,
} from "./flow/flowTreeProvider";
import { openOverviewPanel } from "./overview/overviewPanel";
import { loadBundledReview } from "./review/loader";
import type { ChangeReview, SourceLocation } from "./review/schema";
import { openSourceLocation } from "./source/sourceNavigation";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("AI Change Review");
  const flowTreeDataProvider = new FlowTreeDataProvider();
  let review: ChangeReview | undefined;
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
    async (flowId: unknown, stepId: unknown, locationId: unknown) => {
      if (typeof flowId === "string" && typeof stepId === "string") {
        if (!flowTreeDataProvider.selectStep(flowId, stepId)) {
          return;
        }

        const location = findStepLocation(
          review,
          flowId,
          stepId,
          typeof locationId === "string" ? locationId : undefined,
        );
        if (!location) {
          return;
        }

        try {
          await openSourceLocation(location);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          output.appendLine(detail);
          await vscode.window.showErrorMessage(`SourceLocationを開けません: ${detail}`);
        }
      }
    },
  );
  const openReview = vscode.commands.registerCommand("aiChangeReview.openReview", async () => {
    try {
      review = await loadBundledReview(context.extensionUri);
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

function findStepLocation(
  review: ChangeReview | undefined,
  flowId: string,
  stepId: string,
  locationId: string | undefined,
): SourceLocation | undefined {
  const step = review?.flows
    .find((flow) => flow.id === flowId)
    ?.steps.find((candidate) => candidate.id === stepId);
  if (!step) {
    return undefined;
  }

  const selectedLocationId = locationId === undefined
    ? step.locationIds[0]
    : step.locationIds.includes(locationId)
      ? locationId
      : undefined;
  return review?.locations.find((location) => location.id === selectedLocationId);
}
