import type { PaidLeaveRequest } from '../types';

/**
 * 対象月（YYYY-MM）の有給の状況。希望休の画面で「あと何日選べるか」を計算するために使う。
 * サーバー（gas/Code.gs の planPaidLeaveSync_）と同じ決まり:
 *   - 残日数（balance）は承認済みの分を差し引き済み
 *   - この月に承認待ちにできる日数の上限 = 残日数 − ほかの月の承認待ち
 *     （ただし機能追加前から上限を超えていた分は、減らす・そのままにすることはできる）
 */
export interface PaidLeaveMonthState {
  balance: number;
  pendingAll: number;
  pendingOtherMonths: number;
  /** この月の承認待ちの日（選択を外せば取り下げ） */
  pendingDates: string[];
  /** この月の承認済みの日（この画面からは変更できない） */
  approvedDates: string[];
  /** この月の却下された日（承認待ち・承認済みが無い日のみ。選び直せば再申請） */
  rejected: Map<string, PaidLeaveRequest>;
  /** この月に承認待ちにできる日数の上限 */
  limitForMonth: number;
}

export function paidLeaveMonthState(balance: number, history: PaidLeaveRequest[], yearMonth: string): PaidLeaveMonthState {
  const prefix = `${yearMonth}-`;
  const inMonth = (r: PaidLeaveRequest) => String(r.leaveDate || '').startsWith(prefix);
  const pending = history.filter(r => r.status === 'pending');
  const pendingDates = [...new Set(pending.filter(inMonth).map(r => r.leaveDate.slice(0, 10)))].sort();
  const approvedDates = [...new Set(history.filter(r => r.status === 'approved' && inMonth(r)).map(r => r.leaveDate.slice(0, 10)))].sort();
  const active = new Set([...pendingDates, ...approvedDates]);
  const rejected = new Map<string, PaidLeaveRequest>();
  history
    .filter(r => r.status === 'rejected' && inMonth(r))
    .forEach(r => {
      const date = r.leaveDate.slice(0, 10);
      if (!active.has(date)) rejected.set(date, r);
    });
  const pendingOtherMonths = pending.filter(r => !inMonth(r)).length;
  const pendingInMonthNow = pending.filter(inMonth).length;
  return {
    balance,
    pendingAll: pending.length,
    pendingOtherMonths,
    pendingDates,
    approvedDates,
    rejected,
    limitForMonth: Math.max(balance - pendingOtherMonths, pendingInMonthNow, 0),
  };
}
