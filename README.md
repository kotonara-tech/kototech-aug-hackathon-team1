# 奈良よりみち

SHIKA no ASHIATO掲載スポットを活用し、旅行者の予定・空き時間・予算から、出発地点へ戻れる3つの奈良周遊ルートを提案するWebプロトタイプです。

- 公開版: https://nara-yorimichi.abcdefghijklmno1226.chatgpt.site
- Node.js: 22以上（`>=22.13.0`）
- Runtime: vinext / React 19 / TypeScript / Cloudflare Workers

## セットアップ

```bash
git clone https://github.com/kotonara-tech/kototech-aug-hackathon-team1.git
cd kototech-aug-hackathon-team1
nvm use
cp .env.example .env.local
npm install
npm run dev
```

ブラウザでターミナルに表示されたURLを開いてください。通常は `http://localhost:3000` です。3000番ポートが使われている場合は別のポートが自動選択されます。

現状のプロトタイプは外部APIを呼ばないため、環境変数を設定しなくても起動できます。`.env.local` は将来のGoogle Maps API連携に備えるためのものです。

## 環境変数

| 変数 | 必須 | 用途 |
| --- | --- | --- |
| `APP_URL` | 任意 | OGP等で使用する公開URL。未設定時はリクエストから自動判定 |
| `GOOGLE_MAPS_API_KEY` | 現在未使用 | 将来のサーバー側Places / Routes API用 |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | 現在未使用 | 将来のブラウザ側Maps / Street View表示用 |
| `SHIKA_NO_ASHIATO_API_BASE_URL` | 現在未使用 | 奈良市・SYMONSの許可を得た将来の連携先 |
| `SHIKA_NO_ASHIATO_API_KEY` | 現在未使用 | 許可済み連携用の秘密鍵 |

秘密値をGitにコミットしないでください。Google MapsのサーバーキーはAPI制限、ブラウザーキーはAPI制限とHTTPリファラー制限を設定してください。

## コマンド

```bash
npm run dev      # ローカル開発
npm run build    # 本番ビルド確認
npm run lint     # 静的チェック
npm start        # ビルド済みアプリの起動
```

## 主要ファイル

- `app/page.tsx` - 入力フォーム、3ルート、店舗詳細、全件カタログ
- `app/data/ashiato-spots.json` - 公式PDFから抽出した375施設
- `app/globals.css` - レスポンシブUI
- `app/layout.tsx` - メタデータとOGP
- `CLAUDE.md` - Claude向けの詳細な開発引き継ぎ

## データソース

- [奈良市公式一覧ページ](https://www.city.nara.lg.jp/site/shikanoashiato/201908.html)
- [SHIKA no ASHIATO 店舗・施設一覧PDF](https://www.city.nara.lg.jp/uploaded/attachment/204172.pdf)

PDFの1〜11ページから375のユニーク施設を構造化しています。PDFだけでは住所・座標・料金・営業時間・写真が揃わないため、サンプルルートの一部情報はプロトタイプ用の補完値です。

## 注意事項

- 移動時間・一部の価格・座標はプロトタイプ試算です。
- 任意のQRコードでSHIKA no ASHIATOのポイントやクーポンを発行できるとは限りません。
- 本番のクーポン連携には奈良市・株式会社サイモンズによるキャンペーン登録または正式なAPI提供が必要です。
- 詳細な設計方針と次の実装事項は `CLAUDE.md` を参照してください。
