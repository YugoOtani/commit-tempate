import * as vscode from "vscode";

export class SourceLocationHighlighter implements vscode.Disposable {
  private readonly decorationType: vscode.TextEditorDecorationType;
  private currentEditor: vscode.TextEditor | undefined;

  constructor() {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor("editor.rangeHighlightBackground"),
      borderWidth: "0 0 0 2px",
      borderStyle: "solid",
      borderColor: new vscode.ThemeColor("editor.findMatchBorder"),
      overviewRulerColor: new vscode.ThemeColor("editorOverviewRuler.findMatchForeground"),
      overviewRulerLane: vscode.OverviewRulerLane.Full,
    });
  }

  highlight(editor: vscode.TextEditor, range: vscode.Range): void {
    if (this.currentEditor && this.currentEditor !== editor) {
      this.clearCurrentEditor();
    }

    editor.setDecorations(this.decorationType, [range]);
    this.currentEditor = editor;
  }

  clear(): void {
    this.clearCurrentEditor();
  }

  private clearCurrentEditor(): void {
    if (
      this.currentEditor
      && vscode.window.visibleTextEditors.includes(this.currentEditor)
    ) {
      this.currentEditor.setDecorations(this.decorationType, []);
    }
    this.currentEditor = undefined;
  }

  dispose(): void {
    this.clear();
    this.decorationType.dispose();
  }
}
