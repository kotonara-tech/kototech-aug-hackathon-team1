---
name: verify
description: 奈良よりみちをローカルで動かし、lint / build / test を正しい順番で走らせて、既知の失敗と新しい失敗を切り分ける。「動かして」「動くか確かめて」「テスト通して」「ビルド確認して」と言われたとき、コミット前、変更が終わったあとに読む。
---

# 動かし方と検証手順

## 0. Windows では npm scripts がそのまま動かない（最重要）

`package.json` の scripts は POSIX の書き方です。

```
"dev":   "WRANGLER_LOG_PATH=.wrangler/wrangler.log vinext dev"
"build": "WRANGLER_LOG_PATH=.wrangler/wrangler.log vinext build"
"start": "WRANGLER_LOG_PATH=.wrangler/wrangler.log vinext start"
"test":  "npm run build && node --test tests/rendered-html.test.mjs"
```

npm は Windows で cmd.exe を使うため、先頭の `VAR=value` を**コマンド名だと解釈して失敗**します。

```
'WRANGLER_LOG_PATH' is not recognized as an internal or external command,
```

`dev` / `build` / `start` / `test` の4つ全部がこれに当たります（`lint` だけは無事）。
PowerShell から環境変数を先に立てて直接叩いてください。

```powershell
$env:Path += ';C:\Program Files\nodejs'
$env:WRANGLER_LOG_PATH = '.wrangler/wrangler.log'
npx vinext dev      # 開発サーバー
npx vinext build    # ビルド
```

**恒久対応は未了です。** `cross-env` を devDependency に足すか、`.npmrc` に `script-shell` を
指定するのが定石ですが、チーム共有の `package.json` を変える判断はユーザーに確認してください。

## 1. 環境

- Node.js **24.19.0** / npm **11.17.0**（2026-08-22 に winget で導入。`engines: >=22.13.0` を満たす）
- PowerShell はセッション間で環境変数を保持しないため、**毎回 `$env:Path += ';C:\Program Files\nodejs'` が必要**
- `npm install` 済み。ただし npm 11 が `esbuild` / `sharp` / `workerd` の postinstall をブロックしている
  （`npm warn allow-scripts`）。今のところ dev サーバーは正常に動いているので放置しているが、
  ネイティブバイナリ絡みで落ちたらここを疑う

## 2. 開発サーバー

```powershell
$env:Path += ';C:\Program Files\nodejs'; $env:WRANGLER_LOG_PATH = '.wrangler/wrangler.log'; npx vinext dev
```

`http://localhost:3000/` で起動します（3000が塞がっていれば別ポート）。
2026-08-22 時点で 200 / `<title>奈良よりみち｜空き時間からつくる奈良旅</title>` を返すことを確認済み。

## 3. 検証コマンドの順番

軽い順に回します。

```powershell
npm run lint                                  # そのまま動く
npx vinext build                              # 上の環境変数を立ててから
node --test tests/<対象>.test.ts              # ユニットテスト
```

## 4. 既知の失敗（自分が壊したものと混同しない）

### lint — 3件（2026-08-22 実測。すべて `app/page.tsx`）

| 行 | ルール | 内容 |
| --- | --- | --- |
| 270:11 | `jsx-a11y/no-noninteractive-element-interactions` | 施設モーダルの `<section>` に `onMouseDown` |
| 280:11 | `jsx-a11y/no-noninteractive-element-interactions` | カタログの `<aside>` に `onMouseDown` |
| 282:81 | `jsx-a11y/no-autofocus` | カタログ検索欄の `autoFocus` |

3件ともモーダル周りです。**ルールを無効化して消さないでください。** 背景クリックで閉じる処理を
backdrop 側に寄せ、フォーカスは `useEffect` で明示的に当てるのが本筋の直し方です。

### build — サンドボックスで失敗する

`npx vinext build` は最初に `dist` を丸ごと削除しますが、この環境ではサンドボックスが
プロジェクト配下のディレクトリ削除をブロックします（`rmdir` が成功を返すのに残る）。

```
Error: EPERM, Permission denied: '\?\D:\...\dist' at rmSync (cleanBuildOutput)
```

ビルド自体は通っており（`✓ built in 1.38s` まで進む）、**コードの問題ではありません**。
ビルドを完走させたい場合はサンドボックス外で実行する必要があります。
「ビルドが落ちた」と報告する前に、原因がこれでないかを必ず確かめてください。

### test — スターターの残骸

`tests/rendered-html.test.mjs` はテンプレート由来で、`app/_sites-preview/SkeletonPreview.tsx`、
`react-loading-skeleton`、`<title>Your site is taking shape</title>`、`title: "Starter Project"`
を検証しています。奈良よりみちに置き換わった今、**通る見込みはありません**。
修正対象ではなく削除／置換対象です。削除前にユーザーへ確認してください。
（このファイルは `npm test` の中で `npm run build` の後に走るため、Windows では
そもそも到達しません。）

## 5. 報告の仕方

- 通ったものは通ったと、落ちたものは落ちたと書く
- **既存の失敗と、自分の変更で増えた失敗を必ず分けて書く**
- 実行しなかったものは「未実行」と書く。推測で「通るはず」と書かない
- 環境要因（Windows の npm scripts、サンドボックスの EPERM）とコードの欠陥を混ぜない
