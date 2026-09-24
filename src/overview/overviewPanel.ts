import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import type { ChangeReview } from "../review/schema";
import { renderOverview } from "./renderOverview";

type OpenFlowHandler = (flowId: string) => void;

export function openOverviewPanel(review: ChangeReview, onOpenFlow: OpenFlowHandler): void {
  const panel = vscode.window.createWebviewPanel(
    "aiChangeReview.overview",
    review.change.title,
    vscode.ViewColumn.One,
    { enableScripts: true },
  );

  panel.webview.html = renderOverview(review, randomBytes(16).toString("hex"));
  panel.webview.onDidReceiveMessage((message: unknown) => {
    if (!isOpenFlowMessage(message)) {
      return;
    }
    if (!review.flows.some((flow) => flow.id === message.flowId)) {
      return;
    }
    onOpenFlow(message.flowId);
  });
}

function isOpenFlowMessage(value: unknown): value is { type: "openFlow"; flowId: string } {
  return typeof value === "object"
    && value !== null
    && "type" in value
    && value.type === "openFlow"
    && "flowId" in value
    && typeof value.flowId === "string";
}
