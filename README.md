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
- メニューのカテゴリ別設定と、サポートから開くカテゴリ別の使い方一覧・個別ガイド（`/help`）
- プレビュー・開発環境では空の状態からサンプルデータを追加

React + MUI + TypeScript + Vite。Cloudflare Workersが静的アセットとAPIを配信します。
GoogleログインとD1保存に対応し、ユーザー専用のスペース単位でデータを管理します。
購入・食事履歴の編集、在庫調整、作り置き・廃棄をサーバーで計算・保存します。
スペースへの招待・共有画面、記録削除、バーコードは未実装です。
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
3. 本番公開URLをトップレベルの`vars.BETTER_AUTH_URL`に設定します。Google OAuthのコールバックURLと一致させます。プレビューは共通テストアカウントを使用するので`BETTER_AUTH_URL`とGoogle設定は不要です。
4. Google Cloud ConsoleでOAuthクライアント（ウェブアプリケーション）を作ります。Authorized redirect URIsに`<公開URL>/api/auth/callback/google`を登録します。ローカルは`http://localhost:8787/api/auth/callback/google`。プレビューではGoogle OAuthを使用しません。
5. `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`BETTER_AUTH_SECRET`をWorkerのSecretsに登録します。認証secretは`openssl rand -hex 32`などで生成します。OAuthの秘密値はコミットしません。
6. デプロイスクリプトが対象DBへマイグレーションを自動適用します。

```bash
pnpm exec wrangler secret put GOOGLE_CLIENT_ID
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
pnpm exec wrangler secret put BETTER_AUTH_SECRET
pnpm deploy
```

### staging（devブランチ）

`dev`は既存Worker `refico`のブランチプレビューです。公開URLは`https://dev-refico.yugu0202.workers.dev`で、`wrangler.staging.jsonc`の設定を通常の`previews`へ重ね、専用D1・`APP_ENV=staging`・`AUTH_MODE=google`を使います。サンプルデータ追加は本番と同様に無効です。

Cloudflare Buildsは既存のrefico Workerで、本番ブランチ`main`、ビルドコマンド`pnpm build`、本番デプロイコマンド`pnpm deploy:worker`、プレビューデプロイコマンド`pnpm deploy:preview`にします。`WORKERS_CI_BRANCH=dev`の場合だけstaging設定を選び、それ以外のプレビューは共通テストアカウント・preview D1を使います。

手動でdevプレビューへ配信する場合は、ビルド後に`pnpm deploy:staging`を実行します。staging D1へのマイグレーション後、`wrangler preview --name dev`で配信します。別Workerの作成や`--env staging`は不要です。

staging用OAuthクライアントのリダイレクトURIは`https://dev-refico.yugu0202.workers.dev/api/auth/callback/google`です。初回配信後、Secretsをdevプレビューだけに登録します。本番とは別のOAuthクライアントと認証secretを使います。

```bash
pnpm build
pnpm deploy:staging
pnpm exec wrangler preview secret put GOOGLE_CLIENT_ID --name dev
pnpm exec wrangler preview secret put GOOGLE_CLIENT_SECRET --name dev
pnpm exec wrangler preview secret put BETTER_AUTH_SECRET --name dev
```

### プレビューの共通テストアカウント

`previews.vars`は`APP_ENV=preview`、`AUTH_MODE=test`に設定済みです。アプリ内のログインを省略し、プレビューDBに固定IDの共通ユーザーを作成します。同じプレビューD1を使うブランチ・URL・ブラウザでは、全員が同じスペースのデータを共有します。Cookieを削除しても保存済みデータを確認できます。Google設定・認証Secrets・AccessのAUD設定は不要です。

Cloudflare Accessで対象プレビュー全体（静的アセットとAPI）を保護してください。Accessは入口の制限として利用し、アプリではAccess JWTやユーザー情報を検証しません。Access保護がないURLでは誰でも共通データを読み書きできます。本番で`AUTH_MODE=test`を指定した場合はAPIを拒否します。

プレビューD1は本番と別に作成・マイグレーションしてください。以前のAccessユーザーの記録は共通アカウントへ移行しません。競合は既存のリビジョン検証で拒否します。

ローカルで試す場合は別のWrangler設定で`APP_ENV=preview`、`AUTH_MODE=test`とローカルD1を指定してください。

サンプルデータ追加は`APP_ENV=preview`または`APP_ENV=development`の場合だけ利用できます。本番・環境未設定・不明な値ではボタンを表示せず、`sample.create`コマンドも403で拒否します。画面の可否は`/api/bootstrap`の`sampleDataEnabled`で判断します。ローカルでGoogle認証を使う場合は`.dev.vars`に`APP_ENV=development`を指定してください。

### ローカル

`.dev.vars.example`を`.dev.vars`にコピーし、Google OAuthの開発用クライアントと認証secretを設定します。

```bash
pnpm install
pnpm db:migrate:local
pnpm dev:worker
```

`http://localhost:8787`でGoogleログインとアプリを確認できます。Viteのホットリロードを使う場合は、別ターミナルで`pnpm dev`を実行し、`.dev.vars`の`BETTER_AUTH_URL`とGoogleの開発用リダイレクトURIを`http://localhost:5173`へ揃えてWorkerを再起動します。Viteは`/api`をローカルWorkerへ転送します。

### 自動マイグレーション

デプロイ用スクリプトは本番は`wrangler.jsonc`のトップレベル、通常プレビューは`previews.d1_databases`、devプレビューは`wrangler.staging.jsonc`の`previews.d1_databases`を選択します。CLI用の一時設定を生成し、未適用マイグレーションをすべて適用してから配信します。失敗時は配信を中止し、一時設定は削除します。プレビュー・stagingのDBが本番DBと同じIDの場合も拒否します。

`pnpm deploy`はビルド・本番マイグレーション・本番配信を行います。Cloudflare Buildsではビルドコマンドを`pnpm build`、本番デプロイコマンドを`pnpm deploy:worker`、プレビューデプロイコマンドを`pnpm deploy:preview`にします。ビルド用APIトークンには対象DBのD1編集権限が必要です。DashboardでSQLを手動適用せず、Wranglerの`d1_migrations`で適用履歴を管理してください。

### Workers Builds

本番ブランチは`main`、ルートディレクトリは`/`。Enable Preview Buildsを有効にします。

| 設定         | コマンド              |
| ------------ | --------------------- |
| ビルド       | `pnpm build`          |
| 本番デプロイ | `pnpm deploy:worker`  |
| プレビュー   | `pnpm deploy:preview` |

マイグレーションは上記デプロイスクリプト内で、配信前に自動適用します。Google OAuthの設定が完了するまで認証APIは利用できません。`/api/health`は設定前でも疎通確認できます。

## データと計算

[サーバーデータモデル](docs/DATA_MODEL.md)に所有範囲、テーブル、更新API、同時更新と再送の扱いをまとめています。

### D1の読み込み

フォーカス復帰時の再取得は、前回の取得開始または保存成功から5分以上経過した場合だけ行います。保存中・取得中は実行せず、日付表示は毎回更新します。初期取得・手動再読み込み・401/409の復旧はこの間隔に制限されません。同時に発生したbootstrapは1リクエストにまとめます。

スナップショットはrevisionと12テーブルをそれぞれSELECTし、`db.batch()`で一括取得します。各テーブルのrowid順と取得時点の整合性を保ちます。同じ記録を読むSQLの集約では料金に直結するrows readを減らせないため、SQLは単純な形を維持し、不要な取得回数と認証DB参照の削減を優先します。スペースの所属確認は引き続きリクエストごとにD1で行います。

プレビューユーザーの作成はDBバインディングごと・Worker isolate内で初回のみ行い、同時リクエストでも初期化を共有します。初期化失敗時は再試行し、isolateが再起動した場合は冪等なINSERTを実行します。

Better Authの署名付きセッションCookieを5分間キャッシュします。API応答に更新・削除のSet-Cookieを個別に返し、期限切れ後はD1で再検証します。ログアウト時はそのブラウザのCookieを削除しますが、他端末でのセッション失効が反映されるまで最大5分かかります。

食材の基準単位はg / ml / 個。kg↔g、L↔mlは標準換算し、合・枚・パックなどは食材ごとに登録します。元の数量・単位・換算係数を履歴に保存します。内部数量は基準単位の1/1000整数、原価は円整数です。

購入ロットは購入日順FIFO。同日なら登録順。後から過去の記録を追加しても既存の配分を変えず、食事日以前の未消費ロットを使用します。累積丸めの差額を原価として配分し、3個100円を1個ずつ使うと33円・34円・33円になります。

作り置きでは調理時に食材を消費し、食べた日に食費を計上します。日付は利用者が指定したローカル日付として保存します。

## 検証

`pnpm check`、`pnpm test`、`pnpm build`、`pnpm exec wrangler deploy --dry-run`。
テストは原価計算、サーバーモデルの投影、認証済みAPI、再送、リビジョン競合、スペース間の分離、D1と同じSQLによるロールバックを検証します。
認証テーブルはBetter Authのマイグレーション機能で生成済みです。ライブラリ更新時は`pnpm auth:schema`で生成内容を比較し、稼働DBには既存マイグレーションの上書きではなく新規マイグレーションを追加します。

公式資料:

- https://better-auth.com/docs/authentication/google
- https://better-auth.com/docs/concepts/database
- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://developers.cloudflare.com/workers/previews/configuration/

### Tursoを使う場合

`DB_BACKEND`を`d1`（既定）または`turso`にすると、在庫・スペース・招待・Better Authを同じバックエンドへ切り替えられます。Tursoを選んだ状態で接続設定が欠けたり通信に失敗した場合、D1にはフォールバックしません。Concurrent Writesは使用せず、snapshotの一括読み取り・更新は通常のトランザクションで実行します。

1. 本番・staging・previewでそれぞれ別のTurso DBを作成します。既存のSQLにはtrigger、STORED生成列、JSON関数、遅延外部キー、ALTER TABLEのrenameが含まれます。利用するTurso DBでこれらに対応していることをマイグレーションで確認してください。
2. 対象設定の`vars`へ`DB_BACKEND: "turso"`と`TURSO_DATABASE_URL`を指定します。devは`wrangler.staging.jsonc`の`previews.vars`、通常プレビューは`wrangler.jsonc`の`previews.vars`、本番は同ファイルの`vars`です。プレビュー設定は本番のvarsを継承しません。
3. 対象Worker/PreviewのSecretへ`TURSO_AUTH_TOKEN`を設定します。Google OAuth・Better AuthのSecret設定は従来と同じです。URL・トークンの両方が必須です。
4. 自動マイグレーション用にCloudflare BuildsのSecretへ、対象に応じた`TURSO_PRODUCTION_AUTH_TOKEN`、`TURSO_STAGING_AUTH_TOKEN`、`TURSO_PREVIEW_AUTH_TOKEN`を設定します。Workerの実行用Secretとは別の設定です。トークンはコマンド引数や設定ファイルへ書きません。
5. 通常の`deploy:worker`/`deploy:preview`/`deploy:staging`で、対象バックエンドのマイグレーションを適用してから配信します。Turso選択時にD1マイグレーションは実行しません。失敗した場合は配信を止めます。

手動では環境変数`TURSO_DATABASE_URL`と`TURSO_AUTH_TOKEN`を指定して`pnpm db:migrate:turso`を実行します。`migrations/*.sql`をファイル単位で適用し、履歴・SHA-256を`refico_migrations`に保存します。適用済みファイルの変更はエラーにし、各ファイルのSQLと履歴は同じトランザクションで保存します。

接続はリクエストごとに分離し、同じ接続で外部キーを有効化してからSQLを実行します。外部キー設定の往復が最初に1回発生します。SQLのprepare自体はローカル処理で、batchは1回のHTTPリクエストにまとめます。D1との速度比較はこの初期化・HTTP通信も含むWorkerの応答時間で行ってください。

バックエンドの切り替えはデータ移行ではありません。新規Turso DBは空で、D1に保存済みのユーザー・セッション・在庫・招待を自動コピーしません。既存データを引き継ぐ際は別途移行が必要です。Tursoで作成した記録もD1へ戻すだけでは引き継がれません。まずstaging専用DBでログイン・保存・招待を確認し、本番の切り替えはその後に行ってください。
