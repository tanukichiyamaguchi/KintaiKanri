import type { AttendanceRecord, InsuranceRates, StandardRemuneration, WorkSummary } from '../types';

// Constants
export const WEEKLY_HOURS = 44; // Beauty industry special measure
export const MONTHLY_WORKING_HOURS = (WEEKLY_HOURS * 52) / 12; // ~190.67 hours

/**
 * Calculate hourly rate from monthly salary
 */
export function calculateHourlyRate(monthlySalary: number): number {
  return monthlySalary / MONTHLY_WORKING_HOURS;
}

/**
 * Calculate minute rate from monthly salary
 */
export function calculateMinuteRate(monthlySalary: number): number {
  return calculateHourlyRate(monthlySalary) / 60;
}

/**
 * Calculate overtime pay (25% premium for hours over 44/week)
 */
export function calculateOvertimePay(overtimeHours: number, hourlyRate: number): number {
  return Math.floor(overtimeHours * hourlyRate * 1.25);
}

/**
 * Calculate night pay (22:00-05:00, 25% premium)
 */
export function calculateNightPay(nightHours: number, hourlyRate: number): number {
  return Math.floor(nightHours * hourlyRate * 0.25);
}

/**
 * Calculate overtime night pay (overtime + night, 50% premium)
 */
export function calculateOvertimeNightPay(hours: number, hourlyRate: number): number {
  return Math.floor(hours * hourlyRate * 0.50);
}

/**
 * Calculate holiday pay (legal holiday, 35% premium)
 */
export function calculateHolidayPay(holidayHours: number, hourlyRate: number): number {
  return Math.floor(holidayHours * hourlyRate * 1.35);
}

/**
 * Calculate holiday night pay (holiday + night, 60% premium)
 */
export function calculateHolidayNightPay(hours: number, hourlyRate: number): number {
  return Math.floor(hours * hourlyRate * 0.60);
}

/**
 * Calculate late deduction (per minute)
 */
export function calculateLateDeduction(lateMinutes: number, minuteRate: number): number {
  return Math.floor(lateMinutes * minuteRate);
}

/**
 * Calculate early leave deduction (self-initiated only, per minute)
 */
export function calculateEarlyLeaveDeduction(earlyLeaveMinutes: number, minuteRate: number): number {
  return Math.floor(earlyLeaveMinutes * minuteRate);
}

/**
 * Check if person is nursing insurance target (40-65 years old)
 */
export function isNursingInsuranceTarget(birthDate: string): boolean {
  const birth = new Date(birthDate);
  const today = new Date();
  const age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  const adjustedAge = monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())
    ? age - 1
    : age;
  return adjustedAge >= 40 && adjustedAge < 65;
}

/**
 * Get standard remuneration from table based on total remuneration
 */
export function getStandardRemuneration(
  totalRemuneration: number,
  table: StandardRemuneration[]
): number {
  for (const row of table) {
    if (totalRemuneration >= row.monthlyMin && totalRemuneration < row.monthlyMax) {
      return row.standardMonthly;
    }
  }
  // Return highest grade if above table
  return table[table.length - 1]?.standardMonthly || totalRemuneration;
}

/**
 * Calculate social insurance premiums
 */
export function calculateInsurance(
  standardRemuneration: number,
  grossPay: number,
  rates: InsuranceRates,
  isNursingTarget: boolean
): {
  healthInsurance: number;
  nursingInsurance: number;
  pension: number;
  employmentInsurance: number;
} {
  const healthInsurance = Math.floor(standardRemuneration * rates.healthInsuranceRate / 100);
  const nursingInsurance = isNursingTarget
    ? Math.floor(standardRemuneration * rates.nursingInsuranceRate / 100)
    : 0;
  const pension = Math.floor(standardRemuneration * rates.pensionRate / 100);
  // Employment insurance is based on actual gross pay, not standard remuneration
  const employmentInsurance = Math.floor(grossPay * rates.employmentInsuranceRate / 100);

  return {
    healthInsurance,
    nursingInsurance,
    pension,
    employmentInsurance,
  };
}

/**
 * Group attendance records by week (Sunday to Saturday)
 */
export function groupByWeek(
  records: AttendanceRecord[],
  year: number,
  month: number
): AttendanceRecord[][] {
  const weeks: AttendanceRecord[][] = [];
  let currentWeek: AttendanceRecord[] = [];

  // Get all dates in the month
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = formatLocalDate(d);
    const record = records.find(r => r.date === dateStr);

    // Sunday = 0, so we start a new week on Sunday
    if (d.getDay() === 0 && currentWeek.length > 0) {
      weeks.push(currentWeek);
      currentWeek = [];
    }

    if (record) {
      currentWeek.push(record);
    }
  }

  // Push the last week if it has records
  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }

  return weeks;
}

/**
 * Calculate monthly overtime hours (hours exceeding 44/week)
 */
export function calculateMonthlyOvertime(
  records: AttendanceRecord[],
  year: number,
  month: number
): number {
  const weeks = groupByWeek(records, year, month);
  let totalOvertimeMinutes = 0;

  for (const week of weeks) {
    const weeklyMinutes = week.reduce((sum, day) => sum + day.workMinutes, 0);
    const weeklyHours = weeklyMinutes / 60;
    if (weeklyHours > WEEKLY_HOURS) {
      totalOvertimeMinutes += (weeklyHours - WEEKLY_HOURS) * 60;
    }
  }

  return totalOvertimeMinutes / 60; // Return hours
}

/**
 * Summarize work hours for a month
 */
export function summarizeWorkHours(records: AttendanceRecord[]): WorkSummary {
  let totalWorkMinutes = 0;
  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  const nightMinutes = 0;
  let holidayMinutes = 0;
  let workDays = 0;

  for (const record of records) {
    if (record.workMinutes > 0) {
      totalWorkMinutes += record.workMinutes;
      workDays++;
    }
    lateMinutes += record.lateMinutes;
    earlyLeaveMinutes += record.earlyLeaveMinutes;
    if (record.isHoliday) {
      holidayMinutes += record.workMinutes;
    }
    // Night minutes would need to be calculated based on actual clock times
  }

  return {
    totalWorkMinutes,
    overtimeMinutes: 0, // Calculated separately by week
    nightMinutes,
    holidayMinutes,
    lateMinutes,
    earlyLeaveMinutes,
    workDays,
    paidLeaveDays: 0, // Need to get from paid leave records
  };
}

/**
 * Format currency in Japanese Yen
 */
export function formatCurrency(amount: number): string {
  return `¥${amount.toLocaleString('ja-JP')}`;
}

/**
 * Format minutes as hours and minutes
 */
export function formatMinutesAsTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}時間${mins}分`;
}

/**
 * Format a Date object as YYYY-MM-DD using local timezone (not UTC)
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format date as Japanese string
 */
export function formatDateJapanese(dateStr: string): string {
  const date = new Date(dateStr);
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日（${weekdays[date.getDay()]}）`;
}
