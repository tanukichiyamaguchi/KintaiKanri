import { Link } from 'react-router-dom';
import { CalendarClock, CheckCircle, ChevronRight } from 'lucide-react';
import type { ClockGate } from '../../types';

/**
 * 月次出勤簿の提出リマインドバナー（いずれも打刻はブロックしない非ブロック通知）。
 * - alertActive: 橙のお知らせ（1〜7日・前月未提出 → 期限リマインド / 差戻し時は再提出のお願い）
 * - submitted:   青のお知らせ（承認待ち中）
 * いずれにも該当しない場合は何も描画しない。
 *
 * 注: 以前は clockBlocked による赤い「打刻不可」バナーがあったが、
 *     「提出しないと打刻できない」運用を廃止したため撤去した。
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
  // リマインド対象は「前月」なので、出勤簿もその月で開くようにする。
  // これが無いと出勤簿は当月で開き、スタッフが当月を提出→前月は未提出のまま
  // 「提出したのにリマインドが消えない」混乱を招く。
  const attendanceLink = `/attendance?ym=${gate.prevYearMonth}`;

  if (gate.alertActive) {
    const headline = isRejected
      ? `${formatYm(gate.prevYearMonth)}分の出勤簿が差し戻されました`
      : `${formatYm(gate.prevYearMonth)}分 出勤簿の提出期限は ${formatDeadline(gate.deadlineDate)} です`;
    const detail = isRejected
      ? `差戻し内容をご確認のうえ、${formatDeadline(gate.deadlineDate)} までに再提出をお願いいたします。`
      : `${formatDeadline(gate.deadlineDate)} が提出期限です。お早めにご提出いただけますと安心です。`;
    return (
      <Link to={attendanceLink} className="callout callout-warning mb-4 active:opacity-70">
        <CalendarClock aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="t-subhead font-semibold">{headline}</p>
          <p className="t-footnote mt-0.5 text-label-2">{detail}</p>
        </div>
        <ChevronRight className="!mt-0.5 text-label-3" aria-hidden="true" />
      </Link>
    );
  }

  // 提出済み・承認待ちの場合は青のお知らせで状況を可視化（打刻は通常通り可能）
  if (gate.prevStatus === 'submitted') {
    return (
      <Link to={attendanceLink} className="callout callout-info mb-4 active:opacity-70">
        <CheckCircle aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="t-subhead font-semibold">{formatYm(gate.prevYearMonth)}分の出勤簿は承認待ちです</p>
          <p className="t-footnote mt-0.5 text-label-2">管理者の確認をお待ちください。引き続き打刻をご利用いただけます。</p>
        </div>
        <ChevronRight className="!mt-0.5 text-label-3" aria-hidden="true" />
      </Link>
    );
  }

  return null;
}
