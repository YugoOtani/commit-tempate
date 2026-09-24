この仕様書に従って実装を進めてください。

ただし、一度にMVP全体を実装しないでください。

今回は Phase 1〜3 のみを実装してください。

## 今回やること

- `ChangeReview` schema の定義
- schema validation
- EmfrpDebugger の `review.json` fixture の追加
- VS Code Extension の基本構造確認・必要な最小修正
- `AI Change Review: Open Review` command の追加
- `review.json` を読み込んで Overview Webview を表示
- Overview Webview に以下を表示
  - Change title
  - summary
  - implementation
  - flows
- Flow の `Open` ボタンから extension 側へ `flowId` を送信できるところまで実装

## 今回やらないこと

- Flow TreeView
- Git Diff
- Source navigation
- SourceLocation highlight
- Explanation表示
- Comments API
- Full Source navigation
- AIによるschema生成
- Evidence
- GitHub連携

## 実装方針

- 既存コードの設計・命名・スタイルを尊重する
- 関係のないリファクタリングをしない
- 将来必要になるかもしれないだけの抽象化を追加しない
- MVPに不要な依存ライブラリを追加しない
- 既存のVS Code標準APIで実装できるものは標準APIを優先する
- fixtureの内容は仕様書に記載したEmfrpDebuggerのJSONを使用する
- UIはまず機能確認を優先し、過度に作り込まない

## 作業開始前

最初に以下を確認してください。

1. 現在のリポジトリ構成
2. VS Code Extension の既存エントリポイント
3. `package.json` の既存command/view定義
4. TypeScriptのビルド・テスト方法
5. 今回変更予定のファイル一覧

そのうえで、実装方針を短く説明してから変更してください。

## 実装後

以下を報告してください。

- 変更したファイル
- 各変更の目的
- 実行したbuild / test / lint
- 動作確認手順
- 未実装のPhase
- 次のPhaseで必要になる作業

Phase 1〜3 が動作することを確認した時点で停止してください。