# Rogue Strike Beta開発フェーズ 実装計画 (Implementation Plan)

## 背景と目的
Alpha版にて、ReactでのUI構築とコアロジックのモジュール化、およびメタプログレッション（`localStorage`セーブとスキルツリー）の実装が完了しました。
Beta版では「よりローグライクらしいサイクル」を提供するため、ゲームプレイの広がりを持たせます。具体的には、複数ルートからの選択、アーティファクト、段階的な敵の追加（WAVE制）、演出の強化を行います。

## User Review Required
以下の点について、Beta版着手前にユーザーに確認または合意を取る：
> [!IMPORTANT]
> - Slay the Spireのようなマップ機能において、今回どの程度のノード種類を持たせるか（「通常」「エリート」「ボス」「ショップ」が基本想定）
> - アイテム（アーティファクト）の持たせ方。キャラごとの装備ではなく、チーム全体（ラン）に対するパッシブバフとして実装する想定で良いか。
> - ステージのWAVE制において、ボス登場前のWAVE数（例：3WAVE突破でクリアなど）
> - アルティメットスキルの具体的な種類や強さについて（Beta版で実装する初期の2〜3種類）

## Proposed Changes

### 1. マップシステム (Map progression)
- 各ステージ間（`StageSelect`フェーズ）を**マップ画面**に改修。マップデータは`CoreEngine.ts`の初期化時にランダムまたは固定ツリーとして生成する。
- **[MODIFY]** `c:\Users\green\Documents\workspaces\roguelike_strike\web\src\App.tsx`
  - 既存の「Normal / Elite / Boss」の単純な選択ではなく、木構造（ノードの配列）をレンダリングし、現在位置から繋がっているノードだけクリックできるようにする。

### 2. WAVE制 (Waves)
- **[MODIFY]** `c:\Users\green\Documents\workspaces\roguelike_strike\web\src\CoreEngine.ts`
  - ステージごとに「初期スポーン数」と「追加WAVE数」を定義。
  - `proceedTurn`の際、一定ターン経過時、あるいは敵の数が減ったタイミングで上部から次のWAVEの敵を降らせる。
  - すべてのWAVEを倒し切った場合にステージクリア（`RewardSelect`などへ移行）とする。

### 3. アーティファクトシステム (Artifacts)
- **[MODIFY]** `c:\Users\green\Documents\workspaces\roguelike_strike\web\src\CoreEngine.ts`
  - `currentArtifacts`配列を追加。
  - `onProjectileStop`時やバウンス時など、特定のイベントフックでアーティファクトの効果（例：初撃ダメージ上昇、回復など）を評価する処理を挿入する。
- **[MODIFY]** `c:\Users\green\Documents\workspaces\roguelike_strike\web\src\App.tsx`
  - エリート戦闘クリア後やショップ画面用に、アーティファクトを選択・購入するUIフェーズを追加する。

### 4. アルティメットスキル (Ultimate Skills)
- **[MODIFY]** `c:\Users\green\Documents\workspaces\roguelike_strike\web\src\App.tsx`
  - StartScreenにて、ランに持ち込む「アルティメットスキル」を選択するUIを追加。
- **[MODIFY]** `c:\Users\green\Documents\workspaces\roguelike_strike\web\src\CoreEngine.ts`
  - ターン経過で溜まるゲージ変数（`ultimateCharge`など）を追加。
  - 発動ボタンが押されたとき（クリック/タップ時）の効果処理（範囲ダメージ等）を実装。

### 5. UIとフィールドレイアウトの改修 (UI & Field Layout)
- **[MODIFY]** `c:\Users\green\Documents\workspaces\roguelike_strike\web\src\CoreEngine.ts`
  - `draw()`の中で描画する背景（`bg_stage`）の範囲を上部のみに制限し、最下部80〜100px程度の領域を「コントロール＆ステータスUIエリア」として黒背景などの明確な別領域として描画する。
  - 重なって見えづらかったターン数や敵の数、次弾の表示などを、すべてこの下部エリアに整理して描画する。

### 6. 演出の強化 (Juiciness)
- **[MODIFY]** `c:\Users\green\Documents\workspaces\roguelike_strike\web\src\CoreEngine.ts`
  - ダメージを受けた敵の位置から上へフワッと浮き上がるアニメーションオブジェクト（Floating Text）のクラスまたは配列を追加し、`draw()`にて描画する。
  - 自機が跳ね返る際、小さなパーティクルを散らす。
  - **画面揺れ (Screen Shake)**: 大ダメージを与えた時や、アルティメットのNuke発動時などに、Canvas全体を描画時に一時的にオフセットして揺らす演出を追加。
  - **軌跡 (Trail)**: 弾道が見えやすいように、自キャラの過去の数フレーム分の座標を保存しておき、半透明で残像を描画する。

## Verification Plan
### Automated Tests
- TypeScriptの静的型チェック（`tsc --noEmit`）により、型の不整合がないことを確認。
- ローカルViteサーバー（`npm run build`）によるビルドの成功確認。

### Manual Verification
- **レイアウトUI**: 情報表示エリアと戦闘エリアが分離され、テキストが背景に埋もれず視認できるか。
- **アルティメットスキル**: 選択したスキルが規定ターン経過で発動可能になり、意図した効果を発揮するか。
- **マップ遷移**: マップのノード進行が正しく反映されるか。
- **WAVE制**: 敵が画面に追加される挙動と、全滅させたときのクリア判定がデグレしていないか。
- **アーティファクト効果**: 取得したパッシブアイテムが実際の計算（威力やスコア）に反映されるか。
- **演出追加**: ダメージ数字が正しく見え、FPSが大幅に低下（60FPS未満）しないか。
