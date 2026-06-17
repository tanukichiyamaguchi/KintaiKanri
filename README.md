# KATEstageLASH 勤怠管理システム

眉毛まつげサロン「KATEstageLASH」のスタッフ向けシンプル勤怠管理アプリケーションです。

> **デプロイについて**
> - フロントエンドは `main` / `claude/attendance-tracking-app-PquFH` への push で
>   GitHub Pages に自動デプロイされます。
> - GAS（バックエンド）も `gas/` 配下の変更で自動デプロイされます。
>   初回は **[docs/GAS_DEPLOYMENT.md](docs/GAS_DEPLOYMENT.md)** に従い、
>   GitHub Secrets `CLASPRC_JSON` と `GAS_DEPLOYMENT_ID` を 1 度だけ設定してください。

## 機能

### スタッフ用機能
- 4桁PINコードによるログイン
- 出勤/退勤/休憩の打刻（GPS位置情報付き）
- 早上がり（会社都合）/早退（自己都合）の区別
- 勤怠履歴の確認
- 有給休暇の残日数確認・申請
- 給与明細のPDFダウンロード

### 管理者用機能
- 本日の出勤状況ダッシュボード
- スタッフの追加/編集/削除
- 勤怠データの確認・修正
- 有給休暇申請の承認/却下
- 給与計算の実行
- 所得税・住民税の手動入力
- 社会保険料率の設定
- 給与明細PDFの一括出力

## 技術スタック

### フロントエンド
- React 18 + TypeScript
- Vite (ビルドツール)
- Tailwind CSS (スタイリング)
- React Router (ルーティング)
- Lucide React (アイコン)
- date-fns (日付操作)
- jsPDF (PDF生成)

### バックエンド
- Google Apps Script (GAS)
- Google Spreadsheet (データベース)

## セットアップ

### フロントエンド

1. 依存関係のインストール
```bash
cd frontend
npm install
```

2. 環境変数の設定
```bash
cp .env.example .env
# .envファイルを編集してVITE_API_BASE_URLを設定
```

3. 開発サーバーの起動
```bash
npm run dev
```

4. ビルド
```bash
npm run build
```

### バックエンド（Google Apps Script）

1. Googleスプレッドシートを新規作成

2. 拡張機能 → Apps Scriptを開く

3. `gas/`フォルダ内のファイルをApps Scriptエディタにコピー
   - `Code.gs` - メインAPI
   - `PdfGenerator.gs` - PDF生成

4. `Code.gs`の`SPREADSHEET_ID`定数にスプレッドシートIDを設定
```javascript
const SPREADSHEET_ID = 'your-spreadsheet-id-here';
```

5. デプロイ → 新しいデプロイ
   - 種類: ウェブアプリ
   - 次のユーザーとして実行: 自分
   - アクセスできるユーザー: 全員

6. デプロイURLをフロントエンドの`.env`ファイルに設定

## データ構造

スプレッドシートには以下のシートが自動生成されます：

- `staff_master` - スタッフマスタ
- `attendance_YYYYMM` - 月別勤怠データ
- `salary_YYYYMM` - 月別給与計算結果
- `paid_leave` - 有給休暇管理
- `insurance_rates` - 社会保険料率設定
- `tax_manual_YYYYMM` - 税金手動入力
- `incentive_YYYYMM` - インセンティブ

## 給与計算ルール

### 基本条件
- 雇用形態: 月給制
- 所定労働時間: 1日8時間
- 週所定労働時間: 44時間（美容業特例措置対象事業場）

### 手当計算
- 残業手当: 週44時間超過分 × 125%
- 深夜手当: 22:00〜5:00の労働 × 25%
- 休日出勤手当: 法定休日 × 135%

### 控除計算
- 遅刻控除: 1分単位で控除
- 早退控除: 自己都合の早退のみ1分単位で控除
- 早上がり: 会社都合のため控除なし

## デモモード

`VITE_API_BASE_URL`が設定されていない場合、アプリケーションはデモモードで動作します。
デモモードでは以下のモックデータが使用されます：

- スタッフ3名（佐藤花子、田中太郎、山田次郎）
- 4桁の任意のPINコードでログイン可能

## ライセンス

MIT
