import * as vscode from "vscode";
import type { SourceExplanation, SourceLocation } from "../review/schema";

export const showExplanationCommand = "aiChangeReview.explanation.show";

type RegisteredExplanation = {
  location: SourceLocation;
  explanation: SourceExplanation;
};

export class ExplanationCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private readonly explanations = new Map<string, RegisteredExplanation>();
  private readonly codeLensesChanged = new vscode.EventEmitter<void>();

  readonly onDidChangeCodeLenses = this.codeLensesChanged.event;

  register(
    documentUri: vscode.Uri,
    location: SourceLocation,
    explanation: SourceExplanation,
  ): void {
    this.explanations.set(documentUri.toString(), { location, explanation });
    this.codeLensesChanged.fire();
  }

  getExplanation(documentUri: string): SourceExplanation | undefined {
    return this.explanations.get(documentUri)?.explanation;
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const registered = this.explanations.get(document.uri.toString());
    if (!registered) {
      return [];
    }

    const line = Math.min(registered.location.startLine - 1, document.lineCount - 1);
    const range = new vscode.Range(line, 0, line, 0);
    return [new vscode.CodeLens(range, {
      command: showExplanationCommand,
      title: `$(comment-discussion) ${registered.explanation.title}`,
      tooltip: "クリックして Role / Why / Watch を確認",
      arguments: [document.uri.toString()],
    })];
  }

  dispose(): void {
    this.explanations.clear();
    this.codeLensesChanged.dispose();
  }
}

export function formatExplanationDetail(explanation: SourceExplanation): string {
  const sections = [
    `Role\n${explanation.role}`,
    explanation.why ? `Why\n${explanation.why}` : undefined,
    explanation.watch && explanation.watch.length > 0
      ? `Watch\n${explanation.watch.map((item) => `• ${item}`).join("\n")}`
      : undefined,
  ];

  return sections.filter((section): section is string => section !== undefined).join("\n\n");
}
