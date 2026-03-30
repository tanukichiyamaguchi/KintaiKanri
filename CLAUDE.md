# KintaiKanri - 勤怠管理アプリ

## プロジェクト概要
美容業界向け勤怠管理Webアプリ。スタッフの出退勤打刻、給与計算、有給管理、社会保険料計算を行う。

## 技術スタック
- **フロントエンド**: React 19 + TypeScript 5.9 + Vite 7 + Tailwind CSS 4
- **バックエンド**: Google Apps Script (GAS) + Google Spreadsheet
- **デプロイ**: GitHub Pages（自動デプロイ）

## ディレクトリ構成
```
frontend/src/
  api/index.ts          - API関数 + デモモード（モックデータ）
  types/index.ts        - 全TypeScript型定義
  contexts/AuthContext.tsx - 認証状態管理
  pages/staff/          - スタッフ向けページ（打刻、マイページ）
  pages/admin/          - 管理者向けページ（ダッシュボード、給与、有給等）
  components/common/    - 共通UIコンポーネント
  utils/calculations.ts - 給与・控除計算ロジック
gas/
  Code.gs               - GAS APIエンドポイント
  PdfGenerator.gs       - 給与明細PDF生成
```

## 開発コマンド
```bash
cd frontend && npm run dev      # 開発サーバー起動
cd frontend && npm run build    # TypeScriptチェック + ビルド
cd frontend && npm run lint     # ESLint実行
```

## 重要なビジネスルール
- 週44時間制（美容業特例措置）：WEEKLY_HOURS = 44
- 残業割増率: 125%（法定時間外）
- 深夜割増率: 25%（22:00-05:00）
- 休日割増率: 135%（法定休日）
- 社会保険: 標準報酬月額ベースで健康保険・厚生年金・雇用保険・介護保険を計算
- 介護保険: 40歳以上65歳未満が対象
- デモモード: VITE_API_BASE_URL未設定時に有効

## 注意事項
- テストはまだ未導入（vitest推奨）
- 認証はPINコード方式（スタッフ: 4桁PIN、管理者: 別PIN）
- 日付処理はUTCではなくローカルタイムゾーンを使用する
