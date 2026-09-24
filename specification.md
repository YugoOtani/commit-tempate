# AI Change Review MVP 実装手順

## 目的

AI が実装した変更について、人間が「自分で実装した場合に近い理解」を短時間で形成できるレビュー UI を作る。

MVP では、以下の体験を実現する。

1. HTML で変更全体の実装概要を把握する
2. VS Code 上で複数の実装フローから読みたいフローを選択する
3. フローの各 Step を辿ると、その Step に対応する Git 差分へ移動する
4. 変更箇所のコード上に、その実装上の役割・理由・注意点を表示する
5. 必要に応じて周辺コードを確認する

MVP の主な検証テーマは以下。

> Flow 順に差分を読むことで、通常のファイル順 diff より実装理解までの時間を短縮できるか。

高度な自動解析やレビュー機能は、この仮説を確認した後に追加する。

---

# 1. 基本コンセプト

レビュー対象の中心概念を Git commit ではなく `Change` とする。

`Change` は、ある変更要求に対して行われた一連の実装を表す。

```text
Change Request
      ↓
base revision
      ↓
implementation
      ↓
target revision
```

Git の revision は変更前後のソースコードを取得するための技術情報として扱い、ユーザーが理解する単位にはしない。

UI の基本構造は以下。

```text
HTML
Implementation Overview
        ↓
VS Code
Flow Navigator
        ↓
Git Diff
        ↓
Inline Explanation
        ↓
必要なら Full Source
```

---

# 2. MVP Schema

まず以下の schema を採用する。

```ts
type ChangeReview = {
  change: {
    title: string
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
    steps: {
      id: string
      title: string
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

## 設計方針

以前使用していた `ChangeUnit` は導入しない。

代わりに、

```text
Change
  ├─ Overview
  ├─ Flow
  │    └─ FlowStep
  │          └─ SourceLocation
  │
  └─ Explanation
            ↓
      SourceLocation
```

という構造にする。

`SourceLocation` を各情報を結びつける中心ノードとして扱う。

---

# 3. Phase 1: 手書き Fixture を作る

最初から AI に schema を生成させない。

まず実際の変更一件を選び、人間が手動で `review.json` を作成する。

例:

```json
{
  "change": {
    "title": "最後に与えた時変値を自動で記録・再生する",
    "baseRevision": "BASE_SHA",
    "targetRevision": "TARGET_SHA"
  },

  "overview": {
    "summary": "保存済み入力履歴を再生する user-replay モードを追加する。",
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
      "steps": [
        {
          "id": "select-replay",
          "title": "Replay モードを選択する",
          "locationIds": ["loc-select-replay"]
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
          "locationIds": ["loc-load-trace"]
        },
        {
          "id": "attach-input",
          "title": "Debugger へ入力源を登録する",
          "locationIds": ["loc-debugger-input"]
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

## この Phase の目的

schema が実際の UI を表現するのに十分か確認する。

まだ自動生成はしない。

---

# 4. Phase 2: VS Code Extension の骨格を作る

まず VS Code Extension を作る。

MVP に必要なのは以下の3機能のみ。

```text
Extension
├─ Flow View
├─ Source / Diff Navigation
└─ Explanation Rendering
```

最初は UI を洗練させず、機能確認を優先する。

---

# 5. Phase 3: Flow View を作る

VS Code の左サイドバーに専用 View を追加する。

想定 UI:

```text
CHANGE
最後に与えた時変値を自動で記録

Flow: Replay execution ▼

✓ Replay モードを選択
✓ execution mode を送信
→ 保存済み trace を読み込む
○ Debugger へ入力源を登録
○ 既存経路で実行
```

複数 Flow を切り替えられるようにする。

例:

```text
Replay execution
Trace persistence
Error propagation
```

実装方法はまず標準 `TreeView` を使用する。

Flow 切り替えは以下のいずれかでよい。

- Tree View 内の親ノード
- QuickPick
- View Title の command

MVP では最も簡単な方法を選ぶ。

---

# 6. Phase 4: Flow Step → Source Location の Navigation

Flow Step を選択したとき、その Step に紐づく Source Location へ移動する。

まず通常の source file で動作させる。

概念:

```ts
FlowStep
   ↓
locationIds
   ↓
SourceLocation
   ↓
showTextDocument()
   ↓
revealRange()
```

Step に複数の Source Location がある場合は、

```text
Step
├─ Location A
├─ Location B
└─ Location C
```

として子ノードとして表示してもよい。

または Step を再度実行することで順番に移動してもよい。

MVP では単純な Tree 表示を優先する。

---

# 7. Phase 5: Git Diff に統合する

通常 source へのジャンプが完成したら、Git Diff を表示する。

対象は、

```text
baseRevision
    vs
targetRevision
```

とする。

各 Source Location のファイルについて、変更前と変更後の内容を取得する。

標準 VS Code Diff Editor を優先的に使用する。

イメージ:

```text
┌──────── Flow ────────┐
│ Replay execution     │
│                      │
│ ✓ UI selection       │
│ ✓ protocol           │
│ → trace loading      │
│ ○ debugger setup     │
└──────────────────────┘

┌──────── Git Diff ─────────────────┐
│ input_trace_manager.py            │
│                                   │
│ - old implementation              │
│ + new implementation              │
│                                   │
│ + class SavedInputTraceIter(...)  │
└───────────────────────────────────┘
```

Flow Step をクリックすると、

1. 対象ファイルの Diff を開く
2. 対象 Source Location へスクロールする
3. 対象範囲を視覚的に強調する

ところまで実装する。

---

# 8. Phase 6: Source Explanation を表示する

変更箇所には AI 生成予定の説明を表示する。

説明の基本 schema は以下。

```ts
type Explanation = {
  locationId: string
  title: string
  role: string
  why?: string
  watch?: string[]
}
```

説明を書く際は以下を守る。

## Role

このコードが今回の実装全体で何を担っているかを書く。

悪い例:

```text
ファイルを開いて1行ずつ読み込む。
```

良い例:

```text
保存済みの入力履歴を既存の InputInterface として
再生可能な状態へ復元する。
```

## Why

コードから自明でない設計理由を書く。

例:

```text
Replay 専用の実行ループを作らず、
既存の入力抽象を再利用するため。
```

## Watch

重要な制約、分岐、副作用のみを書く。

例:

```text
- program ID 不一致は読み込み失敗として扱う
- 不正レコードも同様に Failure にする
```

---

# 9. Explanation UI

最終的には GitHub Review Comment に近い UI を目指す。

イメージ:

```text
  40  class SavedInputTraceIter(InputInterface):
  41      ...
  42
      ┌──────────────────────────────────────┐
      │ 保存済み trace を入力源へ復元       │
      │                                      │
      │ 保存履歴を InputInterface として     │
      │ Debugger に渡せる状態にする。        │
      │                                      │
      │ Why                                  │
      │ 既存の入力経路を再利用するため。     │
      └──────────────────────────────────────┘
```

ただし MVP では、Comments API に強く依存しなくてもよい。

最初の実装候補:

1. CodeLens
2. Decoration + Hover
3. Comments API

の順で検討する。

最も少ない実装量で、

> コードと説明を併置すると理解が速くなるか

を検証できる手段を選ぶ。

Comments API の UX が自然なら後から置き換える。

---

# 10. Source Location の強調

現在 Flow 上で選択している Source Location をコード上でも明示する。

例:

```text
Replay execution

✓ UI selection
✓ protocol
→ trace loading  ← current
○ debugger setup
```

エディタ側:

```text
┃ class SavedInputTraceIter(...)
┃
┃     def load_saved_trace(...):
┃         ...
```

`TextEditorDecorationType` 等を使い、

- gutter
- border
- background
- overview ruler

のいずれかで対象範囲を軽く強調する。

強調しすぎて通常の syntax highlighting を壊さないこと。

---

# 11. Full Source への移動

Diff だけでは周辺 context が足りない場合がある。

そのため Explanation あるいは command から、

```text
Open Full Source
```

を実行できるようにする。

役割分担は以下。

```text
Diff
変更内容を理解する

Full Source
既存コード中での位置づけを理解する
```

Full Source でも該当 Source Location を reveal / highlight する。

---

# 12. Phase 7: HTML Implementation Overview

VS Code UI と並行して、HTML では変更全体を俯瞰する。

HTML にはコード詳細を大量に表示しない。

表示内容は以下に限定する。

```text
Change Title

Implementation Overview

Summary
...

Implementation
- ...
- ...
- ...

Flows
- Replay execution
- Trace persistence
- Error propagation

Changed Files
9 files
```

必要に応じて、

```text
Open in VS Code
```

を用意する。

HTML の責務は、

> 何を理解する必要があるかを把握する

こと。

VS Code の責務は、

> それをどのコードでどう実現しているか理解する

こと。

---

# 13. HTML → VS Code Integration

MVP では一方向だけでよい。

HTML 側から例えば、

```text
Open Replay execution in VS Code
```

を押すと対象 Flow を開く。

URI Handler を使う場合は例えば、

```text
vscode://<extension-id>/review?flow=replay-execution
```

のような形を検討する。

双方向同期は後回しにする。

---

# 14. Phase 8: AI Schema Generation

UI が有効であることを確認してから AI 生成を導入する。

AI への入力候補:

```text
Change request
base source
target source
git diff
repository context
```

AI には以下を生成させる。

1. Implementation Overview
2. 実装理解に有効な Flow
3. 各 Flow の Step
4. Flow Step と Source Location の対応
5. 各 Source Location の Explanation

生成ルール:

```text
- Git hunk 単位で説明を分割しない
- 意味のある実装単位で Source Location を選ぶ
- コードを逐語訳しない
- 実装全体における役割を最優先する
- 前後の処理との接続関係を意識する
- コードから自明でない設計理由を書く
- 重要な条件・副作用・失敗ケースのみ Watch とする
```

AI が生成した schema は JSON Schema 等で validation する。

---

# 15. MVP 完成条件

以下がすべてできれば MVP 完成とする。

- 変更1件を `review.json` として読み込める
- HTML で Implementation Overview を確認できる
- VS Code 左ペインに複数 Flow を表示できる
- Flow を切り替えられる
- Flow Step を選択すると対象 source / diff へ移動する
- 現在位置が Flow 上で分かる
- 対象コード範囲がエディタ上で分かる
- 対象コードに Implementation Explanation が表示される
- 必要に応じて Full Source を開ける

---

# 16. MVP では実装しないもの

以下は後回しにする。

- Evidence
- リスク判定
- AI による正誤レビュー
- GitHub PR 連携
- GitHub API 連携
- 複数人レビュー
- コメント編集
- runtime tracing
- symbol graph の高度な解析
- data-flow / control-flow の静的解析
- working tree へのリアルタイム追従
- branch を含む高度な Flow graph
- Flow 自動レイアウト
- commit ごとの履歴 UI
- Change Unit
- 自動修正
- レビュー承認機能

---

# 17. 推奨実装順序

以下の順で進める。

```text
Phase 1
Schema 定義
+
手書き review.json fixture

        ↓

Phase 2
VS Code Extension の骨格

        ↓

Phase 3
Flow Tree View

        ↓

Phase 4
Flow Step → Full Source Navigation

        ↓

Phase 5
Git Diff Integration

        ↓

Phase 6
Source Location Highlight

        ↓

Phase 7
Explanation 表示

        ↓

Phase 8
HTML Implementation Overview

        ↓

Phase 9
HTML → VS Code 連携

        ↓

Phase 10
AI Schema Generation
```

---

# 18. 各 Phase の進め方

各 Phase では、実装前に以下を明示する。

```text
今回やること
- ...

今回やらないこと
- ...
```

実装後は必ず実際に動作確認する。

一度に複数 Phase を実装せず、各 Phase の UI / UX が成立していることを確認してから次へ進む。

特に以下の順序を守る。

```text
手動データで UX を確認
        ↓
UI を固定
        ↓
schema を固定
        ↓
最後に AI 生成を自動化
```

AI 生成精度の改善を、UI 検証より先に行わないこと。

---

# 19. MVP で最も確認したいこと

技術的な完成度より、以下を検証する。

## 仮説1

Flow 順にコードを読むことで、通常の Git diff より実装全体の理解が速いか。

## 仮説2

コード横の Explanation によって、

```text
このコードは何のために存在するのか
```

を推測する時間が減るか。

## 仮説3

Diff を中心にしながら必要時だけ Full Source を確認することで、

```text
diff の文脈不足
```

と

```text
source 全体を読むコスト
```

の両方を抑えられるか。

## 仮説4

Implementation Overview → Flow → Source という粒度移動が自然か。

MVP の設計判断は、これらの仮説検証を最優先すること。