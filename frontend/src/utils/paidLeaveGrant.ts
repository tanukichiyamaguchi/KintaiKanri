import type { PaidLeaveNextGrant } from '../types';

/**
 * 法定どおりの有給の付与（サーバー gas/Code.gs と同じ決まり）。
 * 本番ではサーバーが付与・時効を処理するため、ここはデモモードの計算と、日付の表示に使う。
 *
 *  - 入社日から 6 ヶ月で 10 日、以降 1 年ごとに 11・12・14・16・18・20 日（以降は毎年 20 日）
 *  - 付与日 = 入社日の 6 ヶ月後（以降 1 年ごと）の同じ日。その月に同じ日が無いときは翌月 1 日
 *  - 付与から 2 年で、使わなかった分が消える（有効期限 = 2 年後の同じ日の前日）
 */
export const STATUTORY_PAID_LEAVE_DAYS = [10, 11, 12, 14, 16, 18, 20];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 'YYYY-MM-DD' の months ヶ月後の同じ日。その月に同じ日が無いときは翌月 1 日。 */
export function addMonthsLegal(ymd: string, months: number): string {
  const [py, pm, pd] = ymd.split('-').map(Number);
  const idx = py * 12 + (pm - 1) + months;
  const y = Math.floor(idx / 12);
  const m = idx - y * 12 + 1;
  if (pd <= daysInMonth(y, m)) return `${y}-${pad2(m)}-${pad2(pd)}`;
  const idx2 = idx + 1;
  const y2 = Math.floor(idx2 / 12);
  return `${y2}-${pad2(idx2 - y2 * 12 + 1)}-01`;
}

export function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** n 回目（1 = 入社 6 ヶ月）の付与日数。 */
export function paidLeaveGrantDays(grantNo: number): number {
  const i = Math.min(Math.max(grantNo, 1), STATUTORY_PAID_LEAVE_DAYS.length) - 1;
  return STATUTORY_PAID_LEAVE_DAYS[i];
}

/** n 回目の付与時点の勤続期間（例: 6ヶ月、1年6ヶ月）。 */
export function paidLeaveServiceLabel(grantNo: number): string {
  return grantNo <= 1 ? '6ヶ月' : `${grantNo - 1}年6ヶ月`;
}

/** n 回目の付与日。 */
export function paidLeaveGrantDate(hireYmd: string, grantNo: number): string {
  return addMonthsLegal(hireYmd, 6 + 12 * (grantNo - 1));
}

/** 有効期限（この日まで使える）。 */
export function paidLeaveExpiresOn(grantYmd: string): string {
  return addDaysYmd(addMonthsLegal(grantYmd, 24), -1);
}

/** from から to まで何日あるか（to が前なら負の数）。 */
export function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const [fy, fm, fd] = fromYmd.split('-').map(Number);
  const [ty, tm, td] = toYmd.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

/** 正しい 'YYYY-MM-DD' か。 */
export function isYmd(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

/** まだ来ていない最初の付与（入社日が無い・不正なら null）。 */
export function nextPaidLeaveGrant(hireYmd: string, todayYmd: string): PaidLeaveNextGrant | null {
  if (!isYmd(hireYmd)) return null;
  for (let n = 1; n <= 100; n++) {
    const date = paidLeaveGrantDate(hireYmd, n);
    if (date > todayYmd) return { date, days: paidLeaveGrantDays(n), serviceLength: paidLeaveServiceLabel(n) };
  }
  return null;
}

/** 'YYYY-MM-DD' → '2027年7月14日'（読めない値はそのまま） */
export function formatYmdJp(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '');
  if (!m) return ymd || '';
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`;
}

/** 'YYYY-MM-DD' → '2027/7/14'（読めない値はそのまま） */
export function formatYmdSlash(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '');
  if (!m) return ymd || '';
  return `${Number(m[1])}/${Number(m[2])}/${Number(m[3])}`;
}
