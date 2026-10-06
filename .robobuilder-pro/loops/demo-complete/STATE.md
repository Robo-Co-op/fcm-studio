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
- [x] 1. 新規プロジェクト作成 #13（3e2ae6b）
- [x] 2. Excel/JSON 取り込み #14（2ac0c51）
- [x] 3. エディタ内 Import / AI #15（4043d72）
- [x] 4. 状態の保持 #16（93c4e55）
- [ ] 5. Lander の会議フィードバックを反映する（omi 復旧後に追加）— 未取得。ブロッカー
- [x] 6. README ロードマップ #17（0136a2b）
- [ ] 7. excel.ts の堅牢化 #18（zip bomb・シート数・空ラベル）— P2、次ループ候補

## Metrics
- iterations run: 5 items (#13 #14 #15 #16 #17)
- gate pass rate: 5/5（反証で赤を確認したものを含む）

## Flags / blockers
- HITL: Supabase 本番接続（Pro org の新規プロジェクトは月約$10、無料 org は未作成）、Google OAuth クライアント
- omi MCP タイムアウト

## Drift note
なし
