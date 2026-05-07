import type { Shift, ShiftDiff, ShiftDiffKind } from '../types';
import { calcElapsedMinutes } from './breakCalculator';

/**
 * "HH:MM" を分に変換。失敗時は null。
 */
function toMinutes(time?: string): number | null {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * シフトと実績の差異を検出。
 * - シフトが (仮) または存在しない場合は差異検出しない（hasIssue: false）
 * - 1分でも残業があれば overtime 申請対象
 * - 各種別を独立に判定（同日複数種別あり得る）
 */
export function detectShiftDiff(
  date: string,
  shift: Shift | undefined,
  actualClockIn: string,
  actualClockOut: string,
  actualBreakMinutes: number,
  plannedBreakMinutes?: number
): ShiftDiff {
  const kinds: ShiftDiffKind[] = [];
  const details: ShiftDiff['details'] = {
    actualStart: actualClockIn || undefined,
    actualEnd: actualClockOut || undefined,
    actualBreak: actualBreakMinutes,
  };

  const hasActual = !!(actualClockIn && actualClockOut);

  // (仮) または未登録は差異なし扱い
  if (!shift || shift.isTentative) {
    return { date, kinds, details, hasIssue: false };
  }

  // シフト休なのに打刻あり → extra_work
  if (shift.isOff && hasActual) {
    kinds.push('extra_work');
    return { date, kinds, details, hasIssue: true };
  }

  // シフトありなのに打刻なし → absence
  if (!shift.isOff && !hasActual) {
    kinds.push('absence');
    details.plannedStart = shift.startTime;
    details.plannedEnd = shift.endTime;
    return { date, kinds, details, hasIssue: true };
  }

  // シフト休 & 打刻なし → 完全に一致
  if (shift.isOff && !hasActual) {
    return { date, kinds, details, hasIssue: false };
  }

  // ここから先は「シフト勤務日 & 打刻あり」のケース
  details.plannedStart = shift.startTime;
  details.plannedEnd = shift.endTime;
  details.plannedBreak = plannedBreakMinutes;

  const plannedStartMin = toMinutes(shift.startTime);
  const plannedEndMin = toMinutes(shift.endTime);
  const actualStartMin = toMinutes(actualClockIn);
  const actualEndMin = toMinutes(actualClockOut);

  if (plannedStartMin != null && actualStartMin != null) {
    if (actualStartMin > plannedStartMin) {
      kinds.push('late_arrival');
    } else if (actualStartMin < plannedStartMin) {
      // 予定より早い出勤 → shift_change として扱う
      kinds.push('shift_change');
    }
  }

  if (plannedEndMin != null && actualEndMin != null) {
    const overtimeMin = actualEndMin - plannedEndMin;
    if (overtimeMin >= 1) {
      kinds.push('overtime');
      details.overtimeMinutes = overtimeMin;
    } else if (overtimeMin <= -1) {
      kinds.push('early_leave');
    }
  }

  // 休憩相違: 予定と実績の差異が大きい場合
  if (
    plannedBreakMinutes !== undefined &&
    Math.abs(actualBreakMinutes - plannedBreakMinutes) >= 1
  ) {
    // 予定休憩より少なく取った場合のみ申請対象（多く取った場合は対象外）
    if (actualBreakMinutes < plannedBreakMinutes) {
      kinds.push('break_deviation');
    }
  }

  // 出退勤両方が異なる場合は shift_change を冗長に追加しない
  // （late_arrival / overtime / early_leave で個別カバー）

  return {
    date,
    kinds,
    details,
    hasIssue: kinds.length > 0,
  };
}

/**
 * シフトのスケジュール拘束時間（分）。休または未定義の場合は 0。
 */
export function shiftPlannedMinutes(shift?: Shift): number {
  if (!shift || shift.isOff) return 0;
  const startMin = toMinutes(shift.startTime);
  const endMin = toMinutes(shift.endTime);
  if (startMin == null || endMin == null) return 0;
  return Math.max(0, endMin - startMin);
}

/**
 * 出退勤からシフト準拠の予定休憩を推定（法定基準）。
 */
export function estimatedPlannedBreak(shift?: Shift): number | undefined {
  if (!shift || shift.isOff) return undefined;
  const elapsed = calcElapsedMinutes(shift.startTime || '', shift.endTime || '');
  if (elapsed <= 0) return undefined;
  if (elapsed > 9 * 60) return 60;
  if (elapsed > 6 * 60 + 45) return 45;
  return 0;
}

/**
 * 申請種別の日本語ラベル。
 */
export const APPLICATION_TYPE_LABEL: Record<ShiftDiffKind, string> = {
  late_arrival: '遅刻',
  early_leave: '早退',
  overtime: '残業',
  absence: '欠勤',
  extra_work: 'シフト外勤務',
  shift_change: '時刻変更',
  break_deviation: '休憩相違',
};
