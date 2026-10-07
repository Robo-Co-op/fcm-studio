# LOOP: demo-complete

## Goal
Lander が `https://fcm-studio-demo.vercel.app` で、プロジェクト作成・Excel取り込み・編集・AI提案・保存をエラーなしで一通り操作できる状態にする。

## Trigger
手動。interactive dev-loop（Jin のセッション内）。

## Native primitive
interactive dev-loop（セッション内で plan → build → improve → ship を1件ずつ回す）。headless 起動はしない。

## Termination condition
STATE.md のバックログ（AFK 分）がすべて完了し、gate が green、本番エイリアスで golden path を手動確認済み。または20イテレーションで停止。

## Gate (maker ≠ checker)
- **Type:** deterministic-script
- **Command:** `.robobuilder-pro/loops/demo-complete/gate.sh`（`npm test` + `npm run build` + 制限パス差分チェック。type check は build に含まれる）
- **Checker:** スクリプトの exit code（作業エージェントの自己申告ではない）と、変更ごとの `robobuilder-lite:improve` のサブエージェントレビュー
- **Baseline:** 初回実行で `src/cloud/ai-requests-db.test.ts` が並列負荷により5秒でタイムアウト（単体では1.78秒）。`vite.config.ts` の testTimeout を20秒にして解消し、175件 PASS
- **Falsification (2026-10-06, 3/3 BLOCK):**
  - F1 コード欠陥（`listProjects` の未ログインガードを削除）→ BLOCK（1 failed）
  - F2 制限パス（`server/cloud-draft.mjs` に1行追記）→ BLOCK（restricted paths changed）
  - F3 テスト削除（`src/excel.test.ts` を退避）→ BLOCK（165 < 175）。既存の `npm run gate` だけなら PASS していたケースで、件数チェックの追加が効いた
- **Ratchet:** テストが増えたら `GATE_MIN_TESTS` の既定値を引き上げる
- **初回で通ったテストのルール（loop-retro 2026-10-06）:** 新規テストが初回から green なら、対象の実装に欠陥を入れて赤になるのを見てから採用する。欠陥の内容と結果は run-log に書く。状態を丸ごと保存する系のテストは、変更ごとに再読込しないと前の保存に隠れる（#16 で実例あり）。未計測（champion-challenger は未実施）。既に運用していた手順を明文化しただけ
- **E2E の実行者:** このセッションの作業ディレクトリは git リポジトリではないため、`e2e-tester` エージェント（worktree 分離が必須）は起動できない。E2E は general-purpose エージェントか、メインセッションで `npm run test:e2e:demo` を使う

## Autonomy level
L1 report-only（PR は作るが、マージと本番デプロイは Jin に確認する）

## Budget & circuit breakers
- **Max iterations:** 20、1件あたり最大3回の build→improve 往復
- **Cost ceiling:** OpenRouter 実呼び出しは手動確認時のみ（各$0.01未満）。Vercel ビルドは Pro プラン内
- **Recoverable errors:** テスト失敗は build に戻す
- **Fatal → escalate:** 同じ修正が2回失敗した場合、制限パスの変更が必要になった場合、費用が発生する場合

## Restricted paths (never auto-modify)
- `src/cloud/`、`supabase/`、`server/index.mjs`、`server/cloud-draft.mjs`、`api/draft.mjs`（本番クラウドの経路）
- `.env*`、Vercel のプロジェクト設定・環境変数、Supabase のプロジェクトや org の作成（費用）、Google OAuth クライアント
- auth / payments / secrets / infra / migrations

## MCP / connector scopes
- gh CLI: PR の作成と閲覧。マージは Jin の確認後
- Vercel CLI（`npx vercel`）: inspect と ls は自由。プレビューデプロイは可、本番昇格は確認後
- Outlook: Lander 宛てメール1通は Jin の事前承認あり（2026-10-06）

## Escalation
最大試行に到達、仕様が曖昧、制限パスの変更が必要、費用が発生する、のいずれかでセッション内で Jin に報告して止まる。

## Reporting
`run-log.md`（追記のみ）、PR の本文、最終報告はチャットで行う。
