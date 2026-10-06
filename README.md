# Refico

Cloudflare Workers上で動作する、食材の在庫管理と1日の食費計算アプリです。
購入量・価格と使用量を記録し、使った分の食費を計算します。

## 現在できること

- 食材登録と商品固有単位の登録（白米: 1合 = 150g など）
- 購入時の食材・単位プルダウンから追加（入力中の購入量・価格・日付は保持）
- 在庫一覧の「編集」から食材名・単位名・換算値の編集、単位の追加・削除（履歴の数量・原価は保持）
- 購入量・単位・購入価格・日付の記録
- 在庫の残量・金額・購入履歴の確認
- 食事への複数食材の使用記録と原価のプレビュー
- 食事別・日別の食費表示
- 空の状態からサンプルデータを追加

React + MUI + TypeScript + Vite。Cloudflare Workers が静的アセットを配信します。
データは localStorage に保存します。ブラウザ・端末間の共有はまだできません。
D1、認証、記録の編集・削除、廃棄、バーコードは未実装です。

## 開発

Node.js 22.12以上（推奨24）、pnpm 11.25.0を使用します。

```bash
corepack enable
pnpm install
pnpm dev
```

http://localhost:5173 で開きます。

```bash
pnpm check
pnpm test
pnpm build
pnpm preview
```

DESIGN.md に画面のルール、AGENTS.md に実装のルールをまとめています。
MUI のテーマは src/theme.ts で管理します。

## Cloudflare Workers

```bash
pnpm dev:worker
pnpm deploy
```

deploy は自分のCloudflareアカウントへデプロイします。事前に `pnpm exec wrangler login` またはCIのCloudflare API Token設定が必要です。
Worker名は wrangler.jsonc の name を変更してください。
現在の構成ではD1などのresource IDは必要ありません。
/api/health は疎通確認、その他の /api/* は404を返します。

静的アセット設定: https://developers.cloudflare.com/workers/static-assets/

### Workers Buildsとプレビュー

GitHub連携では本番ブランチを `main`、ルートディレクトリを `/` に設定します。
Branch control の Enable Preview Builds を有効にします。

| 設定         | コマンド               |
| ------------ | ---------------------- |
| ビルド       | `pnpm build`           |
| 本番デプロイ | `npx wrangler deploy`  |
| プレビュー   | `npx wrangler preview` |

Worker Previewsに対応したWranglerを使用します。プレビュー設定は
`wrangler.jsonc` の `previews` に定義し、ログ・呼び出しログ・トレースも有効にしています。
静的アセットとcompatibility設定はトップレベルの設定を使用します。

D1を導入する際は、本番用とプレビュー用に別のデータベースを作成します。
トップレベルの `d1_databases` に本番用、`previews.d1_databases` にプレビュー用を指定し、
アプリから使うバインディング名（例: `DB`）は揃えます。
D1はプレビューごとに自動作成されません。同じプレビュー用DBを指定したブランチ同士はデータを共有します。
ブランチ単位で分ける場合は、各ブランチの `previews.d1_databases` に別のDBを指定します。
マイグレーションも接続先に合わせて適用します。Secretsは本番とプレビューで別途設定します。

Worker Previews設定: https://developers.cloudflare.com/workers/previews/configuration/

## データと計算

src/domain/inventory.ts に換算・在庫・原価計算をまとめています。
保存先をD1に変更する際にも、この層のロジックを共有する想定です。

食材の基準単位は g / ml / 個。kg↔g、L↔mlは標準換算し、合・枚・パックなどは食材ごとに登録します。
登録した単位は購入・食事の両方で選べます。係数を含む入力情報と正規化後の数量を記録します。
基準単位の0.001刻みまで入力でき、内部は1/1000単位の整数です。

購入は価格の異なるロットとして保持します。食事の保存時に、購入日順（同日なら登録順）に消費量を配分します。
過去の食事を後から登録しても既存の配分は変更せず、未消費で食事日以前に購入したロットから使います。
在庫不足なら全体の保存を中止します。

円単位の原価は購入ロットの累積消費原価を四捨五入し、その差額を各使用に配分します。
例: 3個100円を1個ずつ使うと33円・34円・33円。合計は購入価格と一致します。
日別食費は食事の使用原価の合計で、購入日の支払額とは別です。
日付は利用者のローカル日付として扱います。

## 次の段階

- D1: 商品、換算単位、購入、食事、使用、ロット配分を永続化
- 利用者・家庭の境界と認証
- 使用記録とロット配分を同一トランザクションで保存し、同時更新・重複送信を防止
- 記録訂正・廃棄とデータのエクスポート

D1接続時に価格・残量を商品マスタへまとめず、購入ロットと使用配分を保持します。
秘密値はCloudflare Secrets、ローカルは .dev.vars に置いてコミットしないでください。
