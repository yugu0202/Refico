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

React + MUI + TypeScript + Vite。Cloudflare Workersが静的アセットとAPIを配信します。
GoogleログインとD1保存に対応し、ユーザー専用の家庭単位でデータを管理します。
購入・食事履歴の編集、在庫調整、作り置き・廃棄をサーバーで計算・保存します。
家庭への招待・共有画面、記録削除、バーコードは未実装です。
旧localStorageデータの移行は行いません。

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

## Cloudflare Workers / Googleログイン

1. 本番用とプレビュー用にD1を別々に作ります。

```bash
pnpm exec wrangler d1 create refico
pnpm exec wrangler d1 create refico-preview
```

2. `wrangler.jsonc`のトップレベルと`previews.d1_databases`の仮IDをそれぞれのIDに置き換えます。DBバインディング名は両方`DB`です。仮IDは本番リソースを指していません。
3. 本番公開URLをトップレベルの`vars.BETTER_AUTH_URL`に設定します。Google OAuthのコールバックURLと一致させます。プレビューはCloudflare Accessを使用するので`BETTER_AUTH_URL`とGoogle設定は不要です。
4. Google Cloud ConsoleでOAuthクライアント（ウェブアプリケーション）を作ります。Authorized redirect URIsに`<公開URL>/api/auth/callback/google`を登録します。ローカルは`http://localhost:8787/api/auth/callback/google`。プレビューではGoogle OAuthを使用しません。
5. `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`BETTER_AUTH_SECRET`をWorkerのSecretsに登録します。認証secretは`openssl rand -hex 32`などで生成します。OAuthの秘密値はコミットしません。
6. 接続先DBごとにマイグレーションを適用してからデプロイします。

```bash
pnpm exec wrangler d1 migrations apply refico --remote
pnpm exec wrangler d1 migrations apply refico-preview --remote
pnpm exec wrangler secret put GOOGLE_CLIENT_ID
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
pnpm exec wrangler secret put BETTER_AUTH_SECRET
pnpm deploy
```

### プレビューのCloudflare Access

`previews.vars`は`APP_ENV=preview`、`AUTH_MODE=access`に設定済みです。本番の`AUTH_MODE=google`とは分離します。
CloudflareのWorkers設定で対象Workerの**プレビュー全体をWorker単位でAccess保護**してください。Static Assets構成では`ctx.access`がWorkerへ渡らないため、`Cf-Access-Jwt-Assertion`の署名・発行元・対象アプリ・有効期限を検証して自動ログインします。`previews.vars.ACCESS_TEAM_DOMAIN`にチームドメイン（`<team>.cloudflareaccess.com`）、`ACCESS_AUD`に対象プレビューを保護するAccessアプリのApplication Audience (AUD)を設定してください。どちらも公開設定でSecretsは不要です。Google OAuthクライアント、認証Secrets、固定コールバックURLはプレビューに不要です。

Accessの認証情報がないリクエストは401で拒否します。メールアドレスのヘッダーだけを信用したり、固定のテストユーザーへフォールバックしたりしません。Accessモードを本番に設定した場合も拒否します。ホスト名単位で保護する場合も、対象プレビューとAPIの両方を保護し、そのAccessアプリのAUDを設定してください。

プレビューD1は本番と別に作成・マイグレーションしてください。同じプレビューDBを指定したブランチ間では、同じAccessユーザーのデータを共有します。

Static Assetsを外したローカルWorkerでctx.access方式を確認する場合は、Wranglerの開発用設定で認証情報を模擬できます（本番・プレビューのAccessポリシーを変更するものではありません）。別のローカル設定ファイルに以下を指定します。

```jsonc
{
  "vars": { "APP_ENV": "preview", "AUTH_MODE": "access" },
  "access": {
    "dev": {
      "aud": "refico-local",
      "identity": {
        "user_uuid": "local-user",
        "email": "developer@example.test",
      },
    },
  },
}
```

公式仕様: https://developers.cloudflare.com/workers/configuration/cloudflare-access/

### ローカル

`.dev.vars.example`を`.dev.vars`にコピーし、Google OAuthの開発用クライアントと認証secretを設定します。

```bash
pnpm install
pnpm db:migrate:local
pnpm dev:worker
```

`http://localhost:8787`でGoogleログインとアプリを確認できます。Viteのホットリロードを使う場合は、別ターミナルで`pnpm dev`を実行し、`.dev.vars`の`BETTER_AUTH_URL`とGoogleの開発用リダイレクトURIを`http://localhost:5173`へ揃えてWorkerを再起動します。Viteは`/api`をローカルWorkerへ転送します。

### Workers Builds

本番ブランチは`main`、ルートディレクトリは`/`。Enable Preview Buildsを有効にします。

| 設定         | コマンド               |
| ------------ | ---------------------- |
| ビルド       | `pnpm build`           |
| 本番デプロイ | `npx wrangler deploy`  |
| プレビュー   | `npx wrangler preview` |

マイグレーションは上記コマンドとは別に、接続先を確認して適用します。Google OAuthの設定が完了するまで認証APIは利用できません。`/api/health`は設定前でも疎通確認できます。

## データと計算

[サーバーデータモデル](docs/DATA_MODEL.md)に所有範囲、テーブル、更新API、同時更新と再送の扱いをまとめています。

食材の基準単位はg / ml / 個。kg↔g、L↔mlは標準換算し、合・枚・パックなどは食材ごとに登録します。元の数量・単位・換算係数を履歴に保存します。内部数量は基準単位の1/1000整数、原価は円整数です。

購入ロットは購入日順FIFO。同日なら登録順。後から過去の記録を追加しても既存の配分を変えず、食事日以前の未消費ロットを使用します。累積丸めの差額を原価として配分し、3個100円を1個ずつ使うと33円・34円・33円になります。

作り置きでは調理時に食材を消費し、食べた日に食費を計上します。日付は利用者が指定したローカル日付として保存します。

## 検証

`pnpm check`、`pnpm test`、`pnpm build`、`pnpm exec wrangler deploy --dry-run`。
テストは原価計算、サーバーモデルの投影、認証済みAPI、再送、リビジョン競合、家庭間の分離、D1と同じSQLによるロールバックを検証します。
認証テーブルはBetter Authのマイグレーション機能で生成済みです。ライブラリ更新時は`pnpm auth:schema`で生成内容を比較し、稼働DBには既存マイグレーションの上書きではなく新規マイグレーションを追加します。

公式資料:

- https://better-auth.com/docs/authentication/google
- https://better-auth.com/docs/concepts/database
- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://developers.cloudflare.com/workers/previews/configuration/
