# STATE: demo-complete

## Current status
idle（2周目 #20〜#23 完了、Lander の Excel 待ち）— 2026-10-06

## Facts (durable, cross-iteration)
- ブランチ `feat/demo-complete` は `feat/demo-mode`@`290ae32`（PR #12、未マージ）から派生。PR は #12 を base にするか、#12 マージ後に main に向け直す
- デモは `VITE_DEMO_MODE=true` で `src/demo-cloud/DemoCloudRoot.tsx` が `App.tsx` を `initialProject` 付きで包む構造
- `App.tsx` の共有プロジェクトでは、Import は `allowSharedImport`（デモの owner/editor）、Ask AI は `requestAiProposal` の有無で有効になる（#15）。New project / Redo は共有では無効のまま
- Excel 取り込みは `src/excel.ts` の `inspectWorkbook` → `previewToModel`（正方行列、"FCM Values" シート優先、最大200因子）
- デモストアは localStorage（`fcm-studio-demo-v1`）に保存し、壊れていれば seed 3件に戻る（#16）
- 本番URL `https://fcm-studio-demo.vercel.app`（Vercel team robo-lab-fdf42eb4、project fcm-studio-demo）。env の AI_* は設定済み。Vercel MCP は壊れているので CLI を使う
- `/api/demo-draft`（`server/demo-draft.mjs`、制限パスではない）は agenda が空だと400を返す。agenda なしで作った新規プロジェクトでは AI が常にモックにフォールバックする → #15 で直す
- エッジ描画は App.tsx の `edges`（太さ 1 + |w|×2px、正=#4c927c / 負=#cf766c、ラベル "+0.7"/"-0.3"）。マップでの新規接続は常に +0.3（App.tsx onConnect）
- Lander のフィードバックフォーム: https://forms.cloud.microsoft/r/cZMHVzZSf7
- Lander 会議（2026-10-06 18:12〜18:34）の要点: Excel 取り込み→マップ/マトリクスで見る、正負の扱いを明確に（例: コミュニケーション増→対立減は負）、円形表示は好評だが線を太く、継続フィードバック（フォーム＋正負入り Excel を送付予定）

## Open work (the backlog — one item picked per iteration)
- [x] 1. 新規プロジェクト作成 #13（3e2ae6b）
- [x] 2. Excel/JSON 取り込み #14（2ac0c51）
- [x] 3. エディタ内 Import / AI #15（4043d72）
- [x] 4. 状態の保持 #16（93c4e55）
- [x] 5. Lander の会議フィードバック取得（Jin が omi 要約を貼付、会議は 2026-10-06 18:12〜18:34）。下記 8〜11 に分解
- [x] 8. 関係線を太く・正負を色以外でも区別（太さ切替、負は破線、ラベルの − 記号）— P0（Lander 要望）
- [x] 9. 正負を明確に扱うインスペクタ（増える↑/減る↓ の切替＋強さ、因子名入りの説明文）— P0（Lander 要望）
- [x] 10. マップ上の編集の分かりやすさ（常時の接続ヒント、接続直後に正負を選べる）— P1
- [x] 11. Excel テンプレートのダウンロード（正負の値を書き込める雛形）— P1
- [x] 6. README ロードマップ #17（0136a2b）
- [ ] 7. excel.ts の堅牢化 #18（zip bomb・シート数・空ラベル）— P2、次ループ候補

## Metrics
- iterations run: 9 items (#13〜#17, #20〜#23)
- gate pass rate: 9/9（反証で赤を確認したものを含む）

## Flags / blockers
- HITL: Supabase 本番接続（Pro org の新規プロジェクトは月約$10、無料 org は未作成）、Google OAuth クライアント
- omi MCP は不安定（今回は Jin が要約を貼付）
- HITL: Lander が正負の値を含む Excel を送付予定 → 届いたら取り込み検証

## Drift note
なし
