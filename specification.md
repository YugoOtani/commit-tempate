# AI Change Review HTML Generator 仕様書

## 1. 概要

本プログラムは、Gitによる変更差分とAIによるレビュー結果を入力として受け取り、人間のレビュアーが変更内容、リスク、確認箇所、根拠を短時間で把握できる単一HTMLレポートを生成するCLIツールである。

生成するHTMLはネットワーク接続を必要とせず、ローカル環境およびCIの成果物として閲覧できるものとする。

### 1.1 目的

- 変更全体の概要と推奨アクションを最初に提示する。
- AIレビューの各説明を実際のdiff上のファイルおよび行へ対応付ける。
- 人間による確認が必要な箇所をリスクとともに明示する。
- 仕様、テスト計画、実装、テストなどの参照関係を可視化する。
- AIの評価と、入力された事実であるGit差分を明確に区別する。
- CIから配布しやすい、自己完結したレビュー資料を生成する。

### 1.2 基本方針

- AIレビューは承認の代替ではなく、人間によるレビューを補助する情報として扱う。
- Git diffおよびレビューJSONは、いずれも信頼できない入力として扱う。
- 同じ入力と同じオプションからは、同じHTMLを生成する。
- diffに含まれない情報を推測して表示しない。
- 解決できない参照や非対応の入力は、黙って無視せず警告またはエラーにする。

## 2. 用語

| 用語 | 意味 |
| --- | --- |
| レビューJSON | `schema.json`に準拠したAIレビュー結果 |
| Change Unit | 人間が一つの意味単位として確認できる変更のまとまり |
| Implementation Section | Change Unitに含まれる具体的な実装位置と説明 |
| Reference | 仕様、テスト計画、実装、テストなど、レビュー判断の根拠 |
| old side | 変更前のファイルと行番号 |
| new side | 変更後のファイルと行番号 |
| 解決済み参照 | diff内の具体的なファイルおよび行へ対応付けられた参照 |
| 未解決参照 | diff外、パス不一致、行不一致などにより対応付けられなかった参照 |
| 説明済み変更 | Implementation Sectionによって説明対象として対応付けられた実際の変更行またはファイル単位の変更 |
| 未説明変更 | diffに存在する実際の変更のうち、いずれのImplementation Sectionにも説明対象として対応付けられなかったもの |

## 3. 対象範囲

### 3.1 MVPに含める機能

- Gitの通常の二者間unified diffの読み込み
- JSON SchemaによるレビューJSONの検証
- レビューJSONに対する意味検証
- diffのファイル、hunk、行番号の解析
- Change UnitおよびReferenceとdiff行の対応付け
- diff上の実際の変更とImplementation Sectionの照合、および未説明変更の検出
- 全体サマリー、Change Unit、ファイル別diffを含むHTML生成
- 追加、変更、削除、rename、copy、mode変更、バイナリ変更、submodule変更の表示
- 未解決参照および解析警告の表示
- 単一HTMLファイルへのCSS埋め込み
- 標準入力およびファイル入力
- CIで利用可能な終了コードと診断メッセージ

### 3.2 MVPに含めない機能

- Git patchの適用
- Gitリポジトリへの書き込み
- commit、push、レビュー承認などの外部操作
- リポジトリからのファイル内容の自動取得
- diffに含まれないコードの補完表示
- merge commitのcombined diff解析
- ブラウザー上でのレビューコメント保存
- 複数ユーザーによる共同編集
- AIレビューの生成
- AIレビュー内容の正しさの自動保証
- 入力文字列中のHTMLの描画

## 4. 入出力

### 4.1 入力

プログラムは次の2入力を必須とする。

1. Git diff
2. レビューJSON

JSON Schemaは、既定ではプログラムに同梱されたバージョンを使用する。開発および検証用途として、任意のschemaファイルを指定可能とする。

### 4.2 Git diff

#### 4.2.1 対応形式

- UTF-8で表現されたGit patch形式または一般的なunified diff
- 通常の二者間diff
- `diff --git`ヘッダー
- `---`および`+++`ファイルヘッダー
- `@@`形式のhunkヘッダー
- Gitのextended header
- new file、deleted file、rename、copy、mode変更
- `Binary files ... differ`形式のバイナリ変更
- submoduleのcommit参照変更
- `No newline at end of file`マーカー

#### 4.2.2 非対応形式

- `diff --cc`および`diff --combined`によるcombined diff
- 3つ以上の親を持つ行番号表現
- Git以外の独自拡張で、通常のunified diffとして解釈できない形式

非対応形式を検出した場合、部分的なレポートを正常結果として出力してはならない。対象と理由を示して解析エラーとする。

#### 4.2.3 推奨生成方法

```bash
git diff \
  --no-ext-diff \
  --no-textconv \
  --find-renames \
  --unified=10 \
  BASE...HEAD > changes.diff
```

プログラムはdiffを入力として扱い、Gitコマンドを暗黙には実行しない。

### 4.3 レビューJSON

レビューJSONは`schema.json`に準拠するものとする。主要な構造は次のとおりである。

- `version`: レビュー形式のバージョン
- `summary`: 変更全体に対するレビュー
- `change_units`: 意味単位に分割された変更と評価
- `implementation.sections`: 実装位置
- `review`: リスク、評価、人間による確認の要否
- `references`: 仕様やテストなどの根拠

レビューJSON中の文字列はプレーンテキストとする。MVPではMarkdownおよびHTMLとして解釈しない。

### 4.4 任意メタデータ

次の値をCLIオプションから任意で指定できるものとする。

- リポジトリ名またはURL
- base revision
- head revision
- レポートタイトル
- ソースコードへのURLテンプレート
- 生成日時

再現可能な出力を維持するため、生成日時は明示的に指定された場合にのみHTMLへ含める。

### 4.5 出力

- 既定の出力先は標準出力とする。
- `--output`指定時は、指定した1つのHTMLファイルへ出力する。
- HTMLはUTF-8とする。
- HTMLは表示に必要なCSSをすべて内包する。
- MVPのHTMLは外部JavaScript、外部CSS、Webフォント、画像CDNを参照しない。
- 入力diff、レビューJSON、schemaのSHA-256を監査情報として記録する。
- 警告が存在する場合も、生成に成功したときはHTML内に警告を記録する。

## 5. CLI仕様

### 5.1 基本形式

```bash
review-summary render \
  --diff <path|-> \
  --review <path> \
  [--schema <path>] \
  [--output <path>] \
  [options]
```

### 5.2 必須オプション

| オプション | 説明 |
| --- | --- |
| `--diff <path\|->` | diffファイル。`-`は標準入力 |
| `--review <path>` | レビューJSON |

### 5.3 任意オプション

| オプション | 説明 |
| --- | --- |
| `--schema <path>` | 検証に使用するJSON Schema |
| `--output <path>` | HTML出力先。省略時は標準出力 |
| `--repository <value>` | リポジトリ名またはURL |
| `--base-revision <value>` | 変更前revision |
| `--head-revision <value>` | 変更後revision |
| `--title <value>` | レポートタイトルの上書き |
| `--source-url-template <value>` | ファイルおよび行への外部リンクテンプレート |
| `--generated-at <ISO-8601>` | HTMLに記載する生成日時 |
| `--strict-links` | 未解決参照が1件以上あれば失敗する |
| `--max-diff-bytes <number>` | diffの最大入力サイズ |
| `--max-review-bytes <number>` | レビューJSONの最大入力サイズ |
| `--help` | 使用方法を表示する |
| `--version` | プログラムのバージョンを表示する |

### 5.4 使用例

```bash
review-summary render \
  --diff changes.diff \
  --review review.json \
  --schema schema.json \
  --output report.html
```

```bash
git diff --no-ext-diff --no-textconv --find-renames BASE...HEAD |
  review-summary render \
    --diff - \
    --review review.json \
    --output report.html
```

### 5.5 終了コード

| 終了コード | 意味 |
| --- | --- |
| `0` | HTML生成成功。警告を含む場合がある |
| `2` | CLI引数エラー |
| `3` | 入力ファイルの読み込みまたはJSON構文エラー |
| `4` | JSON Schema検証エラー |
| `5` | レビューJSONの意味検証エラー |
| `6` | diff解析エラーまたは非対応diff |
| `7` | `--strict-links`指定時の未解決参照 |
| `8` | HTML出力エラー |
| `1` | 上記に分類できない内部エラー |

診断メッセージは標準エラー出力へ出力する。正常なHTMLを標準出力へ出す場合、診断メッセージを標準出力へ混在させてはならない。

## 6. レビューJSONの検証

### 6.1 JSON Schema検証

`schema.json`はJSON Schema Draft 2020-12として検証する。

最低限、schemaには次の制約を含める。

- `version`は対応する固定値であること
- 必須プロパティが存在すること
- 定義外プロパティを許可しないこと
- `risk`は`low`、`medium`、`high`のいずれかであること
- 行番号は1以上の整数であること
- 主要な文字列は空文字列でないこと
- `human_review_required`が`true`の場合、`human_review_focus`が存在すること

### 6.2 意味検証

JSON Schema検証後、アプリケーションは次を検証する。

- Change Unitの`id`がレビューJSON内で一意である。
- `end_line`がある場合、`start_line`も存在する。
- `end_line >= start_line`である。
- パスはリポジトリ相対パスである。
- パスが空でない。
- パスにNULを含まない。
- パスが絶対パスでない。
- パスの正規化後に`..`でリポジトリ外へ移動しない。
- `human_review_required`が`true`の場合、確認観点が空でない。
- `version`がプログラムの対応対象である。

diff中に対象パスや行が存在するかどうかは入力自体の不正とは限らないため、通常は意味検証エラーではなく未解決参照として扱う。

## 7. diff内部モデル

解析したdiffは、利用ライブラリ固有の型を直接後段へ渡さず、次の概念を持つ内部モデルへ変換する。

### 7.1 Diff File

- 変更種別
- old path
- new path
- old mode
- new mode
- renameまたはcopyの類似度
- 追加行数
- 削除行数
- binaryフラグ
- submoduleフラグ
- hunk一覧
- parser警告一覧

### 7.2 Diff Hunk

- old側の開始行と行数
- new側の開始行と行数
- hunk header中のsection情報
- diff line一覧

### 7.3 Diff Line

- 種別: `context`、`addition`、`deletion`、`marker`
- 表示する本文
- old側行番号。存在しない場合はnull
- new側行番号。存在しない場合はnull
- HTMLアンカーID
- 対応するChange UnitおよびReferenceの一覧
- 説明対象として対応付けられたImplementation Sectionの一覧
- 未説明変更であるかを示すフラグ

## 8. パスと行の対応付け

### 8.1 正規化

レビューJSONのパスとdiffのパスには次の正規化を行う。

- Gitの既定prefixである`a/`および`b/`をdiff解析時に分離する。
- パス区切りは内部的に`/`へ統一する。
- `.`セグメントを除去する。
- Unicodeや空白を保持する。
- 大文字小文字を区別する。
- URL decodeを行わない。
- symlinkの解決やファイルシステムへの問い合わせを行わない。

### 8.2 対応キー

行参照は次の組で識別する。

```text
(normalized path, line number)
```

diff側ではold側とnew側の行番号を保持するが、レビューJSONではsideを指定しない。JSONのpathと行番号を、対応するold pathとold側行番号、およびnew pathとnew側行番号の両方に対して検索する。同じ位置指定が両側に一致する場合は、該当するすべてのdiff行へ対応付ける。

### 8.3 パスの選択

- JSONのpathがnew pathと一致する場合、new側の行番号を検索する。
- JSONのpathがold pathと一致する場合、old側の行番号を検索する。
- old pathとnew pathが同じ場合は、old側とnew側の両方を検索する。
- renameまたはcopyでは、JSONにold pathを指定すればold側、new pathを指定すればnew側を検索する。
- 追加ファイルにはold側の行、削除ファイルにはnew側の行が存在しないため、存在する側だけを検索する。

### 8.4 行範囲

- `start_line`のみの場合は単一行を対象とする。
- `start_line`と`end_line`がある場合は閉区間として扱う。
- 範囲内のうちdiffに存在するすべての行へ関連情報を付与する。
- 範囲の一部だけがdiffに存在する場合は「一部解決」とする。
- 対象範囲がhunk外の場合は「diff範囲外」とする。

### 8.5 解決状態

各Implementation SectionおよびReferenceには次のいずれかを付与する。

| 状態 | 意味 |
| --- | --- |
| `resolved` | 指定範囲のすべてをdiff行へ対応付けた |
| `partially_resolved` | 指定範囲の一部だけを対応付けた |
| `file_only` | ファイルは存在するが行が指定されていない、または行がdiff外 |
| `not_in_diff` | 指定パスがdiffに含まれない |

HTMLでは未解決状態を隠さず、理由を表示する。

### 8.6 変更説明の網羅性検査

diff上の実際の変更と、レビューJSONの`change_units[].implementation.sections`を照合し、説明が対応付けられていない変更を検出する。この検査はReferenceの解決状態の検査とは独立して行う。

#### 8.6.1 検査対象

実際の変更として、次を検査対象とする。

- テキストdiffの`addition`行
- テキストdiffの`deletion`行
- 行を持たないrename、copy、mode変更、バイナリ変更
- 行を持たない形式で表現されたsubmodule変更

`context`行および`No newline at end of file`マーカーは、それ自体を変更として扱わない。追加行はnew side、削除行はold sideの変更として別々に検査する。

#### 8.6.2 テキスト変更の説明判定

テキストdiffの変更行は、次のすべてを満たすImplementation Sectionが1件以上存在する場合に説明済みとする。

- 正規化後の`path`が、対象行のsideに対応するdiff pathと一致する。
- `start_line`および`end_line`で示す範囲が対象行を含む。`end_line`省略時は`start_line`の1行だけを対象とする。
- Implementation Sectionが対象行へ解決されている。

Implementation Sectionの範囲にcontext行が含まれてもよいが、網羅性の計算ではその範囲内の`addition`行または`deletion`行だけを説明済みとして数える。行番号を持たないImplementation Sectionはテキスト変更行を説明済みにはしない。

追加行と削除行は別々の変更行として判定する。ただし、old pathとnew pathが同じで、同じImplementation Sectionの行範囲が両側の変更行に一致する場合、そのImplementation Sectionで追加行と削除行の両方を説明済みにできる。

Reference、Change Unitのタイトル、`implementation.summary`、`implementation.description`、`review`内の文章は、具体的な変更位置を特定できないため、変更行を説明済みとする根拠には使用しない。

#### 8.6.3 行を持たない変更の説明判定

行を持たない変更は、正規化後の`path`が対象ファイルのold pathまたはnew pathと一致し、かつ行番号を持たないImplementation Sectionが1件以上存在する場合に説明済みとする。renameまたはcopyではold pathとnew pathのどちらを指定してもよい。

同じファイルに複数種類の行を持たない変更がある場合、一致する1件のImplementation Sectionでそれらをまとめて説明済みとしてよい。テキスト変更も併存する場合、そのImplementation Sectionは行を持たない変更だけを説明し、テキスト変更行は別途行範囲を持つImplementation Sectionで説明しなければならない。

#### 8.6.4 未説明箇所の集約

説明されていないテキスト変更行は、同じファイル、side、hunk内で行番号が連続する範囲ごとに1件の警告へ集約する。行を持たない未説明変更は、同じファイルに属する変更種別をまとめて1件の警告としてよい。

各警告は、少なくとも次の位置情報を持つ。

- 正規化後のpath
- `old`または`new`のside
- テキスト変更では開始行と終了行
- 行を持たない変更では変更種別
- HTML内の該当diff箇所を示すアンカー。該当行を表示できない変更ではファイルのアンカー

警告の順序はdiffのファイル順、hunk順、行順とし、同じ入力から決定的に生成する。

## 9. HTMLレポート仕様

### 9.1 全体構成

HTMLは次の順序で構成する。

1. レポートヘッダー
2. 全体レビュー
3. レビュー優先順位
4. Change Unit一覧
5. ファイル別diff
6. 未解決参照および警告
7. 入力と生成ツールの監査情報

### 9.2 レポートヘッダー

次を表示する。

- レポートタイトル
- リポジトリ情報
- base revisionとhead revision
- AIレビュー形式のversion
- プログラムのversion
- 明示された場合のみ生成日時

### 9.3 全体レビュー

`summary`から次を表示する。

- `title`
- `review`
- `recommended_action`

推奨アクションは本文から視覚的に区別するが、危険色だけに依存してはならない。

### 9.4 集計情報

次を表示する。

- 変更ファイル数
- 追加行数
- 削除行数
- Change Unit数
- リスク別Change Unit数
- `human_review_required`の件数
- 未解決参照数
- 未説明変更箇所数
- バイナリ変更数

### 9.5 レビュー優先順位

人間が先に見るべき項目を次の順に並べる。

1. `human_review_required: true`かつ`risk: high`
2. `human_review_required: true`かつ`risk: medium`
3. `human_review_required: true`かつ`risk: low`
4. 人間確認不要の`high`
5. 人間確認不要の`medium`
6. 人間確認不要の`low`

元のChange Unit順序自体は保持し、優先順位欄はナビゲーションとして別に表示する。

### 9.6 Change Unit

各Change Unitに次を表示する。

- ID
- タイトル
- リスクラベル
- 実装概要
- 実装説明
- AIのassessment
- 人間確認の要否
- 人間が確認すべき観点
- Implementation Section一覧
- Reference一覧
- 対応するdiff行へのアンカー
- 解決状態

実装概要と「レビューで判断すること」は横並びにせず、実装概要を先にして縦に配置する。

コードをChange Unitの主情報として扱い、各Implementation Sectionは次の順に表示する。

1. タイトルおよび実装位置
2. 対応するdiff
3. Implementation Sectionの実装説明

diffと実装説明は横並びにせず縦に配置する。diffを先に横幅いっぱいで表示し、説明が長くなってもコードの表示幅を狭めない。AIのassessmentおよび人間が確認すべき観点は、Change Unit全体の情報としてImplementation Sectionとは分けて表示する。

### 9.7 ファイル別diff

MVPではunified表示を採用する。

各ファイルに次を表示する。

- old pathとnew path
- 変更種別
- 追加行数と削除行数
- mode変更
- renameまたはcopy情報
- binaryまたはsubmodule情報
- hunkとdiff行
- old側とnew側の行番号
- 関連するChange Unitのマーカー

ファイルおよびhunkは`details`要素で折り畳み可能とする。高リスクまたは人間確認対象に関連するファイルは初期状態で展開してよい。

### 9.8 行の表示

- context、addition、deletionを文字、背景、ラベルの組み合わせで区別する。
- 色だけを情報伝達手段にしない。
- 長い行はページ全体を広げず、コード領域内で横スクロール可能にする。
- タブを破壊せず表示する。
- 空白文字の可視化はMVPでは任意とする。
- コード本文へsyntax highlightingを適用することはMVPでは必須としない。
- Change Unitが対応する行には、クリックまたはキーボード操作可能なマーカーを表示する。

### 9.9 Reference表示

Referenceはtype別のラベルを表示する。

- `spec`: 仕様
- `test_plan`: テスト計画
- `implementation`: 実装
- `test`: テスト
- `other`: その他

参照先がdiff内にある場合は内部アンカーを生成する。diff外であっても、URLテンプレートから安全なURLを生成できる場合は外部リンクを追加できる。外部リンクには、外部へ移動することが分かる表示を付ける。

### 9.10 警告表示

次を警告として表示する。

- diffに存在しないファイル参照
- hunk外の行参照
- 一部だけ解決された範囲
- binaryファイルに対する行参照
- Implementation Sectionによる説明がない変更行
- Implementation Sectionによる説明がない、行を持たないファイル変更
- parserが保持した未知のextended header
- 入力サイズが警告閾値を超えた場合

未説明変更の警告には、警告コードとともにpath、side、行範囲または変更種別を表示する。テキスト変更では対象範囲のdiffを警告欄内に表示し、同じ内容をファイル別diffにも表示する。警告欄からファイル別diffの該当行または該当ファイルへ移動できるリンクを付け、ファイル別diff側にも未説明であることが分かるマーカーを表示する。

標準エラーへ出力する未説明変更の警告にも、`path:開始行-終了行 (side)`または`path (side, 変更種別)`の形式で該当箇所を含める。コード本文は標準エラーへ出力しなくてよい。

### 9.11 監査情報

レポート末尾に次を表示する。

- generator nameとversion
- schema version
- diffのSHA-256
- レビューJSONのSHA-256
- schemaのSHA-256
- 使用された主要オプション
- 警告件数

ファイルシステム上の絶対パスは監査情報へ含めない。

### 9.12 印刷とアクセシビリティ

- 見出し構造を維持する。
- キーボードだけでリンクと折り畳みを操作できる。
- リスクや変更種別を色だけで表現しない。
- 十分なコントラストを確保する。
- 印刷時にはナビゲーションを簡略化する。
- 印刷時にdiff行が意図せず非表示にならないようにする。
- `lang`属性を設定可能とし、既定値は`ja`とする。

## 10. セキュリティ要件

### 10.1 HTML生成

- 入力由来の文字列をHTMLとして連結してはならない。
- テキスト、属性、URLのコンテキストごとに適切なエスケープを行う。
- レビューJSONおよびdiff内の`<script>`、イベント属性、HTMLタグを文字列として表示する。
- 入力値を未検証のまま`innerHTML`へ渡さない。
- HTMLレンダラー内部で、安全なHTMLと未検証文字列を型またはAPIで区別する。

### 10.2 Content Security Policy

最低限、次と同等以上に制限的なCSPをmeta要素で指定する。

```text
default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'
```

MVPではJavaScriptを使用しない。将来追加する場合は、固定されたscript hashまたはnonceを使用し、`unsafe-inline`なscriptを許可しない。

### 10.3 URL

- 自動生成する外部URLは`https:`のみ許可する。
- `javascript:`、`data:`、`file:`などを外部リンクとして許可しない。
- URLテンプレートへ埋め込むpath、revision、lineは適切にpercent encodeする。
- リンクテキストには元の人間可読なパスを使用する。

### 10.4 リソース制限

- diffとレビューJSONに最大バイト数を設定する。
- 最大ファイル数、最大hunk数、最大行数、最大1行長を内部制限として持つ。
- 制限超過時に無制限のメモリ確保や処理継続をしない。
- 入力の切り捨てを正常な完全レポートとして扱わない。
- 正規表現は入力長に対して極端なバックトラッキングを起こさないものを使用する。

## 11. エラーと警告

### 11.1 エラー

次の場合、HTML生成を失敗させる。

- 必須入力を読み込めない。
- レビューJSONがJSONとして不正である。
- レビューJSONがschemaに準拠しない。
- レビューJSONが意味検証に失敗する。
- 対応していないschema versionである。
- diff全体を信頼できる形で解析できない。
- combined diffを検出する。
- 入力がハードリミットを超える。
- 出力先へ完全なHTMLを書き込めない。
- `--strict-links`指定時に未解決参照が存在する。

### 11.2 警告

次の場合、通常はHTML生成を続行する。

- Referenceのパスがdiffに含まれない。
- 指定行がdiffのhunk外である。
- 範囲の一部だけを解決できた。
- binaryファイルのため行表示できない。
- 任意メタデータが不足している。
- 解釈に影響しない未知のdiffメタデータがある。
- diff上の変更行が、いずれのImplementation Sectionによっても説明されていない。
- 行を持たないファイル変更が、いずれのImplementation Sectionによっても説明されていない。

警告には機械的に識別可能なコードを付ける。

```text
W_REFERENCE_NOT_IN_DIFF
W_LINE_OUTSIDE_HUNKS
W_LOCATION_PARTIALLY_RESOLVED
W_BINARY_LOCATION_UNRESOLVED
W_UNKNOWN_DIFF_HEADER
W_UNEXPLAINED_DIFF_LINES
W_UNEXPLAINED_FILE_CHANGE
```

未説明変更はレビューの不足を人間へ通知する警告であり、それだけを理由にHTML生成を失敗させない。`--strict-links`は参照の解決可否だけを対象とし、未説明変更には適用しない。

## 12. 非機能要件

### 12.1 再現性

- 暗黙の現在日時を出力しない。
- localeによって並び順や数値表現が変わらないようにする。
- Change Unitとdiffファイルの基本順序は入力順を保持する。
- ハッシュ、アンカーID、警告コードを決定的に生成する。

### 12.2 性能

目標値を次のとおりとする。

- 10 MiB以下のdiffを一般的なCI環境で10秒以内に処理する。
- 50,000 diff行程度を実用的な時間とメモリで処理する。
- 全入力を複数回複製する設計を避ける。
- HTMLサイズが大きい場合も、表示前に外部通信を必要としない。

性能目標は受け入れテスト環境を定義したうえで測定する。

### 12.3 対応環境

- 実行環境はサポート中のNode.js LTSとする。
- 初期の基準環境はNode.js 24 LTSとする。
- 生成HTMLは最新の主要ブラウザーで閲覧できるものとする。
- Linux上のCI実行を必須とし、macOSとWindowsは可能な限り対応する。

### 12.4 保守性

- diff parser固有のデータ構造を内部モデルから隔離する。
- schema検証、意味検証、diff解析、対応付け、HTML生成を分離する。
- HTML生成は副作用のない関数を中心に構成する。
- エラーと警告は構造化された診断モデルで扱う。

## 13. 実装技術

### 13.1 推奨構成

| 領域 | 技術 |
| --- | --- |
| 言語 | TypeScript |
| 実行環境 | Node.js 24 LTS |
| JSON Schema検証 | AjvのDraft 2020-12対応API |
| diff解析 | `parse-diff`をアダプター経由で利用 |
| HTML生成 | 独自の静的レンダラー |
| テスト | VitestまたはNode.js test runner |
| ビルド | TypeScript compilerおよびesbuild |
| 配布 | npm executable package |

### 13.2 推奨ディレクトリ構成

```text
src/
  cli.ts
  model/
    review.ts
    diff.ts
    report.ts
  review/
    load.ts
    validate.ts
    semantic-validation.ts
  diff/
    parse.ts
    normalize-path.ts
    line-index.ts
  correlate/
    resolve-locations.ts
    detect-unexplained-changes.ts
  render/
    render-html.ts
    escape.ts
    styles.ts
  diagnostics.ts

tests/
  fixtures/
  schema.test.ts
  diff.test.ts
  correlate.test.ts
  render.test.ts
  cli.test.ts
```

## 14. テスト要件

### 14.1 Schema検証テスト

- 現在の`sample.json`が成功する。
- 必須項目欠落が失敗する。
- 未知プロパティが失敗する。
- 不正なriskが失敗する。
- 0以下の行番号が失敗する。
- 対応外versionが失敗する。
- 人間確認が必要なのにfocusがない場合に失敗する。

### 14.2 意味検証テスト

- Change Unit ID重複を検出する。
- `end_line < start_line`を検出する。
- 絶対パスを拒否する。
- リポジトリ外へ出る`..`を拒否する。

### 14.3 diff解析テスト

- 通常のファイル変更
- 新規ファイル
- 削除ファイル
- rename
- copy
- modeのみの変更
- binary
- submodule
- 空白および日本語を含むパス
- quoteされたGit path
- CRLF入力
- ファイル末尾の改行なし
- 複数hunk
- 空diff
- combined diffの拒否

### 14.4 対応付けテスト

- new sideの追加行
- old sideの削除行
- context行
- rename前後のパス
- 単一行と複数行範囲
- 複数Change Unitが同じ行を参照する場合
- 一部だけhunkに含まれる範囲
- diff外のReference
- binaryファイルへの行参照
- new sideの変更行がImplementation Sectionによって説明済みになること
- old sideの変更行がImplementation Sectionによって説明済みになること
- 同じpathと行範囲がold側とnew側の両方に一致する場合、両側の変更行が説明済みになること
- renameまたはcopyでold pathとnew pathを正しい側へ対応付けること
- 行番号を持たないImplementation Sectionがテキスト変更行を説明済みにしないこと
- rename、copy、mode変更、バイナリ変更をファイル単位で照合すること
- 未解決または一部解決のImplementation Sectionでは、実際に解決した変更行だけを説明済みにすること
- Referenceだけが対応付けられた変更行を未説明として検出すること
- 連続する未説明行を同じfile、side、hunk内で集約すること

### 14.5 HTMLおよびセキュリティテスト

- `<script>`が実行可能なHTMLにならない。
- HTML属性を閉じる入力がエスケープされる。
- `javascript:` URLがリンクにならない。
- パスとコードの空白が保持される。
- すべての内部アンカーが一意である。
- すべての内部リンクにリンク先が存在する。
- CSPが含まれる。
- 外部リソース参照が存在しない。
- 未説明変更の警告にpath、side、行範囲または変更種別が表示される。
- 未説明変更の警告からファイル別diffの該当箇所へ移動できる。
- ファイル別diffの該当箇所に未説明マーカーが表示される。
- スナップショットHTMLが期待する構造を持つ。

### 14.6 CLI統合テスト

- ファイル入力からHTMLを生成できる。
- 標準入力からdiffを受け取れる。
- HTMLを標準出力へ出せる。
- 診断メッセージが標準エラーへ出る。
- 未説明変更がある場合もHTMLを生成し、終了コード`0`を返す。
- 未説明変更の警告コードと該当箇所が標準エラーへ出る。
- エラー種別ごとに所定の終了コードを返す。
- 出力失敗時に正常終了しない。

## 15. MVP受け入れ基準

以下をすべて満たした時点でMVP完成とする。

1. `sample.json`相当のレビューJSONと通常のGit diffから単一HTMLを生成できる。
2. 追加、変更、削除、rename、binaryの各変更を識別して表示できる。
3. Change Unitから対応するdiff行へ移動できる。
4. diff行から関連するChange Unitを確認できる。
5. 人間確認が必要なChange Unitと確認観点がレポート上部から把握できる。
6. 未解決参照と理由がHTMLおよび標準エラーから確認できる。
7. Implementation Sectionで説明されていない変更を警告し、そのpath、side、行範囲または変更種別をHTMLおよび標準エラーから確認でき、該当diffをHTMLから確認できる。
8. 不正JSON、不正schema、非対応diffを正常結果として扱わない。
9. 入力に含まれるHTMLやscriptを実行しない。
10. HTMLをネットワーク接続なしで閲覧および印刷できる。
11. 主要なparser、対応付け、セキュリティ、CLIテストが自動化されている。

## 16. 将来拡張

MVP完成後、必要性を確認して次を検討する。

- side-by-side diff表示
- クライアント側のリスク・ファイル絞り込み
- syntax highlighting
- 大規模diff向けの遅延表示
- GitHub、GitLab等へのソースリンクプリセット
- SARIFなど機械処理向け形式の併記
- 複数レビューJSONの統合
- レビュー結果間の差分表示
- 人間の確認結果を別ファイルとして保存する機能
- 単一ネイティブバイナリまたはコンテナでの配布
- combined diffへの対応

これらの拡張でも、単一HTMLの可搬性、入力の非信頼性、AI判断と事実の区別を維持する。
