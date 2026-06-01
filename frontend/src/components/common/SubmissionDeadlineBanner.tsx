import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, ChevronRight } from 'lucide-react';
import type { ClockGate } from '../../types';

/**
 * 月次出勤簿の提出期限アラート / 打刻ブロック通知バナー。
 * - clockBlocked: 赤バナー（4日以降・前月未提出 → 打刻不可）
 * - alertActive:  橙バナー（1〜7日・前月未提出 → 期限リマインド）
 * どちらでもない場合は何も描画しない。
 */
export function SubmissionDeadlineBanner({ gate }: { gate: ClockGate | null }) {
  if (!gate) return null;

  const formatYm = (ym: string): string => {
    const [y, m] = ym.split('-');
    if (!y || !m) return ym;
    return `${y}年${Number(m)}月`;
  };
  const formatDeadline = (d: string): string => {
    const [y, m, day] = d.split('-');
    if (!y || !m || !day) return d;
    return `${y}年${Number(m)}月${Number(day)}日`;
  };

  if (gate.clockBlocked) {
    return (
      <Link
        to="/attendance"
        className="flex items-start gap-3 px-4 py-3.5 rounded-xl mb-4 border bg-red-50 border-red-200 text-red-700 hover:bg-red-100 transition-colors"
      >
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm sm:text-base">
            {formatYm(gate.prevYearMonth)}分の出勤簿が未提出です
          </p>
          <p className="text-xs sm:text-sm mt-0.5 leading-relaxed">
            提出期限（{formatDeadline(gate.deadlineDate)}）を過ぎると勤怠管理に支障が出ます。
            提出が完了するまで<strong>打刻ができません</strong>。出勤簿を提出してください。
          </p>
        </div>
        <ChevronRight className="w-5 h-5 flex-shrink-0 mt-0.5" />
      </Link>
    );
  }

  if (gate.alertActive) {
    return (
      <Link
        to="/attendance"
        className="flex items-start gap-3 px-4 py-3.5 rounded-xl mb-4 border bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100 transition-colors"
      >
        <CalendarClock className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm sm:text-base">
            {formatYm(gate.prevYearMonth)}分 出勤簿の提出期限は {formatDeadline(gate.deadlineDate)} です
          </p>
          <p className="text-xs sm:text-sm mt-0.5 leading-relaxed">
            {gate.blockDay}日以降、前月分が未提出だと打刻ができなくなります。お早めにご提出ください。
          </p>
        </div>
        <ChevronRight className="w-5 h-5 flex-shrink-0 mt-0.5" />
      </Link>
    );
  }

  return null;
}
