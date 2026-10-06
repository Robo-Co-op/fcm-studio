# run-log: demo-complete (append-only)

| timestamp | item | gate | notes / cost |
|---|---|---|---|
| 2026-10-06 | setup | - | LOOP/STATE/run-log/budget を作成。Phase 0: loop-design は interactive・L1 |
| 2026-10-06 | gate-builder | PASS 175 | 反証 F1/F2/F3 すべて BLOCK。DBテストのタイムアウトフレークを修正 |
| 2026-10-06 | #13 新規プロジェクト作成 | PASS 181 | improve: simplifier/security OK、test-writer の指摘3件を追加（欠陥を入れて赤を確認）、E2E 2件（失敗も確認）。SHIP |
| 2026-10-06 | #17 README ロードマップ | PASS 181 | ドキュメントのみ |
| 2026-10-06 | #14 Excel/JSON取り込み | PASS 220 | DEFENCE判定→攻撃リスト29件+proto（検証を外すと6件赤）。simplifier Medium（失敗時にプレビューが消える）修正、security MED（zip bomb）は #18 に分離。E2E 3件。SHIP |
| 2026-10-06 | #15 エディタ内Import/AI | PASS 221 | E2E先行（RED確認）、simplifier Medium（不正モデルで成功表示）修正、security OK（実クラウドAIはサーバー側で強制）。E2E 4件、欠陥を入れて2件赤を確認。SHIP |
