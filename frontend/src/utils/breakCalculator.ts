/**
 * 法定休憩時間の自動算出（労働基準法 第34条）
 *
 * 実労働時間が以下を超える場合、最低限の休憩が必要:
 *   - 6時間超 8時間以下: 45分以上
 *   - 8時間超: 60分以上
 *
 * このアプリでは「拘束時間（出勤〜退勤の経過時間）」をもとに自動付与する。
 * 拘束時間 6h45m 超なら 45分、9h 超なら 60分とすることで、
 * 自動付与した休憩を引いた実労働時間が法定要件を満たすようにする。
 */
export function getLegalBreakMinutes(elapsedMinutes: number): number {
  if (elapsedMinutes > 9 * 60) return 60;
  if (elapsedMinutes > 6 * 60 + 45) return 45;
  return 0;
}

/**
 * "HH:MM" 形式の出退勤時刻から拘束時間（分）を算出。
 */
export function calcElapsedMinutes(clockIn: string, clockOut: string): number {
  if (!clockIn || !clockOut) return 0;
  const [inH, inM] = clockIn.split(':').map(Number);
  const [outH, outM] = clockOut.split(':').map(Number);
  if (
    Number.isNaN(inH) || Number.isNaN(inM) ||
    Number.isNaN(outH) || Number.isNaN(outM)
  ) {
    return 0;
  }
  return outH * 60 + outM - (inH * 60 + inM);
}

/** 1日の所定労働時間（基本）。これを超えた分が残業。 */
export const DAILY_STANDARD_MINUTES = 8 * 60;

/**
 * 出退勤+休憩から実労働・残業を計算。
 */
export function computeWorkAndOvertime(
  clockIn: string,
  clockOut: string,
  breakMinutes: number
): { workMinutes: number; overtimeMinutes: number } {
  const elapsed = calcElapsedMinutes(clockIn, clockOut);
  if (elapsed <= 0) return { workMinutes: 0, overtimeMinutes: 0 };
  const work = Math.max(0, elapsed - breakMinutes);
  const overtime = Math.max(0, work - DAILY_STANDARD_MINUTES);
  return { workMinutes: work, overtimeMinutes: overtime };
}
