import { AlertTriangle, Info } from 'lucide-react';
import { IS_DEMO_MODE, MISCONFIGURED_NO_API_BASE_URL } from '../../api';

/**
 * 環境バナー。アプリ全体の打刻関連画面の上部に常時表示し、
 * 「いま自分が見ている画面が本番か / デモか / 設定ミスか」をユーザーに即座に知らせる。
 *
 * 表示しないケース: 本番モード（VITE_API_BASE_URL 設定済み・VITE_DEMO_MODE !== 'true'）。
 *
 * このバナーが導入された経緯:
 *   旧 api/index.ts は VITE_API_BASE_URL が空でも自動でデモモードに落ちる実装で、
 *   GitHub Pages デプロイ時に Repository Variables の設定忘れがあると本番のつもりが
 *   デモモードで動き、打刻はメモリ上の mock にのみ記録 → リロードで消失 →
 *   「打刻できない」と見える事故が起きていた。コード側では明示エラーに切り替えたうえで、
 *   ユーザーにも見えるバナーで二重に防止する。
 */
export function EnvironmentBanner() {
  if (MISCONFIGURED_NO_API_BASE_URL) {
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 py-2.5">
        <div className="max-w-5xl mx-auto flex items-start gap-2.5 text-red-800">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">設定エラー: サーバー接続先が未設定です</p>
            <p className="text-xs mt-0.5">
              打刻・申請等のデータ保存ができません。管理者に「VITE_API_BASE_URL の設定」をお伝えください。
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (IS_DEMO_MODE) {
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-amber-800">
        <div className="max-w-5xl mx-auto flex items-center gap-2 text-sm">
          <Info className="w-4 h-4 flex-shrink-0" />
          <span>
            <span className="font-semibold">デモモード:</span> 入力したデータは保存されません（ページを閉じると消えます）。
          </span>
        </div>
      </div>
    );
  }

  return null;
}
