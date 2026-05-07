// ============================================================
// Staff / Admin (auth changed: email + password)
// ============================================================

export interface Staff {
  staffId: string;
  email: string;
  name: string;
  monthlySalary: number;
  transportation: number;
  hireDate: string;
  paidLeaveBalance: number;
  status: 'active' | 'inactive';
  birthDate: string;
}

export interface StaffInfo {
  staffId: string;
  email: string;
  name: string;
  status: 'active' | 'inactive';
}

export interface Admin {
  adminId: string;
  email: string;
  name: string;
}

export interface AdminInfo {
  adminId: string;
  email: string;
  name: string;
}

// ============================================================
// Clock types (no GPS, no break buttons)
// ============================================================

export type ClockType =
  | 'clock_in'
  | 'clock_out';

export type ClockOutType = 'normal';

export type WorkStatus = 'not_started' | 'working' | 'finished';

export type AttendanceSource = 'punch' | 'manual';

export interface ClockRecord {
  type: ClockType;
  time: string;
}

// ============================================================
// Edit history (audit trail)
// ============================================================

export type EditorRole = 'staff' | 'admin';

export interface ClockEditHistory {
  editedAt: string;
  editedBy: string;
  editorRole: EditorRole;
  field: string; // 'clockIn' | 'clockOut' | 'breakMinutes' | 'remarks'
  oldValue: string | null;
  newValue: string | null;
  reason?: string;
}

// ============================================================
// Attendance record (no GPS)
// ============================================================

export interface AttendanceRecord {
  date: string;
  staffId: string;
  name: string;
  clockIn?: string;
  clockOut?: string;
  clockOutType?: ClockOutType;
  breakMinutes: number;
  breakMinutesIsManual?: boolean;
  workMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  isHoliday: boolean;
  remarks?: string;
  source?: AttendanceSource;
  editHistory?: ClockEditHistory[];
}

export interface TodayAttendance {
  status: WorkStatus;
  records: ClockRecord[];
  currentRecord?: AttendanceRecord;
}

// ============================================================
// Shift (read-only from spreadsheet)
// ============================================================

export interface Shift {
  staffId: string;
  staffName: string;
  date: string;
  startTime?: string; // HH:MM
  endTime?: string;   // HH:MM
  isOff: boolean;
  isTentative: boolean;
  parseError?: string;
  rawCell?: string;
}

// ============================================================
// Shift diff (actual vs scheduled)
// ============================================================

export type ShiftDiffKind =
  | 'late_arrival'
  | 'early_leave'
  | 'overtime'
  | 'absence'
  | 'extra_work'
  | 'shift_change'
  | 'break_deviation';

export interface ShiftDiffDetails {
  plannedStart?: string;
  plannedEnd?: string;
  actualStart?: string;
  actualEnd?: string;
  overtimeMinutes?: number;
  plannedBreak?: number;
  actualBreak?: number;
}

export interface ShiftDiff {
  date: string;
  kinds: ShiftDiffKind[];
  details: ShiftDiffDetails;
  hasIssue: boolean;
}

// ============================================================
// Application (申請ワークフロー)
// ============================================================

export type ApplicationType = ShiftDiffKind;
export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface Application {
  id: string;
  staffId: string;
  staffName: string;
  date: string;
  type: ApplicationType;
  reason: string;
  details: ShiftDiffDetails;
  status: ApplicationStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
}

// ============================================================
// Shift request (希望シフト・希望休 申請)
// 対象月の2ヶ月前の7日が提出期限（例: 7月分は5/7まで）
// ============================================================

export type ShiftRequestKind = 'none' | 'off' | 'time';

export interface ShiftRequestDay {
  date: string;         // YYYY-MM-DD
  kind: ShiftRequestKind;
  startTime?: string;   // HH:MM (kind='time' 時のみ)
  endTime?: string;     // HH:MM (kind='time' 時のみ)
}

export interface ShiftRequest {
  id: string;
  staffId: string;
  staffName: string;
  targetYearMonth: string; // 'YYYY-MM'（提出対象月）
  days: ShiftRequestDay[];
  remarks?: string;
  submittedAt: string;
}

// ============================================================
// Monthly submission
// ============================================================

export type SubmissionStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface MonthlySubmission {
  staffId: string;
  staffName: string;
  yearMonth: string; // 'YYYY-MM'
  status: SubmissionStatus;
  submittedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  remarks?: string;
  rejectionReason?: string;
}

export interface SubmissionGateResult {
  canSubmit: boolean;
  blockingReasons: string[];     // 「3/15に未申請の遅刻があります」等
  unappliedDiffs: ShiftDiff[];   // 申請が必要なのに未申請の差異
  pendingApplicationIds: string[]; // 承認待ち申請
}

// ============================================================
// Paid leave (unchanged)
// ============================================================

export type PaidLeaveStatus = 'pending' | 'approved' | 'rejected';

export interface PaidLeaveRequest {
  id: string;
  staffId: string;
  name: string;
  requestDate: string;
  leaveDate: string;
  status: PaidLeaveStatus;
  approvedDate?: string;
  remarks?: string;
}

export interface PaidLeaveBalance {
  balance: number;
  history: PaidLeaveRequest[];
}

// ============================================================
// Salary (unchanged)
// ============================================================

export interface SalaryRecord {
  staffId: string;
  name: string;
  baseSalary: number;
  totalWorkHours: number;
  overtimeHours: number;
  nightHours: number;
  holidayHours: number;
  overtimePay: number;
  nightPay: number;
  holidayPay: number;
  transportation: number;
  incentive: number;
  grossPay: number;
  lateDeduction: number;
  earlyLeaveDeduction: number;
  healthInsurance: number;
  nursingInsurance: number;
  pension: number;
  employmentInsurance: number;
  incomeTax: number;
  residentTax: number;
  totalDeduction: number;
  netPay: number;
}

export interface Incentive {
  staffId: string;
  name: string;
  itemName: string;
  amount: number;
  remarks?: string;
}

export interface InsuranceRates {
  effectiveDate: string;
  healthInsuranceRate: number;
  nursingInsuranceRate: number;
  pensionRate: number;
  employmentInsuranceRate: number;
  updatedAt?: string;
  updatedBy?: string;
}

export interface StandardRemuneration {
  grade: number;
  monthlyMin: number;
  monthlyMax: number;
  standardMonthly: number;
}

export interface TaxManual {
  staffId: string;
  name: string;
  incomeTax: number;
  residentTax: number;
  updatedAt?: string;
}

// ============================================================
// API responses
// ============================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AuthResponse {
  success: boolean;
  isAdmin?: boolean;
  staffInfo?: StaffInfo;
  adminInfo?: AdminInfo;
  token?: string;
  error?: string;
}

// ============================================================
// Bulk attendance row (used in /attendance edit table)
// ============================================================

export interface BulkAttendanceRow {
  date: string;
  clockIn: string;
  clockOut: string;
  breakMinutes: number;
  breakMinutesIsManual?: boolean;
  workMinutes: number;
  isHoliday: boolean;
  overtimeMinutes: number;
  overtimeReason: string;
  remarks: string;
  // Display-only: attached shift / diff
  shift?: Shift;
  diff?: ShiftDiff;
  applications?: Application[];
}

// ============================================================
// Work summary
// ============================================================

export interface WorkSummary {
  totalWorkMinutes: number;
  overtimeMinutes: number;
  nightMinutes: number;
  holidayMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  workDays: number;
  paidLeaveDays: number;
}
