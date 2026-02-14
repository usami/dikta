# Dikta — プロンプト使用ガイド

## ファイル構成

```
dikta/
  DESIGN.md              ← エージェントが最初に読む設計思想
  prompts/
    README.md            ← このファイル
    phase1.md            ← Intent Schema 定義エンジン
    phase2.md            ← Query Contract システム
    phase3.md            ← コード生成エンジン
    phase4.md            ← Migration Planner
    phase5.md            ← エージェント連携プロトコル
```

## 使い方

### 前提

Claude Code、Cursor、Cline、Windsurf など、ファイルを読めるコーディングエージェントを使用することを想定しています。

### Step 1: プロジェクトを初期化

まず以下のファイルだけを用意した状態でリポジトリを作成します:

```bash
mkdir dikta && cd dikta
git init
# DESIGN.md と prompts/ をコピー
```

### Step 2: Phase 1 を実行

エージェントに以下のように指示します:

```
DESIGN.md を読んでから prompts/phase1.md の指示に従って実装してください。
```

Phase 1 の完了基準（phase1.md に記載）が全て満たされたことを確認してから次に進みます。

### Step 3: Phase 2 以降を順番に実行

```
prompts/phase2.md の指示に従って Phase 2 を実装してください。
Phase 1 で作ったコードを壊さないように注意してください。
```

各フェーズの完了基準を確認してから次に進みます。

## 重要なポイント

### DESIGN.md を必ず最初に読ませる

各フェーズのプロンプトは「DESIGN.md を先に読むこと」を指示していますが、
エージェントによっては指示を読み飛ばす場合があります。
最初のやりとりで「まず DESIGN.md を読んで内容を要約してください」と
確認を取ることをおすすめします。

### 一度に1フェーズだけ渡す

全フェーズを一度に渡すとエージェントの注意が分散します。
Phase 1 が完了してから Phase 2 を渡してください。

### 完了基準で区切る

各フェーズの「完了基準」セクションを使って、
エージェントの出力が要件を満たしているか確認してください。
満たしていなければ、具体的に何が足りないかを指摘して修正を依頼します。

### 型推論のテストを重視する

Dikta の価値の大部分は TypeScript の型推論にあります。
Phase 1 と Phase 2 の `type-inference.test.ts` が通ることを
特に注意深く確認してください。
