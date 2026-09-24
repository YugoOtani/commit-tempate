# AI Change Review MVP 仕様書

## 1. 目的

AI が実装した変更について、人間が短時間で、

- 何を実装したか
- どのような構造で実現したか
- 実際にどのコードを変更したか
- 各変更箇所が実装全体の中で何を担うか

を理解できる VS Code Extension を作る。

目標は単なる AI Code Review ではない。

> AI が書いたコードについて、自分で実装した場合に近い mental model を形成するまでの時間を短縮する。

MVP では特に、

> 実装概要 → Flow → Git Diff → Source Explanation

という順序でコードを読むことが、通常のファイル順 diff より理解を速めるかを検証する。

---

# 2. UX 全体像

VS Code 内で以下の3つを組み合わせる。

```text
┌──────────────── VS Code ──────────────────────────────┐
│                                                       │
│  Overview Webview                                     │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Implementation Overview                         │  │
│  │                                                 │  │
│  │ Summary                                         │  │
│  │ Implementation                                  │  │
│  │ Available Flows                                 │  │
│  │                                                 │  │
│  │ [Open Replay Flow]                              │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  Sidebar                      Editor                   │
│  ┌─────────────────┐         ┌─────────────────────┐  │
│  │ Flow Navigator  │         │ Git Diff            │  │
│  │                 │         │                     │  │
│  │ Replay ▼        │         │ changed code        │  │
│  │                 │         │                     │  │
│  │ ✓ UI select     │         │ 💬 Explanation     │  │
│  │ ✓ protocol      │         │                     │  │
│  │ → trace load    │         │ changed code        │  │
│  │ ○ debugger      │         │                     │  │
│  └─────────────────┘         └─────────────────────┘  │
│                                                       │
└───────────────────────────────────────────────────────┘
```

役割は明確に分ける。

## Overview Webview

変更全体を俯瞰する。

答える質問:

> 今回、何をどのように実装したのか。

## Flow Tree View

実装を理解する順番を提示する。

答える質問:

> この機能はどのような処理の流れで実現されているのか。

## Git Diff Editor

実際の変更コードを読む。

答える質問:

> 具体的にどのコードを変更したのか。

## Source Explanation

変更箇所の意味を補足する。

答える質問:

> この変更箇所は実装全体の中で何を担っているのか。

---

# 3. 中心概念

レビュー対象は Git commit ではなく `Change` とする。

`Change` は、一つの変更要求に対して行われた実装全体を表す。

```text
Change Request

     ↓

base revision

     ↓

implementation

     ↓

target revision
```

Git revision は、変更前後のソースコードを取得するための技術情報でしかない。

UI 上では commit を中心概念にしない。

---

# 4. MVP Schema

以下を正本とする。

```ts
type ChangeReview = {
  change: {
    id: string
    title: string
    request?: string

    baseRevision: string
    targetRevision: string
  }

  overview: {
    summary: string
    implementation: string[]
  }

  flows: {
    id: string
    title: string
    description?: string

    steps: {
      id: string
      title: string
      description?: string
      locationIds: string[]
    }[]
  }[]

  locations: {
    id: string

    file: string

    startLine: number
    endLine: number
  }[]

  explanations: {
    locationId: string

    title: string
    role: string

    why?: string
    watch?: string[]
  }[]
}
```

---

# 5. Schema の設計方針

以前使用していた `ChangeUnit` は導入しない。

情報構造は以下とする。

```text
Change
│
├─ Overview
│
├─ Flow
│   └─ Flow Step
│       └─ Source Location
│
└─ Explanation
    └─ Source Location
```

`SourceLocation` を中心ノードとして扱う。

Flow と Explanation の両方が SourceLocation を参照する。

---

# 6. Review JSON 例

```json
{
  "change": {
    "id": "change-001",
    "title": "最後に与えた時変値を自動で記録・再生する",
    "request": "最後に与えた時変値を自動的に保存し、次回起動時に再生できるようにする",
    "baseRevision": "BASE_SHA",
    "targetRevision": "TARGET_SHA"
  },

  "overview": {
    "summary": "保存済み入力履歴を再生する user-replay モードを追加した。",
    "implementation": [
      "VS Code から Python まで execution mode を伝播する",
      "保存済み trace を InputInterface として復元する",
      "既存の Debugger 実行経路を再利用する"
    ]
  },

  "flows": [
    {
      "id": "replay-execution",
      "title": "Replay execution",
      "description": "ユーザーが Replay を選択してから保存済み入力で実行されるまで",
      "steps": [
        {
          "id": "select-replay",
          "title": "Replay モードを選択する",
          "locationIds": [
            "loc-select-replay"
          ]
        },

        {
          "id": "send-mode",
          "title": "execution mode を Python へ送る",
          "locationIds": [
            "loc-engine-protocol",
            "loc-python-request"
          ]
        },

        {
          "id": "load-trace",
          "title": "保存済み trace を読み込む",
          "locationIds": [
            "loc-load-trace"
          ]
        },

        {
          "id": "attach-input",
          "title": "Debugger へ入力源を登録する",
          "locationIds": [
            "loc-debugger-input"
          ]
        }
      ]
    }
  ],

  "locations": [
    {
      "id": "loc-load-trace",
      "file": "python/emfrp_debugger/emfrp_bridge/services/input_trace_manager.py",
      "startLine": 40,
      "endLine": 80
    }
  ],

  "explanations": [
    {
      "locationId": "loc-load-trace",
      "title": "保存済み trace を入力源へ復元",
      "role": "保存された入力履歴を既存の InputInterface として再生可能な状態にする。",
      "why": "Replay 専用の実行ループを作らず、既存の入力抽象を再利用するため。",
      "watch": [
        "program ID が一致しない trace は読み込まない",
        "不正なレコードは読み込み失敗として扱う"
      ]
    }
  ]
}
```

---

# 7. Overview Webview

## 7.1 目的

変更全体をコードを見る前に理解する。

Webview では細かな diff を表示しない。

表示内容は以下に限定する。

```text
Change title

Implementation Overview

Summary

Implementation
- ...
- ...
- ...

Flows
- Replay execution
- Trace persistence
- Error propagation
```

---

## 7.2 想定 UI

```text
┌─────────────────────────────────────────────┐
│ 最後に与えた時変値を自動で記録・再生       │
├─────────────────────────────────────────────┤
│                                             │
│ Implementation Overview                     │
│                                             │
│ 保存済み入力履歴を user-replay mode で      │
│ 再生できるようにする。                      │
│                                             │
│ Implementation                              │
│                                             │
│ ✓ execution mode を VSCode → Python に伝播 │
│ ✓ trace を InputInterface へ復元            │
│ ✓ 既存 Debugger 経路を再利用               │
│                                             │
│ Flows                                       │
│                                             │
│ Replay execution          4 steps   [Open] │
│ Trace persistence         3 steps   [Open] │
│ Error propagation         4 steps   [Open] │
│                                             │
└─────────────────────────────────────────────┘
```

---

# 8. Webview → Flow Navigation

Flow の `Open` をクリックすると VS Code Extension に message を送る。

例:

```ts
vscode.postMessage({
  type: "openFlow",
  flowId: "replay-execution"
})
```

Extension 側では以下を行う。

```text
openFlow(flowId)

↓
Flow Tree を該当 Flow へ切り替える

↓
最初の Step を current にする

↓
最初の SourceLocation の diff を開く
```

Overview Webview は「実装理解の開始地点」とする。

---

# 9. Flow Navigator

## 9.1 実装

VS Code の標準 `TreeView` を使用する。

MVP では Webview で Flow Graph を描画しない。

---

## 9.2 表示

```text
Replay execution

✓ Replay モードを選択

✓ execution mode を送信

→ 保存済み trace を読み込む
  ↑ current

○ Debugger へ入力源を登録

○ 既存経路で実行
```

状態は最低限以下を持つ。

```text
completed
current
remaining
```

厳密なレビュー完了状態ではなく、ナビゲーション上の現在位置として扱う。

---

# 10. Flow 切り替え

一つの Change は複数 Flow を持てる。

例:

```text
Replay execution
Trace persistence
Error propagation
```

MVP では以下のいずれかを使用する。

優先順位:

1. TreeView 内に Flow root を並べる
2. QuickPick
3. View Title の command

まず最も実装が簡単な方法を採用する。

---

# 11. Flow Step → Source Location

Flow Step をクリックすると Source Location を開く。

```text
FlowStep

↓ locationIds

SourceLocation

↓ file + range

Diff Editor
```

一つの Step が複数 SourceLocation を持つ場合は Tree の子ノードとして表示する。

例:

```text
execution mode を Python へ送る
├─ engineProtocol.ts
└─ request.py
```

---

# 12. Git Diff Integration

レビューの主画面は通常 Source ではなく Git Diff とする。

対象:

```text
baseRevision
    vs
targetRevision
```

---

# 13. Diff の取得

対象 SourceLocation のファイルについて、

```text
baseRevision:file
```

と

```text
targetRevision:file
```

を取得する。

取得方法は既存 Git command / Git API のうち、現在の実装環境で最も単純な方法を採用する。

MVP では性能最適化は不要。

---

# 14. Diff Editor

VS Code 標準 Diff Editor を優先する。

独自 diff renderer は作らない。

想定 UI:

```text
┌──────── Flow ────────┐
│                      │
│ Replay execution     │
│                      │
│ ✓ UI select          │
│ ✓ protocol           │
│ → trace loading      │
│ ○ debugger           │
│                      │
└──────────────────────┘

┌──────────────── Git Diff ──────────────────┐
│ input_trace_manager.py                     │
│                                            │
│ - old                                      │
│ + class SavedInputTraceIter(...)           │
│ +     ...                                  │
│                                            │
│   Implementation explanation               │
│   保存済み trace を入力源へ復元            │
│                                            │
└────────────────────────────────────────────┘
```

---

# 15. Source Location Navigation

Flow Step を選択したら、

1. 対象ファイルの Diff Editor を開く
2. target 側の該当 range を reveal する
3. 対象 range を highlight する

ところまで行う。

---

# 16. Current Location Highlight

Flow 上の current Step とエディタ位置を同期する。

例:

```text
Flow

✓ UI selection
✓ protocol
→ trace loading
○ debugger
```

Editor:

```text
┃ class SavedInputTraceIter(...)
┃
┃     def load_saved_trace(...):
┃         ...
```

VS Code Decoration API を使い、

- gutter
- background
- border

などで軽く強調する。

通常の syntax highlight を邪魔しないこと。

---

# 17. Source Explanation

説明は Change 全体ではなく、Source Location ごとに持つ。

## 表示内容

```text
Title

Role

Why

Watch
```

---

# 18. Explanation Writing Rule

## 18.1 コードの逐語訳をしない

悪い例:

```text
ファイルを開いて1行ずつ読み込む。
```

良い例:

```text
保存済みの入力履歴を既存の InputInterface として
再生可能な状態へ復元する。
```

---

## 18.2 Role を最優先する

Role は、

> このコードが今回の実装全体の中で何を担うか

を書く。

---

## 18.3 Why

コードから直接は分からない設計理由を書く。

例:

```text
Replay 専用の実行ループを追加せず、
既存の InputInterface を再利用するため。
```

---

## 18.4 Watch

重要な、

- 前提条件
- 分岐
- failure
- 副作用

だけを書く。

---

# 19. Explanation UI

最終的には GitHub Review Comment に近い inline UI を目指す。

```text
  class SavedInputTraceIter(...):
      ...

  ┌─────────────────────────────────────┐
  │ 保存済み trace を入力源へ復元       │
  │                                     │
  │ 保存履歴を InputInterface として     │
  │ Debugger へ渡せる状態にする。        │
  │                                     │
  │ Why                                 │
  │ 既存入力経路を再利用するため。      │
  │                                     │
  └─────────────────────────────────────┘
```

ただし MVP では表示方式を固定しない。

検証順序:

1. CodeLens
2. Decoration + Hover
3. Comments API

最小コストで「コード横の説明」の UX を確認する。

MVP では CodeLens を採用する。

ただし、Diff Editor で CodeLens を表示するには VS Code の
`diffEditor.codeLens` 設定を有効にする必要がある。
MVP の UX 確認後、追加設定に依存せず Explanation を確認できる方式として、
Decoration + Hover 案を検討する。
この検討および方式変更は MVP の完成条件には含めない。

Comments API が自然に使えるなら採用する。

---

# 20. Full Source

Diff だけでは文脈不足になる場合がある。

そのため、

```text
Open Full Source
```

command を用意する。

開いた Source Editor でも同じ SourceLocation を reveal / highlight する。

役割分担:

```text
Git Diff
= 今回どう変更したか

Full Source
= 既存コードの中でどう位置づけられるか
```

---

# 21. Webview と Editor の責務

## Webview

表示する:

- Change title
- summary
- implementation points
- available flows

表示しない:

- 大量の source code
- diff
- line-level explanations

---

## TreeView

表示する:

- Flow
- Step
- current location
- SourceLocation

---

## Diff Editor

表示する:

- 実際の変更
- current location highlight
- Source Explanation

---

# 22. Standalone HTML

MVP では standalone HTML を正本にしない。

Webview を正本とする。

将来的に必要になった場合、

```text
review.json
      │
      ├─ Overview Webview
      │
      └─ Standalone HTML export
```

という構成にする。

Standalone HTML は、

- CI artifact
- 保存
- 共有
- 印刷

用途の export format として扱う。

---

# 23. MVP 実装 Phase

## Phase 1

### やること

- Schema 定義
- validation
- 手書き `review.json`
- 実際の変更1件を fixture にする

### やらないこと

- AI 自動生成
- GitHub integration
- Evidence

---

# 24. Phase 2 — Extension Skeleton

### やること

VS Code Extension を作成し、

- command
- custom View
- Webview Panel

を登録する。

最低限、

```text
AI Change Review: Open Review
```

command で fixture を開けるようにする。

---

# 25. Phase 3 — Overview Webview

### やること

`review.json` から Overview Webview を生成する。

表示:

- title
- summary
- implementation
- flows

Flow の `Open` ボタンを実装する。

---

# 26. Phase 4 — Flow TreeView

### やること

- Flow 一覧表示
- Step 一覧表示
- Flow 切り替え
- current Step 表示

まだ Git Diff とは接続しなくてよい。

---

# 27. Phase 5 — Source Navigation

### やること

Flow Step から通常 Source Editor の SourceLocation にジャンプする。

まず、

```text
TreeView
↓
showTextDocument
↓
revealRange
```

だけを完成させる。

---

# 28. Phase 6 — Git Diff

### やること

baseRevision / targetRevision から対象ファイルの内容を取得する。

標準 Diff Editor を開く。

Flow Step クリックで該当 Diff へ移動する。

---

# 29. Phase 7 — Highlight

### やること

current SourceLocation を Decoration で強調する。

Flow 上の current Step と Editor の表示を同期する。

---

# 30. Phase 8 — Explanation

### やること

`explanations` を読み、

SourceLocation に対応する説明を表示する。

最初は最も単純な UI を採用する。

---

# 31. Phase 9 — Full Source

### やること

Diff から Full Source を開く command を追加する。

同じ SourceLocation を highlight する。

---

# 32. Phase 10 — Webview → Flow Integration

### やること

Overview Webview の Flow `Open` ボタンから、

- Flow 選択
- current Step 選択
- Diff open

まで一連で行う。

ここまでで MVP UX を完成とする。

---

# 33. Phase 11 — AI Schema Generation

UI の有効性確認後にのみ実装する。

AI 入力候補:

```text
Change request

base source

target source

git diff

repository context
```

生成対象:

```text
overview
flows
steps
locations
explanations
```

---

# 34. AI Generation Rule

AI には以下を要求する。

```text
- Git hunk 単位で説明を作らない
- 人間が実装を理解する単位で SourceLocation を選ぶ
- コードを逐語訳しない
- 実装全体での役割を書く
- 前後の処理との関係を意識する
- 設計理由を書く
- 重要な failure / condition のみ Watch にする
- Flow は「コードを理解する順序」で構成する
- ファイル順をそのまま Flow にしない
```

---

# 35. MVP 完成条件

以下をすべて満たせば MVP 完成とする。

- `review.json` を読み込める
- Overview Webview が表示される
- Webview から Flow を選べる
- TreeView に複数 Flow が表示される
- Flow を切り替えられる
- Flow Step が表示される
- current Step が分かる
- Flow Step から SourceLocation に移動できる
- Git Diff Editor を開ける
- 対象 SourceLocation が highlight される
- Source Explanation を確認できる
- Full Source を開ける

---

# 36. MVP では実装しないもの

以下は対象外。

- Change Unit
- Evidence
- risk score
- correctness review
- AI automated fixing
- GitHub PR integration
- GitHub API integration
- reviewer approval
- comment editing
- multi-user review
- runtime tracing
- control-flow static analysis
- data-flow static analysis
- symbol dependency graph
- live working-tree sync
- sophisticated graph visualization
- branch visualization
- CI integration
- standalone HTML export
- commit history UI

---

# 37. MVP の検証項目

## 仮説1

Implementation Overview を最初に読むことで、Diff を読み始める前に実装の mental model を形成できるか。

## 仮説2

ファイル順ではなく Flow 順に Diff を読むことで、実装理解が速くなるか。

## 仮説3

Source Explanation によって、

```text
なぜこのコードが必要なのか
```

を推測する時間が減るか。

## 仮説4

Diff を主画面にして、必要な場合だけ Full Source に移動することで、

```text
Diff の文脈不足
```

と

```text
Source 全体を読むコスト
```

の両方を抑えられるか。

## 仮説5

Webview → Flow Tree → Diff Editor という粒度移動が自然か。

---

# 38. 実装時の進め方

各 Phase の開始時に必ず、

```text
今回やること

今回やらないこと
```

を明示する。

各 Phase の完了時に実際の UI を動かして確認する。

一度に複数 Phase を進めすぎない。

優先順位は以下。

```text
手動 fixture

↓

UX 検証

↓

UI 固定

↓

Schema 固定

↓

AI 自動生成
```

AI 生成の精度改善を UI 検証より先に行わない。

---

# 39. 推奨ディレクトリ構成

例:

```text
src/
├─ extension.ts
│
├─ review/
│  ├─ schema.ts
│  ├─ loader.ts
│  ├─ validation.ts
│  └─ state.ts
│
├─ overview/
│  ├─ overviewPanel.ts
│  └─ renderOverview.ts
│
├─ flow/
│  ├─ flowTreeProvider.ts
│  └─ flowNavigation.ts
│
├─ source/
│  ├─ diffProvider.ts
│  ├─ sourceNavigation.ts
│  ├─ decoration.ts
│  └─ explanation.ts
│
└─ fixtures/
   └─ review.json
```

MVP の段階では過度に抽象化しない。

---

# 40. 最終的な MVP の利用フロー

ユーザーが、

```text
AI Change Review: Open Review
```

を実行する。

↓

Overview Webview が開く。

```text
Implementation Overview

保存済み入力履歴を再生する user-replay mode を追加。

Implementation
✓ VSCode → Python へ execution mode を伝播
✓ trace を InputInterface へ復元
✓ 既存 Debugger 経路を再利用
```

↓

`Replay execution` を選ぶ。

↓

左 Sidebar に Flow が表示される。

```text
✓ Replay 選択
→ execution mode 送信
○ trace 読込
○ debugger setup
```

↓

Flow Step を押す。

↓

Git Diff が対象コード位置を開く。

↓

該当範囲に Explanation が表示される。

```text
保存済み trace を入力源へ復元

Role
保存履歴を InputInterface として
Debugger へ渡せる状態にする。

Why
既存入力経路を再利用するため。
```

↓

必要な場合だけ Full Source を開く。

これを MVP の完成形とする。
