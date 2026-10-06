# STATE: demo-complete

## Current status
running — 2026-10-06

## Facts (durable, cross-iteration)
- ブランチ `feat/demo-complete` は `feat/demo-mode`@`290ae32`（PR #12、未マージ）から派生。PR は #12 を base にするか、#12 マージ後に main に向け直す
- デモは `VITE_DEMO_MODE=true` で `src/demo-cloud/DemoCloudRoot.tsx` が `App.tsx` を `initialProject` 付きで包む構造
- `App.tsx` の New project / Import / Ask AI / Redo は `disabled={readOnly || Boolean(initialProject)}` で、デモでは常に無効（App.tsx:884-930,977）
- Excel 取り込みは `src/excel.ts` の `inspectWorkbook` → `previewToModel`（正方行列、"FCM Values" シート優先、最大200因子）
- デモストアはインメモリで、seed 3件。リロードで消える
- 本番URL `https://fcm-studio-demo.vercel.app`（Vercel team robo-lab-fdf42eb4、project fcm-studio-demo）。env の AI_* は設定済み。Vercel MCP は壊れているので CLI を使う
- `/api/demo-draft`（`server/demo-draft.mjs`、制限パスではない）は agenda が空だと400を返す。agenda なしで作った新規プロジェクトでは AI が常にモックにフォールバックする → #15 で直す
- Lander のフィードバックフォーム: https://forms.cloud.microsoft/r/cZMHVzZSf7
- omi の 2026-10-06 17:15 の会議記録は MCP 接続不可で未取得

## Open work (the backlog — one item picked per iteration)
- [ ] 1. デモのダッシュボードから新規プロジェクトを作成する（名前・アジェンダ）— P0
- [ ] 2. デモのダッシュボードから Excel(.xlsx) を取り込み、新規デモプロジェクトとして作成する（プレビュー・エラー表示付き）— P0
- [ ] 3. デモのエディタ内で、owner/editor に Import（現在のプロジェクトへ置き換え取り込み）と Ask AI を有効化する。viewer は無効のまま — P1
- [ ] 4. デモ状態をリロード後も保持する（localStorage、reset ボタン付き）— P1
- [ ] 5. Lander の会議フィードバックを反映する（omi 復旧後に追加）— 未取得
- [ ] 6. README に OSS / 協同組合化ロードマップを追記（Lander 側の Vercel+Supabase+Euria への移行）— P2

## Metrics
- iterations run: 0
- gate pass rate: 0/0

## Flags / blockers
- HITL: Supabase 本番接続（Pro org の新規プロジェクトは月約$10、無料 org は未作成）、Google OAuth クライアント
- omi MCP タイムアウト

## Drift note
なし
