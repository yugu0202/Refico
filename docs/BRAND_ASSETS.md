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

## ダークモード導入時

現時点ではダーク素材を追加するだけで、`index.html`・Web App Manifest・画面の参照先は変更しない。

- 画面内ロゴはアプリで選択されたテーマに合わせて切り替える。手動テーマを導入した場合も、OS設定だけで判断しない。
- faviconはアプリのテーマ方針に合わせて切り替える。OS設定に従う場合は `prefers-color-scheme` の `media` 条件を利用できる。
- ホーム画面用アイコンはブラウザやOSが保存・キャッシュするため、ページのテーマ変更と同時に切り替わる前提にしない。採用する配色はダークモード実装時に決める。
- PNG・ICOを作り直す場合はSVGと同じ形・色を使用し、通常アイコンとMaskableの余白を維持する。
