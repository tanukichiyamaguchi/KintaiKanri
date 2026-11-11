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
  // シフト表に「有給」と書かれた日（isOff も true）。残日数は「有給休暇」の登録で減る
  isPaidLeave?: boolean;
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
  // 遅刻/早退 申請時にのみ使用。会社都合は給与控除しない。
  reasonType?: 'company' | 'personal';
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
// Shift request (希望休 申請)
// 対象月の2ヶ月前の7日が提出期限（例: 7月分は5/7まで）
// 仕様: スタッフは「希望休」のみを日単位で申請。管理者が日単位で承認/却下可能。
// ============================================================

export type ShiftRequestDayStatus = 'pending' | 'approved' | 'rejected';

export interface ShiftRequestOffDay {
  date: string;             // YYYY-MM-DD
  status: ShiftRequestDayStatus;
  reviewedAt?: string;
  reviewedBy?: string;      // 承認/却下した管理者ID
  rejectionReason?: string;
}

export interface ShiftRequest {
  id: string;
  staffId: string;
  staffName: string;
  targetYearMonth: string;        // 'YYYY-MM'
  offDays: ShiftRequestOffDay[];  // 希望休として申請された日（status付き）
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

// 月次出勤簿の提出期限ゲート（打刻ブロック / 期限アラートの状態）
export interface ClockGate {
  today: string;             // 'YYYY-MM-DD'
  dayOfMonth: number;
  currentYearMonth: string;  // 'YYYY-MM'
  prevYearMonth: string;     // 'YYYY-MM'（出勤簿の対象＝前月）
  prevStatus: SubmissionStatus;
  hasPrevAttendance: boolean;
  deadlineDay: number;       // 7
  blockDay: number;          // 4
  deadlineDate: string;      // 'YYYY-MM-07'
  alertActive: boolean;      // 1〜7日かつ前月未提出 → アラート表示
  clockBlocked: boolean;     // 4日以降かつ前月未提出 → 打刻ブロック
  // 「年5日の有給を取りましょう」のお知らせ（打刻画面の取得 clock-gate にだけ入る。対象でなければ null）
  paidLeaveNotice?: PaidLeaveNotice | null;
}

// スタッフ向けの「年5日の有給を取りましょう」のお知らせ。
// 10日以上付与された期間で、承認済みの有給（予定を含む）が5日に届かず、期限の6か月前を過ぎたときだけ届く。
// スタッフには有給の残日数などは見せないため、期限と「あと何日」だけ。
export interface PaidLeaveNotice {
  deadline: string;   // 期限 'YYYY-MM-DD'（付与日から1年の最後の日）
  remaining: number;  // 5日のうち、まだ取っていない日数
  required: number;   // 5
}

// 管理者ダッシュボードのまとめ取得（GAS: dashboard/summary）
export interface DashboardSummary {
  staff: StaffInfo[];
  today: Record<string, TodayAttendance>;
  counts: {
    // 取得に失敗した項目は null
    pendingApplications: number | null;
    pendingSubmissions: number | null;
    pendingPaidLeave: number | null;
    pendingShiftRequests: number | null;
  };
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
  balance: number;              // 残日数（承認済みの分は差し引き済み）
  pending?: number;             // 承認待ちの日数（全期間）
  available?: number;           // あと何日申請できるか = balance − pending
  nextGrant?: PaidLeaveNextGrant | null; // 次の付与（入社日が無い場合は null）
  notice?: PaidLeaveNotice | null;       // 年5日のお知らせ（対象でなければ null）
  history: PaidLeaveRequest[];
}

// 次の有給の付与（入社日をもとに法定どおり自動で付与される）
export interface PaidLeaveNextGrant {
  date: string;           // 付与日 YYYY-MM-DD
  days: number;           // 付与日数
  serviceLength: string;  // その時点の勤続期間（例: 1年6ヶ月）
}

// 有給付与履歴の種類: 付与 / 時効による消滅 / 登録時の開始 / 管理者の調整
export type PaidLeaveLedgerKind = 'grant' | 'lapse' | 'start' | 'adjust';

export interface PaidLeaveLedgerEntry {
  kind: PaidLeaveLedgerKind;
  date: string;              // 付与日・消滅日・開始日・調整日
  days: number;              // 増えた日数（消滅・減らす調整はマイナス）
  grantNo?: number;          // 何回目の付与か（付与・消滅）
  serviceLength?: string;    // 勤続期間（付与・消滅）
  expiresOn?: string;        // 有効期限（付与のみ。この日まで使える）
  balanceAfter?: number | null; // 処理後の残日数
  remarks?: string;
}

// 年 5 日の取得義務（10 日以上付与された方。付与日から 1 年の期間）
export interface PaidLeaveObligation {
  periodStart: string;
  periodEnd: string;
  taken: number;     // 期間内の承認済みの有給（これからの予定を含む）
  required: number;  // 5
}

// 管理者の「有給休暇」画面用（スタッフごと）
export interface PaidLeaveOverviewItem {
  staffId: string;
  name: string;
  hireDate: string;
  balance: number;
  pending: number;
  available: number;
  nextGrant: PaidLeaveNextGrant | null;
  obligation: PaidLeaveObligation | null;
  ledger: PaidLeaveLedgerEntry[];  // 新しい順
  // シフト表で「有給」なのに、有給の登録（承認済み・承認待ち）が無い日（前月〜3か月先）
  shiftPaidLeaveUnregistered?: string[];
}

// 管理者による有給の登録の結果
export interface PaidLeaveRegisterResult {
  requestId: string;
  balance: number;           // 登録後の残日数
  convertedPending: boolean; // 同じ日の承認待ちの申請を承認済みにした
  removedOffDays: number;    // 取り消した同じ日の希望休の数
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
