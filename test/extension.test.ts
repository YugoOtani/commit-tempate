import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "node:test";

type ModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown;

type MockUri = {
  scheme: string;
  authority: string;
  path: string;
  query: string;
  fsPath: string;
  toString(): string;
};

type MockRangeValue = {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
};

it("Flow StepからGit Diffを開き、current表示とhighlightを同期する", async () => {
  type CommandHandler = (...args: unknown[]) => unknown;
  type TreeElement = { kind: "flow" | "step" | "location" };
  type TreeDataProvider = {
    getChildren(element?: TreeElement): TreeElement[];
    getTreeItem(element: TreeElement): {
      label: string;
      description?: string;
      collapsibleState: number;
      command?: { command: string; arguments?: unknown[] };
    };
  };
  type ContentProvider = {
    provideTextDocumentContent(uri: MockUri): string;
  };

  class MockEventEmitter<T> {
    readonly event = (_listener: (event: T) => unknown) => ({ dispose() {} });

    fire(_event: T): void {}

    dispose(): void {}
  }

  class MockTreeItem {
    description: string | undefined;
    tooltip: string | undefined;
    contextValue: string | undefined;
    command: { command: string; title: string; arguments?: unknown[] } | undefined;

    constructor(
      readonly label: string,
      readonly collapsibleState: number,
    ) {}
  }

  class MockRange implements MockRangeValue {
    constructor(
      readonly startLine: number,
      readonly startCharacter: number,
      readonly endLine: number,
      readonly endCharacter: number,
    ) {}
  }

  class MockThemeColor {
    constructor(readonly id: string) {}
  }

  const commandHandlers = new Map<string, CommandHandler>();
  let treeDataProvider: TreeDataProvider | undefined;
  let contentProvider: ContentProvider | undefined;
  let messageHandler: ((message: unknown) => void) | undefined;
  let webviewHtml = "";
  const informationMessages: string[] = [];
  const outputLines: string[] = [];
  const revealedRanges: Array<MockRangeValue & { revealType: number }> = [];
  const decorationCalls: Array<{ uri: string; ranges: MockRangeValue[] }> = [];
  const gitCalls: Array<{ workingDirectory: string; args: string[] }> = [];
  const baseSource = createSource("base", 700);
  const targetSource = createSource("target", 700);
  const visibleTextEditors: Array<{
    document: {
      uri: MockUri;
      lineCount: number;
      lineAt(line: number): { text: string };
    };
    revealRange(range: MockRange, revealType: number): void;
    setDecorations(_decorationType: unknown, ranges: MockRange[]): void;
  }> = [];
  const diffCommands: Array<{
    left: MockUri;
    right: MockUri;
    title: string;
    baseContent: string;
    targetContent: string;
  }> = [];

  const childProcessMock = {
    execFile(
      executable: string,
      args: readonly string[],
      options: { cwd: string },
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) {
      assert.equal(executable, "git");
      const gitArgs = [...args];
      gitCalls.push({ workingDirectory: options.cwd, args: gitArgs });

      if (gitArgs[0] === "rev-parse" && gitArgs[1] === "--show-toplevel") {
        if (options.cwd === "/missing-workspace") {
          callback(new Error("not a git repository"), "", "not a git repository");
          return;
        }
        callback(null, "/workspace\n", "");
        return;
      }

      if (gitArgs[0] === "rev-parse" && gitArgs[1] === "--verify") {
        const revision = gitArgs.at(-1);
        callback(
          null,
          revision === "3ab8547^^{commit}" ? "base-commit\n" : "target-commit\n",
          "",
        );
        return;
      }

      if (gitArgs[0] === "cat-file" && gitArgs[1] === "blob") {
        callback(null, gitArgs[2].startsWith("base-commit:") ? baseSource : targetSource, "");
        return;
      }

      callback(new Error("unexpected git command"), "", gitArgs.join(" "));
    },
  };

  const vscodeMock = {
    Uri: {
      from(components: {
        scheme: string;
        authority?: string;
        path?: string;
        query?: string;
      }) {
        return createMockUri(
          components.path ?? "",
          components.scheme,
          components.authority ?? "",
          components.query ?? "",
        );
      },
      joinPath(base: { fsPath: string }, ...segments: string[]) {
        return createMockUri(join(base.fsPath, ...segments));
      },
    },
    EventEmitter: MockEventEmitter,
    Range: MockRange,
    ThemeColor: MockThemeColor,
    TreeItem: MockTreeItem,
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    ViewColumn: { One: 1 },
    TextEditorRevealType: { InCenter: 1 },
    OverviewRulerLane: { Full: 7 },
    workspace: {
      workspaceFolders: [
        { uri: createMockUri("/missing-workspace") },
        { uri: createMockUri("/workspace") },
      ],
      fs: {
        async readFile(uri: { fsPath: string }) {
          return new Uint8Array(readFileSync(uri.fsPath));
        },
        async stat(uri: { fsPath: string }) {
          if (uri.fsPath.startsWith("/missing-workspace/")) {
            throw new Error("file not found");
          }
          return { type: 1 };
        },
      },
      registerTextDocumentContentProvider(_scheme: string, provider: ContentProvider) {
        contentProvider = provider;
        return { dispose() {} };
      },
    },
    commands: {
      registerCommand(id: string, handler: CommandHandler) {
        commandHandlers.set(id, handler);
        return { dispose() {} };
      },
      async executeCommand(command: string, ...args: unknown[]) {
        assert.equal(command, "vscode.diff");
        const [left, right, title] = args as [MockUri, MockUri, string, unknown];
        const provider = contentProvider;
        assert.ok(provider);
        const baseContent = provider.provideTextDocumentContent(left);
        const targetContent = provider.provideTextDocumentContent(right);
        diffCommands.push({ left, right, title, baseContent, targetContent });

        const lines = targetContent.split(/\r?\n/);
        const editor = {
          document: {
            uri: right,
            lineCount: lines.length,
            lineAt(line: number) {
              return { text: lines[line] };
            },
          },
          revealRange(range: MockRange, revealType: number) {
            revealedRanges.push({ ...range, revealType });
          },
          setDecorations(_decorationType: unknown, ranges: MockRange[]) {
            decorationCalls.push({
              uri: right.toString(),
              ranges: ranges.map((range) => ({ ...range })),
            });
          },
        };
        visibleTextEditors.splice(0, visibleTextEditors.length, editor);
      },
    },
    window: {
      visibleTextEditors,
      createOutputChannel() {
        return {
          appendLine(line: string) {
            outputLines.push(line);
          },
          dispose() {},
        };
      },
      createTextEditorDecorationType() {
        return { dispose() {} };
      },
      createTreeView(_id: string, options: { treeDataProvider: TreeDataProvider }) {
        treeDataProvider = options.treeDataProvider;
        return { dispose() {} };
      },
      createWebviewPanel() {
        return {
          webview: {
            get html() {
              return webviewHtml;
            },
            set html(value: string) {
              webviewHtml = value;
            },
            onDidReceiveMessage(handler: (message: unknown) => void) {
              messageHandler = handler;
              return { dispose() {} };
            },
          },
        };
      },
      async showInformationMessage(message: string) {
        informationMessages.push(message);
      },
      async showErrorMessage(message: string) {
        assert.fail(message);
      },
      async showTextDocument() {
        assert.fail("Phase 6では通常Source Editorを開かない");
      },
    },
  };

  const moduleRuntime = require("node:module") as {
    _load: ModuleLoader;
  };
  const originalLoad = moduleRuntime._load;
  moduleRuntime._load = (request, parent, isMain) => request === "vscode"
    ? vscodeMock
    : request === "node:child_process"
      ? childProcessMock
      : Reflect.apply(originalLoad, moduleRuntime, [request, parent, isMain]) as unknown;

  try {
    const extension = require("../src/extension") as {
      activate(context: unknown): void;
    };
    const context = {
      extensionUri: createMockUri(process.cwd()),
      subscriptions: [] as unknown[],
    };

    extension.activate(context);
    const openReview = commandHandlers.get("aiChangeReview.openReview");
    assert.ok(openReview);
    await openReview();

    assert.match(webviewHtml, /最後に与えた時変値を自動で記録・再生する/);
    assert.match(webviewHtml, /data-flow-id="replay-execution"/);
    assert.ok(messageHandler);
    assert.ok(treeDataProvider);
    assert.ok(contentProvider);

    const flows = treeDataProvider.getChildren();
    assert.equal(flows.length, 4);
    const firstFlowItem = treeDataProvider.getTreeItem(flows[0]);
    assert.equal(firstFlowItem.label, "Replay execution");
    assert.equal(firstFlowItem.description, "current flow");

    let replaySteps = treeDataProvider.getChildren(flows[0]);
    assert.match(treeDataProvider.getTreeItem(replaySteps[0]).label, /^→ /);
    assert.match(treeDataProvider.getTreeItem(replaySteps[1]).label, /^○ /);

    const thirdStepItem = treeDataProvider.getTreeItem(replaySteps[2]);
    assert.ok(thirdStepItem.command);
    const selectThirdStep = commandHandlers.get(thirdStepItem.command.command);
    assert.ok(selectThirdStep);
    await selectThirdStep(...(thirdStepItem.command.arguments ?? []));

    assert.equal(diffCommands.length, 1);
    assert.equal(diffCommands[0].left.scheme, "ai-change-review-git");
    assert.equal(diffCommands[0].left.authority, "base");
    assert.equal(diffCommands[0].right.authority, "target");
    assert.equal(diffCommands[0].baseContent, baseSource);
    assert.equal(diffCommands[0].targetContent, targetSource);
    assert.match(diffCommands[0].title, /request\.py/);
    assert.deepEqual(revealedRanges, [{
      startLine: 14,
      startCharacter: 0,
      endLine: 20,
      endCharacter: "target line 21".length,
      revealType: 1,
    }]);
    assert.deepEqual(decorationCalls.at(-1)?.ranges, [{
      startLine: 14,
      startCharacter: 0,
      endLine: 20,
      endCharacter: "target line 21".length,
    }]);

    replaySteps = treeDataProvider.getChildren(flows[0]);
    assert.match(treeDataProvider.getTreeItem(replaySteps[0]).label, /^✓ /);
    assert.match(treeDataProvider.getTreeItem(replaySteps[1]).label, /^✓ /);
    assert.match(treeDataProvider.getTreeItem(replaySteps[2]).label, /^→ /);
    assert.match(treeDataProvider.getTreeItem(replaySteps[3]).label, /^○ /);

    const multiLocationStep = replaySteps[1];
    assert.equal(treeDataProvider.getTreeItem(multiLocationStep).collapsibleState, 1);
    const locations = treeDataProvider.getChildren(multiLocationStep);
    assert.equal(locations.length, 3);
    assert.equal(treeDataProvider.getTreeItem(locations[0]).label, "engineProtocol.ts");
    assert.equal(treeDataProvider.getTreeItem(locations[0]).description, "L98-101");

    const secondLocationItem = treeDataProvider.getTreeItem(locations[1]);
    assert.ok(secondLocationItem.command);
    const openSecondLocation = commandHandlers.get(secondLocationItem.command.command);
    assert.ok(openSecondLocation);
    await openSecondLocation(...(secondLocationItem.command.arguments ?? []));
    assert.equal(diffCommands.at(-1)?.right.path, "/vscode-extension/emdb/package.json");
    assert.deepEqual(revealedRanges.at(-1), {
      startLine: 227,
      startCharacter: 0,
      endLine: 238,
      endCharacter: "target line 239".length,
      revealType: 1,
    });
    assert.deepEqual(decorationCalls.at(-2)?.ranges, []);
    assert.equal(decorationCalls.at(-1)?.uri, diffCommands.at(-1)?.right.toString());

    const secondFlowItem = treeDataProvider.getTreeItem(flows[1]);
    assert.ok(secondFlowItem.command);
    const selectSecondFlow = commandHandlers.get(secondFlowItem.command.command);
    assert.ok(selectSecondFlow);
    selectSecondFlow(...(secondFlowItem.command.arguments ?? []));

    const updatedFlows = treeDataProvider.getChildren();
    assert.equal(treeDataProvider.getTreeItem(updatedFlows[0]).description, undefined);
    assert.equal(treeDataProvider.getTreeItem(updatedFlows[1]).description, "current flow");
    const persistenceSteps = treeDataProvider.getChildren(updatedFlows[1]);
    assert.match(treeDataProvider.getTreeItem(persistenceSteps[0]).label, /^→ /);
    assert.match(treeDataProvider.getTreeItem(persistenceSteps[1]).label, /^○ /);
    assert.deepEqual(decorationCalls.at(-1)?.ranges, []);

    assert.ok(gitCalls.some(({ args }) => args[0] === "cat-file"));

    messageHandler({ type: "openFlow", flowId: "replay-execution" });
    assert.deepEqual(outputLines, ["openFlowを受信: replay-execution"]);
    assert.deepEqual(informationMessages, ["Flowを受信しました: replay-execution"]);
  } finally {
    moduleRuntime._load = originalLoad;
  }
});

function createMockUri(
  path: string,
  scheme = "file",
  authority = "",
  query = "",
): MockUri {
  return {
    scheme,
    authority,
    path,
    query,
    fsPath: path,
    toString() {
      const suffix = query ? `?${query}` : "";
      return `${scheme}://${authority}${path}${suffix}`;
    },
  };
}

function createSource(prefix: string, lineCount: number): string {
  return Array.from({ length: lineCount }, (_, index) => `${prefix} line ${index + 1}`).join("\n");
}
