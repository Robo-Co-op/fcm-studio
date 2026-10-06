# run-log: demo-complete (append-only)

| timestamp | item | gate | notes / cost |
|---|---|---|---|
| 2026-10-06 | setup | - | LOOP/STATE/run-log/budget を作成。Phase 0: loop-design は interactive・L1 |
| 2026-10-06 | gate-builder | PASS 175 | 反証 F1/F2/F3 すべて BLOCK。DBテストのタイムアウトフレークを修正 |
| 2026-10-06 | #13 新規プロジェクト作成 | PASS 181 | improve: simplifier/security OK、test-writer の指摘3件を追加（欠陥を入れて赤を確認）、E2E 2件（失敗も確認）。SHIP |
| 2026-10-06 | #17 README ロードマップ | PASS 181 | ドキュメントのみ |
| 2026-10-06 | #14 Excel/JSON取り込み | PASS 220 | DEFENCE判定→攻撃リスト29件+proto（検証を外すと6件赤）。simplifier Medium（失敗時にプレビューが消える）修正、security MED（zip bomb）は #18 に分離。E2E 3件。SHIP |
| 2026-10-06 | #15 エディタ内Import/AI | PASS 221 | E2E先行（RED確認）、simplifier Medium（不正モデルで成功表示）修正、security OK（実クラウドAIはサーバー側で強制）。E2E 4件、欠陥を入れて2件赤を確認。SHIP |
| 2026-10-06 | #16 状態の保持 | PASS 235 | レビューで「後続の保存が前の変更も書き込むため、save()欠落を検出できないテスト」が判明→変更ごとの再読込テストに書き直し、各save()除去で赤を確認。security OK（ID重複チェック追加）。SHIP |
| 2026-10-06 | loop-retro | - | 繰り返し出たパターン: 初回 green で何も検証していないテストが3件。LOOP.md に「初回で通ったテストは欠陥注入で赤を見てから採用」を明文化。e2e-tester はこの作業ディレクトリでは起動不可と注記。omi 未接続はブロッカーとして STATE に記録 |
| 2026-10-06 | ship: CI | FAIL→修正 | 実クラウドE2Eが「Explore with AI は無効」を期待して失敗。AI実装前（b26691d）のアサーションで、DEPLOYMENT.md 手順5と矛盾 → 期待値を「有効」に更新。ローカルで cloud E2E 17/17。PR に Jin の確認事項として明記 |
| 2026-10-06 | ship: deploy+email | PASS | Vercel preview で新規作成・実AI（OpenRouter、13.7秒、モックではない）・保持・JSON取り込みを確認 → 本番デプロイ dpl_8hoiT39Hb4wy8sgNw9YnVjBSMwY7、本番エイリアスで200と新機能を確認。Lander宛てメール送信（xlsx は添付手段がなく本文に表で記載）。CI再実行中に本番化（ローカルで同じスイートが green） |
| 2026-10-06 | #20 線の太さ・正負の区別 | PASS | unit 17件（float丸めはRED確認）、E2E edge-style（保存なし・破線なしの欠陥でそれぞれ赤を確認）、既存E2Eのラベル文字列を更新。simplifier Medium（矢印巨大化）修正。SHIP |
| 2026-10-06 | #21 正負の切替 | PASS 258 | unit 6件、E2E（向き無視・符号落ちの欠陥でそれぞれ赤）。レビュー: 古い注記・role=group・折り返し・削除E2E を修正（削除E2Eも欠陥で赤を確認）。SHIP |
| 2026-10-06 | #22 マップ編集の分かりやすさ | PASS 258 | 接続直後の選択は既存の selectPair で成立済み→ヒント常時表示と凡例11px化。E2E（ドラッグ接続→減る→−0.3）、ヒントなし・接続後未選択の欠陥でそれぞれ赤、viewer はヒントなし。SHIP |
| 2026-10-06 | #23 Excelテンプレート | PASS 259 | unit+E2Eの往復（負の例を正にする欠陥で両方赤）。レビュー Medium（URL即時破棄）修正。SHIP |
