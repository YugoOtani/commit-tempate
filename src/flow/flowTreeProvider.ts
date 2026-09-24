import * as vscode from "vscode";
import type {
  ChangeReview,
  Flow,
  FlowStep,
  SourceLocation,
} from "../review/schema";

export const selectFlowCommand = "aiChangeReview.flow.selectFlow";
export const selectStepCommand = "aiChangeReview.flow.selectStep";

type StepStatus = "completed" | "current" | "remaining";

type FlowTreeElement =
  | {
    kind: "flow";
    flow: Flow;
    active: boolean;
  }
  | {
    kind: "step";
    flowId: string;
    step: FlowStep;
    status: StepStatus;
  }
  | {
    kind: "location";
    flowId: string;
    stepId: string;
    location: SourceLocation;
  };

const stepMarkers: Record<StepStatus, string> = {
  completed: "✓",
  current: "→",
  remaining: "○",
};

export class FlowTreeDataProvider implements vscode.TreeDataProvider<FlowTreeElement>, vscode.Disposable {
  private review: ChangeReview | undefined;
  private activeFlowId: string | undefined;
  private activeStepId: string | undefined;
  private readonly treeDataChanged = new vscode.EventEmitter<FlowTreeElement | undefined>();

  readonly onDidChangeTreeData = this.treeDataChanged.event;

  setReview(review: ChangeReview): void {
    this.review = review;
    const firstFlow = review.flows[0];
    this.activeFlowId = firstFlow?.id;
    this.activeStepId = firstFlow?.steps[0]?.id;
    this.treeDataChanged.fire(undefined);
  }

  selectFlow(flowId: string): boolean {
    const flow = this.review?.flows.find((candidate) => candidate.id === flowId);
    if (!flow) {
      return false;
    }

    this.activeFlowId = flow.id;
    this.activeStepId = flow.steps[0]?.id;
    this.treeDataChanged.fire(undefined);
    return true;
  }

  selectStep(flowId: string, stepId: string): boolean {
    const flow = this.review?.flows.find((candidate) => candidate.id === flowId);
    if (!flow?.steps.some((step) => step.id === stepId)) {
      return false;
    }

    this.activeFlowId = flow.id;
    this.activeStepId = stepId;
    this.treeDataChanged.fire(undefined);
    return true;
  }

  getTreeItem(element: FlowTreeElement): vscode.TreeItem {
    if (element.kind === "flow") {
      const item = new vscode.TreeItem(
        element.flow.title,
        element.active
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed,
      );
      item.description = element.active ? "current flow" : undefined;
      item.tooltip = element.flow.description ?? element.flow.title;
      item.contextValue = "flow";
      item.command = {
        command: selectFlowCommand,
        title: "Flowを選択",
        arguments: [element.flow.id],
      };
      return item;
    }

    if (element.kind === "step") {
      const item = new vscode.TreeItem(
        `${stepMarkers[element.status]} ${element.step.title}`,
        element.step.locationIds.length > 1
          ? element.status === "current"
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
      );
      item.description = element.status === "current" ? "current" : undefined;
      item.tooltip = element.step.description ?? element.step.title;
      item.contextValue = `flowStep.${element.status}`;
      item.command = {
        command: selectStepCommand,
        title: "Stepを選択",
        arguments: [element.flowId, element.step.id],
      };
      return item;
    }

    const item = new vscode.TreeItem(
      fileName(element.location.file),
      vscode.TreeItemCollapsibleState.None,
    );
    item.description = lineDescription(element.location);
    item.tooltip = `${element.location.file}:${element.location.startLine}-${element.location.endLine}`;
    item.contextValue = "sourceLocation";
    item.command = {
      command: selectStepCommand,
      title: "SourceLocationを開く",
      arguments: [element.flowId, element.stepId, element.location.id],
    };
    return item;
  }

  getChildren(element?: FlowTreeElement): FlowTreeElement[] {
    if (!this.review) {
      return [];
    }

    if (!element) {
      return this.review.flows.map((flow) => ({
        kind: "flow",
        flow,
        active: flow.id === this.activeFlowId,
      }));
    }

    if (element.kind === "location") {
      return [];
    }

    if (element.kind === "step") {
      if (element.step.locationIds.length <= 1) {
        return [];
      }

      return element.step.locationIds.flatMap((locationId) => {
        const location = this.review?.locations.find((candidate) => candidate.id === locationId);
        return location
          ? [{
            kind: "location" as const,
            flowId: element.flowId,
            stepId: element.step.id,
            location,
          }]
          : [];
      });
    }

    const currentIndex = element.flow.id === this.activeFlowId
      ? element.flow.steps.findIndex((step) => step.id === this.activeStepId)
      : -1;

    return element.flow.steps.map((step, index) => ({
      kind: "step",
      flowId: element.flow.id,
      step,
      status: currentIndex === -1 || index > currentIndex
        ? "remaining"
        : index === currentIndex
          ? "current"
          : "completed",
    }));
  }

  dispose(): void {
    this.treeDataChanged.dispose();
  }
}

function fileName(file: string): string {
  return file.split("/").at(-1) ?? file;
}

function lineDescription(location: SourceLocation): string {
  return location.startLine === location.endLine
    ? `L${location.startLine}`
    : `L${location.startLine}-${location.endLine}`;
}
