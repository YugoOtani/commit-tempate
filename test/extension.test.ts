import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "node:test";

type ModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown;

it("commandからOverviewを開き、openFlowメッセージを受信する", async () => {
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

  const commandHandlers = new Map<string, CommandHandler>();
  let treeDataProvider: TreeDataProvider | undefined;
  let messageHandler: ((message: unknown) => void) | undefined;
  let webviewHtml = "";
  const informationMessages: string[] = [];
  const outputLines: string[] = [];
  const shownDocuments: string[] = [];
  const revealedRanges: Array<{
    startLine: number;
    startCharacter: number;
    endLine: number;
    endCharacter: number;
    revealType: number;
  }> = [];

  class MockRange {
    constructor(
      readonly startLine: number,
      readonly startCharacter: number,
      readonly endLine: number,
      readonly endCharacter: number,
    ) {}
  }

  const vscodeMock = {
    Uri: {
      joinPath(base: { fsPath: string }, ...segments: string[]) {
        return { fsPath: join(base.fsPath, ...segments) };
      },
    },
    EventEmitter: MockEventEmitter,
    Range: MockRange,
    TreeItem: MockTreeItem,
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    ViewColumn: { One: 1 },
    TextEditorRevealType: { InCenter: 1 },
    workspace: {
      workspaceFolders: [
        { uri: { fsPath: "/missing-workspace" } },
        { uri: { fsPath: "/workspace" } },
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
    },
    commands: {
      registerCommand(id: string, handler: CommandHandler) {
        commandHandlers.set(id, handler);
        return { dispose() {} };
      },
    },
    window: {
      createOutputChannel() {
        return {
          appendLine(line: string) {
            outputLines.push(line);
          },
          dispose() {},
        };
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
      async showTextDocument(uri: { fsPath: string }) {
        shownDocuments.push(uri.fsPath);
        return {
          revealRange(range: MockRange, revealType: number) {
            revealedRanges.push({
              startLine: range.startLine,
              startCharacter: range.startCharacter,
              endLine: range.endLine,
              endCharacter: range.endCharacter,
              revealType,
            });
          },
        };
      },
    },
  };

  const moduleRuntime = require("node:module") as {
    _load: ModuleLoader;
  };
  const originalLoad = moduleRuntime._load;
  moduleRuntime._load = (request, parent, isMain) => request === "vscode"
    ? vscodeMock
    : Reflect.apply(originalLoad, moduleRuntime, [request, parent, isMain]) as unknown;

  try {
    const extension = require("../src/extension") as {
      activate(context: unknown): void;
    };
    const context = {
      extensionUri: { fsPath: process.cwd() },
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

    assert.deepEqual(shownDocuments, [
      join("/workspace", "python/emfrp_debugger/vscode_adapter/request.py"),
    ]);
    assert.deepEqual(revealedRanges, [{
      startLine: 14,
      startCharacter: 0,
      endLine: 20,
      endCharacter: 0,
      revealType: 1,
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
    assert.equal(
      shownDocuments.at(-1),
      join("/workspace", "vscode-extension/emdb/package.json"),
    );
    assert.deepEqual(revealedRanges.at(-1), {
      startLine: 227,
      startCharacter: 0,
      endLine: 238,
      endCharacter: 0,
      revealType: 1,
    });

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

    messageHandler({ type: "openFlow", flowId: "replay-execution" });
    assert.deepEqual(outputLines, ["openFlowを受信: replay-execution"]);
    assert.deepEqual(informationMessages, ["Flowを受信しました: replay-execution"]);
  } finally {
    moduleRuntime._load = originalLoad;
  }
});
