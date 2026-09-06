# LOOP: cloud-collaboration

## Goal
プロジェクトごとのテナント分離、ログイン、権限付き共同編集、Vercel/Supabase公開、OpenRouter評価を実装し、実際の検証結果で完了を判定する。

## Trigger
ユーザーが現在の対話セッションで dev-loop を明示指定。定期実行・無人実行・自動再投入なし。

## Native primitive / application mechanism
Codex の専用サブエージェントが loop-design、state-keeper、gate-builder の実際の SKILL.md を読み、手順を適用した。ネイティブ Skill/slash 実行ツールは存在せず、slash 呼び出しを実行したとは主張しない。
テンプレートはスキル相対ディレクトリではなくパッケージ直下 `templates/LOOP.md`、`STATE.md`、`gate.py` に存在し、読み取り済み。Node製プロジェクトに合わせて gate.py の終了コード判定を移植した。
Claude Stop hook はこのランタイムと互換性がないため未導入。各項目終了時に `node scripts/gate.mjs` を必須で実行する対話内チェック方式。終了をランタイムで強制できるとは主張しない。

## Honesty pre-flight and termination condition
- 同じ計画・実装・検証手順を4項目に適用する有限作業。無期限ループにはしない。
- lint、Vitest、build は機械検証可能。クラウド分離と招待の実動作は別途 E2E/独立レビューが必要。
- 作業はこのリポジトリと担当境界に限定。親エージェントが機能ブランチを管理する。
- 全4項目が実装され、ローカルゲート、独立セキュリティレビュー、クラウド実機検証が成功したら完了。最大12項目試行で停止して未完了内容を報告する。
- 目標は automatic + closed だが、現在は対話内の mandatory + deterministic gate。無人運転可能とは評価しない。

## Gate (maker ≠ checker)
- 種別: deterministic-script + independent review。実装者の完了宣言を判定入力にしない。
- コマンド: `node scripts/gate.mjs`。実際の `npm run lint`、`npm test`、`npm run build` を順番に実行する。
- 全終了コード0、Vitest成功、57件以上の実行済みテスト、skip/pending/todoゼロが必要。実行不能・timeout・不正レポートも失敗。
- 決定的スクリプトが機械判定する。認証・RLS・競合・招待は親が別エージェントにレビューを依頼する。件数だけではテスト品質を証明しない。
- このゲートはデプロイ成功、RLS実動作、ブラウザE2E、予算消費を証明しない。それぞれ別の証跡を必要とする。

## Falsification evidence (2026-09-06)
1. 基準コミット `67a1a12b1e5b2c358bab904cda58641bcd2339d2` の作業ツリーで gate 実行: exit 0、57 tests、lint/build成功。
2. 一時的な `src/gate-falsification.test.ts` に `expect(1).toBe(2)` を追加し、同じ gate 実行: npm test exit 1 / gate exit 1。buildには進まなかった。
3. 一時テストを削除して再実行: gate exit 0、57 tests、lint/build成功。Test-Path結果 False。
サンドボックス初回は esbuild の設定読み込み拒否で exit 1。通常の承認レビューを経た実行で検証した。失敗を成功扱いしていない。

## Autonomy level
L1 report-only。ループ単独で外部変更しない。ユーザーが依頼した実装と無料公開準備は親が現在の対話の権限内で実行する。自動昇格なし。

## Budget & circuit breakers
- 全体12項目試行、各項目3試行まで。同一修正2回失敗でアプローチ変更。各gateサブコマンド600秒。
- OpenRouter実評価は既存残高から累計1米ドルまで。購入・有料プラン契約なし。呼び出し前に累計と最大見積額を確認し、上限以内を保証できなければ実行しない。
- エージェントのトークン単価・消費額はこのランタイムから取得できず不明。架空の費用見積を作らない。追加API費用のみ数値で管理し、無人日次消費0。
- 予算上限、権限不足、予期しない外部リソース、3試行失敗で停止し、この対話に必要な判断を報告。

## Restricted paths / actions
ユーザー指定の認証、非破壊マイグレーション、新規無料Vercel/Supabaseプロジェクトは承認済み作業範囲。これだけを理由に再承認を要求しない。
対象外のインフラ/プロジェクト、破壊的マイグレーションや削除、購入、明示されていない外部への招待メール送信は禁止。
`.env`、credentials、秘密鍵の読み書き禁止。秘密は1Passwordからランタイムのみで利用し、ログ・リポジトリ・一時ファイルへ保存しない。

## MCP / connector scopes
GitHubは本リポジトリのブランチ/PR、Vercel/Supabaseは承認済み無料新規環境、OpenRouterは1米ドル以内の評価、1Passwordは必要な秘密のランタイム取得に限定。招待機能実装と実際の外部メール送信を混同しない。

## Escalation and reporting
実行したコマンド・終了コードを `run-log.jsonl` に追記する。既存行は書き換えない。STATEとbudgetを項目開始/終了時に確認する。
未実施、失敗、外部ブロッカーを区別し、意味のある進捗または要判断事項だけを現在の対話へ報告する。Slack/メールの送信なし。
