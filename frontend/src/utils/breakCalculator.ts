/**
 * 法定休憩時間の自動算出（労働基準法 第34条）
 *
 * 法的要件（実労働時間ベース）:
 *   - 実労働 6時間超 8時間以下 → 45分以上
 *   - 実労働 8時間超             → 60分以上
 *
 * 拘束時間（=出勤〜退勤の経過時間）から休憩を自動付与する閾値:
 *   - 拘束 6時間以下      → 0分（実労働も6時間以下、休憩不要）
 *   - 拘束 6時間超〜8h45m → 45分（休憩控除後の実労働が 8h以下に収まり 45分でOK）
 *   - 拘束 8h45m超         → 60分（休憩60分でも実労働 7h45m〜… になり 60分が必要）
 *
 * 例:
 *   - 拘束 9h00m → 60分（実労働 8h00m。45分だと実労働 8h15m となり 60分必要）
 *   - 拘束 7h00m → 45分（実労働 6h15m）
 *   - 拘束 6h00m → 0分（実労働 6h、休憩不要）
 */
export function getLegalBreakMinutes(elapsedMinutes: number): number {
  if (elapsedMinutes > 8 * 60 + 45) return 60;
  if (elapsedMinutes > 6 * 60) return 45;
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
