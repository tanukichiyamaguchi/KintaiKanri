# GAS 自動デプロイのセットアップ手順

これを一度だけ設定すると、以後は `main` / `claude/attendance-tracking-app-PquFH`
への push で `gas/` 配下が変更されるたびに、GitHub Actions が自動で
Apps Script へ反映＋全ウェブアプリのデプロイを更新します（Web App URL は維持）。

設定後は **「Apps Script エディタに Code.gs を貼り付けて保存して再デプロイ」**
という手作業が完全に不要になります。

> 必要な GitHub Secret は **`CLASPRC_JSON` の 1 個だけ** です。
> デプロイ ID の特定は不要（CI が既存の versioned デプロイを全件自動更新します）。

---

## 一度だけ必要な準備

### clasp の OAuth 資格情報を作る → GitHub Secret に登録

ローカル PC があるなら:

```bash
npm install -g @google/clasp@2.4.2
clasp login
```

ブラウザで **スプレッドシートを所有しているアカウント**で認可すると、
`~/.clasprc.json`（Windows は `%USERPROFILE%\.clasprc.json`）が作成されます。

ローカル環境が無い（クラウド開発等）の場合は、loopback リダイレクト方式の
OAuth フローで取得できます（このリポジトリのアシスタントが代行可能）。
得られる JSON は同じ形式です。

その `~/.clasprc.json` の **中身を全文** コピーし、

GitHub の本リポジトリ → **Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
| --- | --- |
| `CLASPRC_JSON` | `~/.clasprc.json` の中身（JSON 全文） |

⚠️ これは **パスワード相当の機密**です。GitHub Secret 以外に貼らないでください
（コード・Slack 等も NG）。`.gitignore` で `.clasprc.json` の誤コミットは防止済み。
失効させたい場合は <https://myaccount.google.com/permissions> から «clasp» を取り消し。

### 前提: Apps Script API を ON にしておく（1 回）

スプレッドシート所有者でログインした状態で
<https://script.google.com/home/usersettings> を開き、
**「Google Apps Script API」を ON** にする（clasp の push/deploy に必須）。

---

## これで完了

以降は `gas/` 配下を変更して push するだけで:

1. `clasp push` でスクリプトが Apps Script に反映される
   （メニュー関数「出勤簿を再生成」等は即座に最新コードを使用）
2. CI が `clasp deployments` を読み、**@HEAD を除く全 versioned デプロイ**を
   既存 ID のまま再デプロイ（**URL は変わらない**）
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

### Web App URL が変わってしまった
- CI は既存デプロイを `--deploymentId` で in-place 更新するため URL は不変。
  もし手動で `clasp deploy`（ID 指定なし）を実行すると新規 ID＝新 URL が
  発行されるので注意。手動デプロイ時も必ず既存の deploymentId を指定する。

### マニフェスト（appsscript.json）の設定を変えたくない
- このリポジトリにコミットされた `gas/appsscript.json` が **そのまま** Apps
  Script 側を上書きする。現状の設定を残したい場合は、`gas/appsscript.json`
  をローカルで `clasp pull` して取得し、その内容で上書きコミットしてから
  自動デプロイを動かしてください。
