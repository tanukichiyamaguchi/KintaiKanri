// Staff related types
export interface Staff {
  staffId: string;
  name: string;
  pinCode?: string; // Only used for authentication, hashed
  monthlySalary: number;
  transportation: number;
  hireDate: string;
  paidLeaveBalance: number;
  status: 'active' | 'inactive';
  birthDate: string;
}

export interface StaffInfo {
  staffId: string;
  name: string;
  status: 'active' | 'inactive';
}

// Clock types
export type ClockType =
  | 'clock_in'
  | 'break_start'
  | 'break_end'
  | 'clock_out'
  | 'early_leave_company'
  | 'early_leave_self';

export type ClockOutType = 'normal' | 'early_company' | 'early_self';

export type WorkStatus = 'not_started' | 'working' | 'on_break' | 'finished';

// Attendance related types
export interface ClockRecord {
  type: ClockType;
  time: string;
  latitude?: number;
  longitude?: number;
}

export interface AttendanceRecord {
  date: string;
  staffId: string;
  name: string;
  clockIn?: string;
  clockOut?: string;
  clockOutType?: ClockOutType;
  breakStart?: string;
  breakEnd?: string;
  breakMinutes: number;
  workMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  clockInLat?: number;
  clockInLng?: number;
  clockOutLat?: number;
  clockOutLng?: number;
  isHoliday: boolean;
  remarks?: string;
}

export interface TodayAttendance {
  status: WorkStatus;
  records: ClockRecord[];
  currentRecord?: AttendanceRecord;
}

// Paid leave types
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

// Salary related types
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

// Incentive types
export interface Incentive {
  staffId: string;
  name: string;
  itemName: string;
  amount: number;
  remarks?: string;
}

// Insurance rates
export interface InsuranceRates {
  effectiveDate: string;
  healthInsuranceRate: number;
  nursingInsuranceRate: number;
  pensionRate: number;
  employmentInsuranceRate: number;
  updatedAt?: string;
  updatedBy?: string;
}

// Standard remuneration
export interface StandardRemuneration {
  grade: number;
  monthlyMin: number;
  monthlyMax: number;
  standardMonthly: number;
}

// Tax manual input
export interface TaxManual {
  staffId: string;
  name: string;
  incomeTax: number;
  residentTax: number;
  updatedAt?: string;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AuthResponse {
  success: boolean;
  staffInfo?: StaffInfo;
  token?: string;
  error?: string;
}

// Work summary for calculations
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
