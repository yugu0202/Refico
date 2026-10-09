# ブランド素材

丸みのあるRと右上のオレンジのドットを使用する。明暗で形・余白・ドットの色は共通にする。

| 配色   | R         | ドット    | アイコンの背景 |
| ------ | --------- | --------- | -------------- |
| ライト | `#1f2937` | `#f59e0b` | `#fffbf5`      |
| ダーク | `#ffffff` | `#f59e0b` | `#1f2937`      |

## ファイル

すべて `public/` 以下。ロゴは透明背景、アイコンは背景付き。

| 用途                          | ライト                        | ダーク                             |
| ----------------------------- | ----------------------------- | ---------------------------------- |
| 画面内ロゴ（SVG）             | `logo.svg`                    | `logo-dark.svg`                    |
| favicon（SVG）                | `favicon.svg`                 | `favicon-dark.svg`                 |
| favicon（32px ICO）           | `favicon.ico`                 | `favicon-dark.ico`                 |
| iPhoneホーム画面（180px PNG） | `apple-touch-icon.png`        | `apple-touch-icon-dark.png`        |
| アプリアイコン（192px PNG）   | `icons/icon-192.png`          | `icons/icon-dark-192.png`          |
| アプリアイコン（512px PNG）   | `icons/icon-512.png`          | `icons/icon-dark-512.png`          |
| Maskable（512px PNG）         | `icons/icon-maskable-512.png` | `icons/icon-maskable-dark-512.png` |

## 形と配置

添付の調整案に合わせ、Rの丸い輪郭と右上のドットを保ちつつ、背景付きアイコンではRを右へ寄せて余白を確保する。128×128の座標でRの外形はx=31〜91、y=35〜103、ドットは中心(101, 38)、半径10。画面内ロゴは同じ形を96×96のviewBoxで切り出し、小さなヘッダーでも見やすくする。

通常のPNGはfavicon.svgから背景の角丸だけを外して生成する（OS側が角丸に切り抜く）。Maskableはマーク全体を中央基準で80%に縮小し、安全領域の円内に収める。PNG・ICOも両配色を一緒に更新する。アイコン参照のバージョンは`v=3`。

## 現在のテーマ対応

画面内ロゴは選択されたテーマに合わせて切り替える。ダークテーマの画面内ロゴは文字色と同じ `#eeeee8`、背景付きのダークアイコンは `#ffffff` のRを使用する。favicon・Apple Touch Icon・Web App Manifestは現在ライト版を参照する。

- 画面内ロゴは端末設定・ライト・ダークの選択に従う。端末設定を選んだときだけOS設定に追従する。
- faviconを今後切り替える場合は、アプリのテーマ方針に合わせる。OS設定に従う場合は `prefers-color-scheme` の `media` 条件を利用できる。
- ホーム画面用アイコンはブラウザやOSが保存・キャッシュするため、ページのテーマ変更と同時に切り替わる前提にしない。現在はライト版を採用し、ダーク版は別の配色を採用する場合に備えた素材として保持する。
- PNG・ICOを作り直す場合はSVGと同じ形・色を使用し、通常アイコンとMaskableの余白を維持する。

## ステージング・プレビュー

本番以外のfavicon・Apple Touch Icon・PWAアイコンは、Rを維持しつつステージングは青（#2563eb）とS、プレビューは紫（#7c3aed）とPのバッジで区別する。ブランチ名はアイコン・アプリ名に含めない。画面内の環境ラベルは従来どおり。

`public/environments/{staging,preview}/` に明暗両方の素材を保持する。`scripts/generate-environment-icons.py`（CairoSVG・Pillowが必要）でSVGから再生成する。Maskableはバッジも含めて安全領域に収めるため70%に縮小する。

デプロイ時に `scripts/environment-icons.mjs` が対象環境の素材をdistの既存パスへコピーし、Manifest・Apple用アプリ名に環境名を付ける。devブランチは既存の判定によりステージングを選択する。本番へ切り替える場合はpublicの本番素材に戻す。参照バージョンは `v=4-production` / `v=4-staging` / `v=4-preview` とし、古いアイコンのキャッシュと区別する。
