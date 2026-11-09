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
      <div className="bg-danger-fill px-4 pb-2.5 pt-[calc(10px+var(--safe-top))]" role="alert">
        <div className="mx-auto flex max-w-5xl items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-danger" aria-hidden="true" />
          <div className="t-subhead">
            <p className="font-semibold text-danger">設定エラー: サーバー接続先が未設定です</p>
            <p className="t-footnote mt-0.5 text-label">
              打刻・申請等のデータ保存ができません。管理者に「VITE_API_BASE_URL の設定」をお伝えください。
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (IS_DEMO_MODE) {
    return (
      <div className="bg-warning-fill px-4 pb-2 pt-[calc(8px+var(--safe-top))]">
        <div className="mx-auto flex max-w-5xl items-center gap-2 t-footnote text-label">
          <Info className="h-4 w-4 flex-shrink-0 text-warning" aria-hidden="true" />
          <span>
            <span className="font-semibold">デモモード:</span> 入力したデータは保存されません（ページを閉じると消えます）。
          </span>
        </div>
      </div>
    );
  }

  return null;
}
