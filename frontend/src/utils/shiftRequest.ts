import type { ShiftRequestDay, ShiftRequest } from '../types';

/**
 * 希望シフト申請の提出期限を返す。
 *
 * 仕様:
 *   - シフトは「2ヶ月後の月分」を提出する
 *   - 提出期限は対象月の2ヶ月前の7日まで
 *   - 例: 2026年7月分 → 2026年5月7日まで
 */
export function shiftRequestDeadline(targetYearMonth: string): string {
  const [yStr, mStr] = targetYearMonth.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  if (!y || !m) return '';
  // m - 2 を 1〜12 に正規化
  let dY = y;
  let dM = m - 2;
  while (dM < 1) {
    dM += 12;
    dY -= 1;
  }
  return `${dY}-${String(dM).padStart(2, '0')}-07`;
}

/**
 * 今日 (`today`) を YYYY-MM-DD 文字列で返す（ローカルタイムゾーン）。
 */
export function todayLocalString(today: Date = new Date()): string {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 今日が `targetYearMonth` の希望シフト提出期限以前か（=まだ提出可か）。
 */
export function isShiftRequestOpen(targetYearMonth: string, today: Date = new Date()): boolean {
  const deadline = shiftRequestDeadline(targetYearMonth);
  if (!deadline) return false;
  return todayLocalString(today) <= deadline;
}

/**
 * 「現時点で提出可能な対象月」のリストを返す（先12ヶ月分のうち期限内のもの）。
 */
export function availableTargetYearMonths(today: Date = new Date()): string[] {
  const result: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (isShiftRequestOpen(ym, today)) {
      result.push(ym);
    }
  }
  return result;
}

/**
 * 対象月の全日 (YYYY-MM-DD) を返す。ローカルタイムゾーン基準。
 */
export function daysInTargetMonth(targetYearMonth: string): string[] {
  const [yStr, mStr] = targetYearMonth.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  if (!y || !m) return [];
  const lastDay = new Date(y, m, 0).getDate();
  const result: string[] = [];
  for (let d = 1; d <= lastDay; d++) {
    result.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return result;
}

/**
 * 空の希望日 (kind='none') の配列を生成。
 */
export function makeEmptyShiftRequestDays(targetYearMonth: string): ShiftRequestDay[] {
  return daysInTargetMonth(targetYearMonth).map(date => ({ date, kind: 'none' as const }));
}

/**
 * 過去の提出から day マップを構築（再編集用）。
 */
export function mergeShiftRequestDays(
  base: ShiftRequestDay[],
  existing?: ShiftRequest | null
): ShiftRequestDay[] {
  if (!existing) return base;
  const map = new Map(existing.days.map(d => [d.date, d] as const));
  return base.map(d => map.get(d.date) || d);
}
