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

  const isRejected = gate.prevStatus === 'rejected';
  const headline = isRejected
    ? `${formatYm(gate.prevYearMonth)}分の出勤簿が差し戻されました`
    : `${formatYm(gate.prevYearMonth)}分の出勤簿のご提出をお願いします`;
  const blockedDetail = isRejected
    ? <>差戻し内容をご確認のうえ、再提出をお願いいたします。再提出いただきますと、引き続き打刻をご利用いただけます。</>
    : <>お手数ですが、{formatDeadline(gate.deadlineDate)} までに出勤簿をご提出ください。ご提出いただきますと、引き続き打刻をご利用いただけます。</>;
  const alertDetail = isRejected
    ? `差戻し内容をご確認のうえ、${formatDeadline(gate.deadlineDate)} までに再提出をお願いいたします。`
    : `${formatDeadline(gate.deadlineDate)} が提出期限です。お早めにご提出いただけますと安心です。`;

  if (gate.clockBlocked) {
    return (
      <Link
        to="/attendance"
        className="flex items-start gap-3 px-4 py-3.5 rounded-xl mb-4 border bg-red-50 border-red-200 text-red-700 hover:bg-red-100 transition-colors"
      >
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm sm:text-base">{headline}</p>
          <p className="text-xs sm:text-sm mt-0.5 leading-relaxed">{blockedDetail}</p>
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
            {isRejected ? headline : `${formatYm(gate.prevYearMonth)}分 出勤簿の提出期限は ${formatDeadline(gate.deadlineDate)} です`}
          </p>
          <p className="text-xs sm:text-sm mt-0.5 leading-relaxed">{alertDetail}</p>
        </div>
        <ChevronRight className="w-5 h-5 flex-shrink-0 mt-0.5" />
      </Link>
    );
  }

  return null;
}
