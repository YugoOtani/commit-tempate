import * as vscode from "vscode";
import {
  FlowTreeDataProvider,
  selectFlowCommand,
  selectStepCommand,
} from "./flow/flowTreeProvider";
import { openOverviewPanel } from "./overview/overviewPanel";
import { loadBundledReview } from "./review/loader";
import type { ChangeReview, SourceLocation } from "./review/schema";
import { SourceLocationHighlighter } from "./source/decoration";
import {
  GitDiffContentProvider,
  gitDiffDocumentScheme,
} from "./source/diffProvider";
import {
  ExplanationCodeLensProvider,
  formatExplanationDetail,
  showExplanationCommand,
} from "./source/explanation";
import {
  openDiffLocation,
  openFullSourceCommand,
  openFullSourceLocation,
} from "./source/sourceNavigation";

type OpenedLocation = {
  documentUri: vscode.Uri;
  location: SourceLocation;
};

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("AI Change Review");
  const flowTreeDataProvider = new FlowTreeDataProvider();
  const diffContentProvider = new GitDiffContentProvider();
  const explanationProvider = new ExplanationCodeLensProvider();
  const highlighter = new SourceLocationHighlighter();
  const openedLocations = new Map<string, OpenedLocation>();
  let currentLocation: OpenedLocation | undefined;
  let review: ChangeReview | undefined;
  const flowTree = vscode.window.createTreeView("aiChangeReview.flowNavigator", {
    treeDataProvider: flowTreeDataProvider,
  });
  const selectFlow = vscode.commands.registerCommand(selectFlowCommand, (flowId: unknown) => {
    if (typeof flowId === "string") {
      if (flowTreeDataProvider.selectFlow(flowId)) {
        highlighter.clear();
        currentLocation = undefined;
      }
    }
  });
  const selectStep = vscode.commands.registerCommand(
    selectStepCommand,
    async (flowId: unknown, stepId: unknown, locationId: unknown) => {
      if (typeof flowId === "string" && typeof stepId === "string") {
        if (!review) {
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

        await openReviewLocation(review, flowId, stepId, location);
      }
    },
  );
  const openFullSource = vscode.commands.registerCommand(
    openFullSourceCommand,
    async (resource: unknown) => {
      const resourceKey = getUriString(resource)
        ?? vscode.window.activeTextEditor?.document.uri.toString();
      const openedLocation = resourceKey
        ? openedLocations.get(resourceKey) ?? currentLocation
        : currentLocation;
      if (!openedLocation) {
        return;
      }

      try {
        await openFullSourceLocation(
          openedLocation.documentUri,
          openedLocation.location,
          highlighter,
        );
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        output.appendLine(detail);
        await vscode.window.showErrorMessage(`Full Sourceを開けません: ${detail}`);
      }
    },
  );
  const showExplanation = vscode.commands.registerCommand(
    showExplanationCommand,
    async (documentUri: unknown) => {
      if (typeof documentUri !== "string") {
        return;
      }

      const explanation = explanationProvider.getExplanation(documentUri);
      if (!explanation) {
        return;
      }

      await vscode.window.showInformationMessage(explanation.title, {
        modal: true,
        detail: formatExplanationDetail(explanation),
      });
    },
  );
  const openReview = vscode.commands.registerCommand("aiChangeReview.openReview", async () => {
    try {
      review = await loadBundledReview(context.extensionUri);
      highlighter.clear();
      openedLocations.clear();
      currentLocation = undefined;
      flowTreeDataProvider.setReview(review);
      openOverviewPanel(review, async (flowId) => {
        output.appendLine(`openFlowを受信: ${flowId}`);
        const flow = review?.flows.find((candidate) => candidate.id === flowId);
        if (!review || !flow || !flowTreeDataProvider.selectFlow(flowId)) {
          return;
        }

        highlighter.clear();
        currentLocation = undefined;
        const firstStep = flow.steps[0];
        const location = firstStep
          ? findStepLocation(review, flow.id, firstStep.id, undefined)
          : undefined;
        if (!firstStep || !location) {
          const detail = `Flowの先頭Stepに開けるSourceLocationがありません: ${flowId}`;
          output.appendLine(detail);
          await vscode.window.showErrorMessage(detail);
          return;
        }

        await openReviewLocation(review, flow.id, firstStep.id, location);
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
    diffContentProvider,
    explanationProvider,
    highlighter,
    vscode.workspace.registerTextDocumentContentProvider(
      gitDiffDocumentScheme,
      diffContentProvider,
    ),
    vscode.languages.registerCodeLensProvider(
      { scheme: gitDiffDocumentScheme },
      explanationProvider,
    ),
    flowTree,
    selectFlow,
    selectStep,
    openFullSource,
    showExplanation,
    openReview,
  );

  async function openReviewLocation(
    selectedReview: ChangeReview,
    flowId: string,
    stepId: string,
    location: SourceLocation,
  ): Promise<void> {
    try {
      const documentUri = await openDiffLocation(
        selectedReview,
        location,
        diffContentProvider,
        highlighter,
        explanationProvider,
      );
      const openedLocation = { documentUri, location };
      openedLocations.set(documentUri.toString(), openedLocation);
      currentLocation = openedLocation;
      flowTreeDataProvider.selectStep(flowId, stepId);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      output.appendLine(detail);
      await vscode.window.showErrorMessage(`Git Diffを開けません: ${detail}`);
    }
  }
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

function getUriString(value: unknown): string | undefined {
  if (
    typeof value !== "object"
    || value === null
    || !("toString" in value)
    || typeof value.toString !== "function"
  ) {
    return undefined;
  }

  const uri = value.toString();
  return uri === "[object Object]" ? undefined : uri;
}
