# GAS 自動デプロイのセットアップ手順

これを一度だけ設定すると、以後は `main` / `claude/attendance-tracking-app-PquFH`
への push で `gas/` 配下が変更されるたびに、GitHub Actions が自動で
Apps Script へ反映＋ウェブアプリのデプロイを更新します（Web App URL は維持）。

設定後は **「Apps Script エディタに Code.gs を貼り付けて保存して再デプロイ」**
という手作業が完全に不要になります。

---

## 一度だけ必要な準備（3 ステップ）

### Step 1. clasp の OAuth 資格情報を作る（ローカル PC で 1 回）

ローカルの PC（macOS / Windows / Linux いずれか）で:

```bash
npm install -g @google/clasp@2.4.2
clasp login
```

ブラウザが開いて Google アカウントの認可を求めます。**スプレッドシートを
所有しているアカウント**（普段 Apps Script を編集しているアカウント）で
ログインしてください。

完了すると `~/.clasprc.json`（Windows は `%USERPROFILE%\.clasprc.json`）が
作成されます。中身は OAuth トークンです。

### Step 2. その資格情報を GitHub Secret に登録する

`~/.clasprc.json` の **中身を全文** コピーして、

GitHub の本リポジトリ → **Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
| --- | --- |
| `CLASPRC_JSON` | `~/.clasprc.json` の中身（JSON 全文） |

⚠️ このファイルにはアクセストークンが含まれます。**絶対に Git にコミットしないでください**（`.gitignore` 推奨）。

### Step 3. 既存のウェブアプリのデプロイ ID を Secret に登録する（URL を変えないため）

1. スプレッドシート → 拡張機能 → Apps Script
2. 右上「デプロイ」→「デプロイを管理」
3. 既存の「ウェブアプリ」デプロイの **デプロイ ID** をコピー
   （`AKfycbx...` で始まる長い文字列）

GitHub の Secrets に登録:

| Name | Value |
| --- | --- |
| `GAS_DEPLOYMENT_ID` | コピーしたデプロイ ID |

> もし既存のデプロイがまだ無い場合は、Apps Script の「デプロイ → 新しいデプロイ
> → ウェブアプリ」で:
> - **次のユーザーとして実行**: 自分
> - **アクセスできるユーザー**: 全員
>
> を選んで一度デプロイし、その後に出るデプロイ ID を Secret に入れてください。
> その時点で発行されたウェブアプリ URL を、フロント側の Repository Variables
> `VITE_API_BASE_URL` にも設定します。

---

## これで完了

以降は `gas/` 配下を変更して push するだけで:

1. `clasp push` でスクリプトが Apps Script に反映される
   （メニュー関数「出勤簿を再生成」等は即座に最新コードを使用）
2. `clasp deploy --deploymentId $GAS_DEPLOYMENT_ID` でウェブアプリの
   デプロイが既存 ID を使って更新される（**URL は変わらない**）
3. フロント側からの POST（打刻 等）は次回呼び出しから最新コードで動作する

---

## 動作確認

push 後、GitHub Actions の `Deploy GAS (Apps Script)` ワークフローが緑になれば
反映完了です。スプレッドシートのメニュー「勤怠管理 → コードのバージョンを確認」
を実行して、`CODE_VERSION`（`gas/Code.gs` の上部で定義）が最新になっていれば成功。

---

## トラブルシュート

### `clasp status` で失敗する
- `CLASPRC_JSON` の値が古い / 切れた → ローカルで再度 `clasp login` し、
  `~/.clasprc.json` の中身で `CLASPRC_JSON` Secret を更新。
- そもそも `.clasp.json` の `scriptId` が違う → Apps Script URL の
  `/d/<scriptId>/edit` の部分が `scriptId`。

### `clasp deploy` で「Deployment not found」
- `GAS_DEPLOYMENT_ID` が無効。Apps Script の「デプロイを管理」から
  正しい ID をコピーし直して Secret を更新。

### Web App URL が変わってしまった
- `GAS_DEPLOYMENT_ID` を指定せずにデプロイすると新規 ID が発行されて URL が
  変わる。Secret に必ず既存 ID を入れてから次回 push する。

### マニフェスト（appsscript.json）の設定を変えたくない
- このリポジトリにコミットされた `gas/appsscript.json` が **そのまま** Apps
  Script 側を上書きする。現状の設定を残したい場合は、`gas/appsscript.json`
  をローカルで `clasp pull` して取得し、その内容で上書きコミットしてから
  自動デプロイを動かしてください。
