import { getLegalBreakMinutes } from './breakCalculator';

/**
 * 出勤時刻から終了時刻（退勤、または勤務中なら現在時刻）までの実働（分）。
 * 実働 = 経過時間 − 休憩。休憩は、退勤時にサーバーが自動で入れるのと同じ法定ルール
 * （getLegalBreakMinutes: 6 時間超 → 45 分 / 8 時間 45 分超 → 60 分）で差し引く。
 */
export function computeWorkedMinutes(clockIn: Date | null, end: Date | null): number {
  if (!clockIn || !end) return 0;
  const elapsed = Math.floor((end.getTime() - clockIn.getTime()) / 60000);
  if (elapsed <= 0) return 0;
  return Math.max(0, elapsed - getLegalBreakMinutes(elapsed));
}

/** 分を「時:分」（例: 8:05）で表す。 */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
