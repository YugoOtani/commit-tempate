import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "node:test";

type ModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown;

it("commandからOverviewを開き、openFlowメッセージを受信する", async () => {
  let commandHandler: (() => Promise<void>) | undefined;
  let messageHandler: ((message: unknown) => void) | undefined;
  let webviewHtml = "";
  const informationMessages: string[] = [];
  const outputLines: string[] = [];

  const vscodeMock = {
    Uri: {
      joinPath(base: { fsPath: string }, ...segments: string[]) {
        return { fsPath: join(base.fsPath, ...segments) };
      },
    },
    ViewColumn: { One: 1 },
    workspace: {
      fs: {
        async readFile(uri: { fsPath: string }) {
          return new Uint8Array(readFileSync(uri.fsPath));
        },
      },
    },
    commands: {
      registerCommand(_id: string, handler: () => Promise<void>) {
        commandHandler = handler;
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
      createTreeView() {
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
    assert.ok(commandHandler);
    await commandHandler();

    assert.match(webviewHtml, /最後に与えた時変値を自動で記録・再生する/);
    assert.match(webviewHtml, /data-flow-id="replay-execution"/);
    assert.ok(messageHandler);

    messageHandler({ type: "openFlow", flowId: "replay-execution" });
    assert.deepEqual(outputLines, ["openFlowを受信: replay-execution"]);
    assert.deepEqual(informationMessages, ["Flowを受信しました: replay-execution"]);
  } finally {
    moduleRuntime._load = originalLoad;
  }
});
