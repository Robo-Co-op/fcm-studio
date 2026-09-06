# クラウド検証記録

## 第1スライス

Lite plan/build/improve/shipの実ファイルを読み、このランタイムのツールで適用。ネイティブslash呼び出しではない。

- Plan: GitHub #1、PLAN.md、issue-01.md。プロジェクトをテナント境界とし、Googleログインを優先。
- Build: 未実装RPC、ブラウザ導線、型偽装、保存上限のREDを実行後、実装しGREENを確認。
- Improve: security-auditor、test-writer、code-simplifier、e2e-testerの独立レビューを実施。空白・UTF-16・revision・日時の不一致を修正。
- DB: PGliteで実PostgreSQLの権限・RPCを実行。auth.uidだけをテスト用認証境界として模擬。
- 攻撃: 30件の回帰テスト。RLSをtransaction内で外すと同じ分離assertionが失敗し、rollback後は成功。
- 描画: 新規6シナリオを各3回成功。既存を含む最終回帰8件と、構成済みクラウド5件も成功。
- 外部OAuth/RESTはブラウザテストで模擬。本番Google認証・Supabase・デプロイは未検証。

## データ契約

- ラベル重複判定はECMAScript trim後、ASCII A–Zだけ大小文字を同一視。非ASCIIの大文字小文字は区別する。
- 実験日時はUTCの `YYYY-MM-DDTHH:mm:ss.sssZ` 形式を使用する。
- 初期保存枠: 1文書10 MiB、作成者あたり20プロジェクト・合計20 MiB、全体200プロジェクト・合計100 MiB。作成はDBロック内で上限を確認する。
- 上限は無料環境向けの初期運用値。課金や自動増枠は行わない。

## 公開環境に必要な設定

Vite公開設定は `VITE_SUPABASE_URL` と `VITE_SUPABASE_PUBLISHABLE_KEY`。サービスキーをVITE変数に入れない。
Supabaseにはmigrationを適用し、Google OAuthクライアント、Supabase callback URI、公開サイトのredirect URLを設定する。
秘密値は1Passwordからプロセス内で取得し、環境ファイルやGitに保存しない。

現時点では1Password CLIの認証は確認済み。利用可能な保管庫から、本アプリ向けSupabase管理トークン、Vercel APIトークン、OpenRouterキーは特定できていない。

## 第2スライス

- Plan: GitHub #2。`replace_model` と `set_details` の2種類を、operation IDと期待revision付きで実行する。異なるfactorでも同時変更は競合とし、自動マージはしない。
- Build: 古いrevision、同じoperationの再送、閲覧者・部外者・取消済みメンバー、不正モデル、保存・operation上限を実PostgreSQLで検証。
- Conflict UX: サーバー確定版を表示し、未保存案は別に保持。JSON書き出し、破棄、確認ダイアログ後の全体再適用を提供。
- Sync: Supabase Realtimeの更新購読を登録し、focus・online・10秒間隔でも認可済みデータを再取得。取消検出時は開いていた研究データを画面から除去。
- Browser: 外部Supabase境界を模擬した2セッション、同一revision競合、viewer、offline/reconnect、undo、詳細更新、権限取消を検証。本番Realtimeの証明ではない。
- Improve: 途中で一部担当がworkspace credit不足になった後、独立checkerを再実行。初回FAILで指摘された同一セル競合、一括paste、取消後SELECT拒否の証明を追加し、再判定PASS。決定的ゲート122件、20件のコマンド攻撃表、クラウド画面12件も成功。
