# Alpha Development Implementation Plan

## 1. プロジェクト移行 (React化)
現在の `web` フォルダ内の Vanilla TS の構成を、React + TypeScript 環境に置き換える。
- `package.json` および `vite.config.ts` の更新（React, ReactDOM, @vitejs/plugin-reactの追加）。
- 既存の `index.html` および `main.ts` を `index.html`, `main.tsx`, `App.tsx` などのReact標準の構造へリファクタリングする。

## 2. ゲームコアロジックのモジュール化
`main.ts` にベタ書きされているCanvas描画ロジックや物理演算を、独立したクラス (`GameEngine.ts`, `Player.ts`, `Enemy.ts`) に分割し、React側から制御（初期化・破棄・再スタート）しやすいように疎結合へ変更する。

## 3. React UIの実装
現在 `index.html` に隠し要素 (`hidden`) として定義されているHTMLオーバーレイを、正式なReactコンポーネントに書き換える。
- `<StartScreen>`
- `<StageSelectScreen>`
- `<RewardScreen>`
- `<GameOverScreen>`

## 4. メタ・プログレッション (スキルツリー) の実装
- `localStorage` を使用して、プレイヤーの「所持コイン」と「取得済みスキル」をブラウザに永続保存する機能を実装。
- ラン中のゲームロジック内（敵の撃破やステージクリア時）で、コインを獲得する処理を追加。
- スタート画面に「Upgrades」ボタンを追加し、コインを消費して永続強化を行う `<SkillTreeScreen>` コンポーネントを実装。
- ゲームコア初期化時に、取得済み強化パラメータ（攻撃力アップなど）を適用する仕組みを構築。

## User Review Required
> [!IMPORTANT]
> この作業では `web` フォルダ内のコード構造を大きく変更し、React用に書き換えます。
> 前回のVanillaのプロトタイプのコードから大規模な変更が加わるため、あらかじめGit等によるプロトタイプのコミット（変更履歴の保存）が行われていることを前提に進めます。
