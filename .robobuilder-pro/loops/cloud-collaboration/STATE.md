# STATE: cloud-collaboration

## Current status
running — 第1スライスのコードはPR #5でマージ・CI成功。本番接続は認証情報待ち。第2スライスの共同編集を実装中。

## Facts
- リポジトリ: Robo-Co-op/fcm-studio。基準HEAD: 67a1a12b1e5b2c358bab904cda58641bcd2339d2。
- テナント境界はプロジェクト。オーナーが編集者/閲覧者を招待する方針をユーザー確認済み。
- Vercel/Supabase無料枠、OpenRouter既存残高の評価上限1米ドル。購入なし。
- 実際のloop-design/state-keeper/gate-builderとパッケージ直下templatesを読み適用済み。ネイティブSkill呼び出し/Stop hookは未使用。

## Open work — one item per iteration
- [x] 1. 認証とプロジェクト単位の非公開永続化（コード・ローカル検証完了。本番検証は第4スライスで引継ぎ）
- [ ] 2. revisionによる安全な共同編集と競合処理
- [ ] 3. owner管理のメール結合招待、役割、不変の研究記録
- [ ] 4. Vercel/Supabase公開とOpenRouterモデル評価
- [x] 決定的ゲートと故障注入の実証

## Metrics
- コード実装・レビュー済み: 1/4。本番を含む全体完了: 0/1。第2項目を実装中。
- ハーネスgate実行: 4、成功2、意図した失敗1、環境拒否1。
- 直近第1項目検証: lint成功、104/104 tests成功、build成功、exit 0。ブラウザ13/13。PR/main CI成功。
- 一時故障テスト削除確認: Test-Path False。

## Flags / blockers
- ローカルgateは本番RLS/E2E/デプロイを検証しない。
- esbuildはサンドボックス外の承認済み実行を必要とした。
- Excelバンドルの500KB超警告あり。buildは成功。
- 本番モデル/API費用とクラウド環境はハーネス担当では未検証。

## Drift note
L1、対話内実行、無料枠と1ドル評価上限はLOOPと一致。無人実行/自動Stop抑止は未構築であり、その能力を主張しない。
