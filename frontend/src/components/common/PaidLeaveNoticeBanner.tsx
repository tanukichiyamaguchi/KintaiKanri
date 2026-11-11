import { Link } from 'react-router-dom';
import { Palmtree, ChevronRight } from 'lucide-react';
import type { PaidLeaveNotice } from '../../types';
import { formatYmdJp } from '../../utils/paidLeaveGrant';

/**
 * スタッフ向けの「年5日の有給を取りましょう」のお知らせ。
 * 対象でないとき（notice が null）は何も出さない。スタッフには有給の残日数は見せず、
 * 期限と「あと何日」だけを出す。to を渡すと、押したときにその画面へ移る。
 */
export function PaidLeaveNoticeBanner({ notice, to }: { notice?: PaidLeaveNotice | null; to?: string }) {
  if (!notice || notice.remaining <= 0) return null;
  const body = (
    <>
      <Palmtree aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="t-subhead font-semibold">有給休暇を年{notice.required}日取りましょう</p>
        <p className="t-footnote mt-0.5 text-label-2">
          <span className="tabular">{formatYmdJp(notice.deadline)}</span>までに、あと
          <strong className="tabular font-semibold text-label">{notice.remaining}日</strong>
          取ってください。年に{notice.required}日は有給を取ることが法律で決められています。
        </p>
      </div>
    </>
  );
  if (to) {
    return (
      <Link to={to} className="callout callout-warning mb-4 active:opacity-70" aria-label={`有給休暇を年${notice.required}日取りましょう。${formatYmdJp(notice.deadline)}までに、あと${notice.remaining}日取ってください。`}>
        {body}
        <ChevronRight className="!mt-0.5 text-label-3" aria-hidden="true" />
      </Link>
    );
  }
  return (
    <div className="callout callout-warning mb-4" role="status">
      {body}
    </div>
  );
}
