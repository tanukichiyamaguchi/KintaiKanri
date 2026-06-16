import type {
  ApiResponse,
  AuthResponse,
  StaffInfo,
  AdminInfo,
  Staff,
  TodayAttendance,
  AttendanceRecord,
  ClockType,
  ClockEditHistory,
  PaidLeaveRequest,
  PaidLeaveBalance,
  SalaryRecord,
  InsuranceRates,
  Incentive,
  TaxManual,
  BulkAttendanceRow,
  Shift,
  Application,
  ApplicationType,
  ApplicationStatus,
  MonthlySubmission,
  SubmissionStatus,
  ClockGate,
} from '../types';

// Base URL for the Google Apps Script Web App
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// Demo mode は **明示指定された場合のみ** 有効。
// 旧実装は !API_BASE_URL でも自動的に DEMO_MODE=true としていたが、
// その結果「環境変数の設定忘れで本番ビルドが無言でデモモード化し、
// 打刻はメモリ上の mockTodayRecords にだけ push されてリロードで消える」
// という致命的な事故が起きていた（=「打刻できない」と見える症状の主犯）。
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
// API_BASE_URL も DEMO_MODE も指定されていない＝設定ミスの状態。
// UI 側で目立つ警告バナーを出し、API 呼び出しは明示エラーで失敗させる。
export const MISCONFIGURED_NO_API_BASE_URL = !API_BASE_URL && !DEMO_MODE;
export const IS_DEMO_MODE = DEMO_MODE;

// --- Helper: format date as YYYY-MM-DD in local timezone ---
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtTime(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// --- Mock data for demo mode ---
const mockStaff: StaffInfo[] = [
  { staffId: 'S001', email: 'sato@example.com', name: '佐藤 花子', status: 'active' },
  { staffId: 'S002', email: 'tanaka@example.com', name: '田中 太郎', status: 'active' },
  { staffId: 'S003', email: 'yamada@example.com', name: '山田 次郎', status: 'active' },
];

const mockStaffDetails: Staff[] = [
  {
    staffId: 'S001',
    email: 'sato@example.com',
    name: '佐藤 花子',
    monthlySalary: 250000,
    transportation: 15000,
    hireDate: '2022-04-01',
    paidLeaveBalance: 12,
    status: 'active',
    birthDate: '1990-05-15',
  },
  {
    staffId: 'S002',
    email: 'tanaka@example.com',
    name: '田中 太郎',
    monthlySalary: 230000,
    transportation: 12000,
    hireDate: '2023-01-15',
    paidLeaveBalance: 10,
    status: 'active',
    birthDate: '1988-03-22',
  },
  {
    staffId: 'S003',
    email: 'yamada@example.com',
    name: '山田 次郎',
    monthlySalary: 220000,
    transportation: 10000,
    hireDate: '2023-06-01',
    paidLeaveBalance: 8,
    status: 'active',
    birthDate: '1995-11-08',
  },
];

const mockAdmin: AdminInfo = {
  adminId: 'A001',
  email: 'admin@example.com',
  name: 'システム管理者',
};

const mockAdmins: AdminInfo[] = [mockAdmin];

// In-memory storage for demo mode
const mockTodayRecords: Record<string, TodayAttendance> = {};
const mockPaidLeaveRequests: PaidLeaveRequest[] = [];
const mockTaxManual: Record<string, TaxManual[]> = {};
const mockIncentives: Record<string, Incentive[]> = {};
const mockApplications: Application[] = [];
const mockSubmissions: MonthlySubmission[] = [];
const mockShifts: Record<string, Shift[]> = {};
const mockEditHistory: ClockEditHistory[] = [];
const mockShiftRequests: import('../types').ShiftRequest[] = [];
// Key: "staffId-YYYY-MM", stores bulk-entered attendance
const mockBulkAttendance: Record<string, AttendanceRecord[]> = {};

let mockInsuranceRates: InsuranceRates = {
  effectiveDate: '2024-04',
  healthInsuranceRate: 4.905,
  nursingInsuranceRate: 0.80,
  pensionRate: 9.15,
  employmentInsuranceRate: 0.60,
  updatedAt: '2024-04-01',
};
const mockInsuranceHistory: InsuranceRates[] = [mockInsuranceRates];

// --- Generate mock monthly attendance ---
function generateMockAttendance(staffId: string, year: number, month: number): AttendanceRecord[] {
  const staff = mockStaffDetails.find(s => s.staffId === staffId);
  if (!staff) return [];

  const records: AttendanceRecord[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    if (date > today) continue;

    const dateStr = fmtDate(date);
    const dow = date.getDay();

    // Sunday is off
    if (dow === 0) continue;

    // Seed-based "random" variation per staff+date
    const seed = staffId.charCodeAt(staffId.length - 1) + day;
    const clockInH = 10;
    const clockInM = (seed * 7) % 10; // 0-9 min late
    const clockOutH = 19;
    const clockOutM = (seed * 3) % 15; // 0-14 min overtime

    const clockIn = `${dateStr}T${fmtTime(clockInH, clockInM)}:00`;
    const clockOut = `${dateStr}T${fmtTime(clockOutH, clockOutM)}:00`;
    const breakMinutes = 60;
    const workMinutes = (clockOutH * 60 + clockOutM) - (clockInH * 60 + clockInM) - breakMinutes;

    records.push({
      date: dateStr,
      staffId,
      name: staff.name,
      clockIn,
      clockOut,
      breakMinutes,
      workMinutes,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      isHoliday: false,
    });
  }

  return records;
}

// --- Calculate mock salary for a staff member ---
function calculateMockSalary(staff: Staff, year: number, month: number): SalaryRecord {
  const attendance = generateMockAttendance(staff.staffId, year, month);
  const totalWorkMinutes = attendance.reduce((sum, r) => sum + r.workMinutes, 0);
  const totalWorkHours = totalWorkMinutes / 60;

  // Simple overtime: hours over 190.67 monthly (44h/week * 52 / 12)
  const monthlyStandardHours = (44 * 52) / 12;
  const overtimeHours = Math.max(0, totalWorkHours - monthlyStandardHours);
  const hourlyRate = staff.monthlySalary / monthlyStandardHours;
  const overtimePay = Math.floor(overtimeHours * hourlyRate * 1.25);

  // Insurance
  const healthInsurance = Math.floor(staff.monthlySalary * mockInsuranceRates.healthInsuranceRate / 100);
  const pension = Math.floor(staff.monthlySalary * mockInsuranceRates.pensionRate / 100);
  const employmentInsurance = Math.floor(staff.monthlySalary * mockInsuranceRates.employmentInsuranceRate / 100);

  // Tax from manual input
  const key = `${year}-${month}`;
  const taxEntry = mockTaxManual[key]?.find(t => t.staffId === staff.staffId);
  const incomeTax = taxEntry?.incomeTax || 0;
  const residentTax = taxEntry?.residentTax || 0;

  // Incentives
  const incentiveEntries = mockIncentives[key]?.filter(i => i.staffId === staff.staffId) || [];
  const incentive = incentiveEntries.reduce((sum, i) => sum + i.amount, 0);

  const grossPay = staff.monthlySalary + overtimePay + staff.transportation + incentive;
  const totalDeduction = healthInsurance + pension + employmentInsurance + incomeTax + residentTax;
  const netPay = grossPay - totalDeduction;

  return {
    staffId: staff.staffId,
    name: staff.name,
    baseSalary: staff.monthlySalary,
    totalWorkHours: Math.round(totalWorkHours * 10) / 10,
    overtimeHours: Math.round(overtimeHours * 10) / 10,
    nightHours: 0,
    holidayHours: 0,
    overtimePay,
    nightPay: 0,
    holidayPay: 0,
    transportation: staff.transportation,
    incentive,
    grossPay,
    lateDeduction: 0,
    earlyLeaveDeduction: 0,
    healthInsurance,
    nursingInsurance: 0,
    pension,
    employmentInsurance,
    incomeTax,
    residentTax,
    totalDeduction,
    netPay,
  };
}

// GAS API
//   - Read系 (body なし): GET でクエリ送信
//   - Write系 (body あり): POST + text/plain で body 送信
//     （URL 長制限を回避。Content-Type を text/plain にすることで CORS プリフライトを発生させない）
async function apiRequest<T>(
  action: string,
  body?: Record<string, unknown>,
  queryParams?: Record<string, string>
): Promise<ApiResponse<T>> {
  if (DEMO_MODE) {
    return handleDemoRequest<T>(action, body, queryParams);
  }

  if (MISCONFIGURED_NO_API_BASE_URL) {
    // 設定ミス。デモモードに無言で落とすのではなく、明示エラーで失敗させる。
    // UI 側で警告バナーも出るので、原因が一目でわかる。
    return {
      success: false,
      error: 'サーバー接続先（VITE_API_BASE_URL）が設定されていません。管理者にお問い合わせください。',
    };
  }

  try {
    const url = new URL(API_BASE_URL);
    url.searchParams.set('action', action);

    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    let response: Response;
    if (body) {
      // POST body: no URL length limit, no CORS preflight with text/plain
      response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        redirect: 'follow',
      });
    } else {
      // GET for read-only operations
      response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        redirect: 'follow',
      });
    }

    const data = await response.json();

    if (data.success) {
      return { success: true, data: data.data || data };
    } else {
      return { success: false, error: data.error || 'エラーが発生しました' };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'ネットワークエラー',
    };
  }
}

// Demo mode request handler
async function handleDemoRequest<T>(
  action: string,
  body?: Record<string, unknown>,
  queryParams?: Record<string, string>
): Promise<ApiResponse<T>> {
  await new Promise(resolve => setTimeout(resolve, 300));

  // --- Auth (email + password) ---
  if (action === 'auth' || action === 'admin-auth') {
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    if (!email || !password) {
      return { success: false, error: 'メールアドレスとパスワードを入力してください' };
    }

    // Demo: admin email / staff email
    if (email === mockAdmin.email && password.length >= 4) {
      return {
        success: true,
        data: {
          success: true,
          isAdmin: true,
          adminInfo: mockAdmin,
          token: 'admin-token-' + Date.now()
        } as unknown as T,
      };
    }
    const staff = mockStaff.find(s => s.email === email);
    if (staff && password.length >= 4) {
      return {
        success: true,
        data: {
          success: true,
          isAdmin: false,
          staffInfo: staff,
          token: 'staff-token-' + Date.now()
        } as unknown as T,
      };
    }
    return { success: false, error: 'メールアドレスまたはパスワードが正しくありません' };
  }

  // --- Self-registration (staff only) ---
  if (action === 'auth/register') {
    const name = String(body?.name || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');

    if (!name || !email || !password) {
      return { success: false, error: '氏名・メールアドレス・パスワードをすべて入力してください' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: 'メールアドレスの形式が正しくありません' };
    }
    if (password.length < 8) {
      return { success: false, error: 'パスワードは8文字以上で設定してください' };
    }
    if (mockStaff.find(s => s.email === email) || email === mockAdmin.email) {
      return { success: false, error: 'このメールアドレスは既に登録されています' };
    }

    const staffId = 'S' + String(Date.now()).slice(-6);
    const today = new Date();
    const newStaffInfo: StaffInfo = { staffId, email, name, status: 'active' };
    mockStaff.push(newStaffInfo);
    mockStaffDetails.push({
      staffId, email, name,
      monthlySalary: 0, transportation: 0,
      hireDate: fmtDate(today),
      paidLeaveBalance: 0, status: 'active', birthDate: '',
    });

    return {
      success: true,
      data: {
        success: true,
        isAdmin: false,
        staffInfo: newStaffInfo,
        token: 'staff-token-' + Date.now(),
      } as unknown as T,
    };
  }

  // --- Staff ---
  if (action === 'staff' && !body) {
    return { success: true, data: mockStaff as unknown as T };
  }

  if (action === 'staff/detail') {
    const staff = mockStaffDetails.find(s => s.staffId === queryParams?.staffId);
    if (staff) return { success: true, data: staff as unknown as T };
    return { success: false, error: 'スタッフが見つかりません' };
  }

  if (action === 'staff' && body) {
    const newStaffId = 'S' + String(Date.now()).slice(-6);
    const newStaff: Staff = {
      staffId: newStaffId,
      email: (body.email as string) || '',
      name: body.name as string,
      monthlySalary: Number(body.monthlySalary) || 0,
      transportation: Number(body.transportation) || 0,
      hireDate: (body.hireDate as string) || '',
      birthDate: (body.birthDate as string) || '',
      paidLeaveBalance: Number(body.paidLeaveBalance) || 0,
      status: 'active',
    };
    mockStaffDetails.push(newStaff);
    mockStaff.push({ staffId: newStaffId, email: newStaff.email, name: newStaff.name, status: 'active' });
    return { success: true, data: { staffId: newStaffId } as unknown as T };
  }

  if (action === 'staff/update') {
    const staffId = body?.staffId as string;
    const idx = mockStaffDetails.findIndex(s => s.staffId === staffId);
    if (idx !== -1) {
      mockStaffDetails[idx] = { ...mockStaffDetails[idx], ...body, staffId } as Staff;
      const listIdx = mockStaff.findIndex(s => s.staffId === staffId);
      if (listIdx !== -1) {
        if (body?.name) mockStaff[listIdx].name = body.name as string;
        if (body?.email) mockStaff[listIdx].email = String(body.email).toLowerCase();
        if (body?.status) mockStaff[listIdx].status = body.status as 'active' | 'inactive';
      }
      return { success: true, data: undefined as unknown as T };
    }
    return { success: false, error: 'スタッフが見つかりません' };
  }

  if (action === 'staff/delete') {
    const staffId = body?.staffId as string;
    const idx = mockStaffDetails.findIndex(s => s.staffId === staffId);
    if (idx !== -1) {
      mockStaffDetails.splice(idx, 1);
      const listIdx = mockStaff.findIndex(s => s.staffId === staffId);
      if (listIdx !== -1) mockStaff.splice(listIdx, 1);
      return { success: true, data: undefined as unknown as T };
    }
    return { success: false, error: 'スタッフが見つかりません' };
  }

  // --- Clock (no GPS, no break buttons) ---
  if (action === 'clock') {
    const staffId = body?.staffId as string;
    const type = body?.type as ClockType;
    const now = new Date();
    const timestamp = `${fmtDate(now)}T${fmtTime(now.getHours(), now.getMinutes())}:${String(now.getSeconds()).padStart(2, '0')}`;

    if (!mockTodayRecords[staffId]) {
      mockTodayRecords[staffId] = { status: 'not_started', records: [] };
    }

    const record = mockTodayRecords[staffId];
    record.records.push({ type, time: timestamp });

    switch (type) {
      case 'clock_in': record.status = 'working'; break;
      case 'clock_out': record.status = 'finished'; break;
    }

    return { success: true, data: { success: true, record } as unknown as T };
  }

  // --- Attendance ---
  if (action === 'attendance/today') {
    const staffId = queryParams?.staffId || '';
    const attendance = mockTodayRecords[staffId] || { status: 'not_started' as const, records: [] };
    return { success: true, data: attendance as unknown as T };
  }

  if (action === 'attendance' && !body) {
    const staffId = queryParams?.staffId || '';
    const year = Number(queryParams?.year);
    const month = Number(queryParams?.month);
    const records = generateMockAttendance(staffId, year, month);
    return { success: true, data: records as unknown as T };
  }

  if (action === 'attendance/update') {
    return { success: true, data: undefined as unknown as T };
  }

  // --- Paid Leave ---
  if (action === 'paid-leave/balance') {
    const staffId = queryParams?.staffId || '';
    const staff = mockStaffDetails.find(s => s.staffId === staffId);
    const history = mockPaidLeaveRequests.filter(r => r.staffId === staffId);
    return {
      success: true,
      data: { balance: staff?.paidLeaveBalance || 0, history } as unknown as T,
    };
  }

  if (action === 'paid-leave/request') {
    const staffId = body?.staffId as string;
    const leaveDate = body?.leaveDate as string;
    const staff = mockStaffDetails.find(s => s.staffId === staffId);
    const requestId = 'PL' + Date.now();
    mockPaidLeaveRequests.push({
      id: requestId,
      staffId,
      name: staff?.name || '',
      requestDate: fmtDate(new Date()),
      leaveDate,
      status: 'pending',
    });
    return { success: true, data: { requestId } as unknown as T };
  }

  if (action === 'paid-leave/all') {
    return { success: true, data: mockPaidLeaveRequests as unknown as T };
  }

  if (action === 'paid-leave/update') {
    const requestId = body?.requestId as string;
    const status = body?.status as 'approved' | 'rejected';
    const req = mockPaidLeaveRequests.find(r => r.id === requestId);
    if (req) {
      req.status = status;
      if (status === 'approved') {
        req.approvedDate = new Date().toISOString();
        const staff = mockStaffDetails.find(s => s.staffId === req.staffId);
        if (staff && staff.paidLeaveBalance > 0) staff.paidLeaveBalance--;
      }
    }
    return { success: true, data: undefined as unknown as T };
  }

  // --- Salary ---
  if (action === 'salary' && !body) {
    const staffId = queryParams?.staffId || '';
    const year = Number(queryParams?.year);
    const month = Number(queryParams?.month);
    const staff = mockStaffDetails.find(s => s.staffId === staffId);
    if (!staff) return { success: false, error: 'スタッフが見つかりません' };
    return { success: true, data: calculateMockSalary(staff, year, month) as unknown as T };
  }

  if (action === 'salary/calculate') {
    const year = Number(body?.year);
    const month = Number(body?.month);
    const activeStaff = mockStaffDetails.filter(s => s.status === 'active');
    const salaries = activeStaff.map(s => calculateMockSalary(s, year, month));
    return { success: true, data: salaries as unknown as T };
  }

  // --- Insurance ---
  if (action === 'insurance-rates' && !body) {
    return {
      success: true,
      data: { rates: mockInsuranceRates, history: mockInsuranceHistory } as unknown as T,
    };
  }

  if (action === 'insurance-rates' && body) {
    mockInsuranceRates = {
      ...body,
      updatedAt: new Date().toISOString(),
    } as InsuranceRates;
    mockInsuranceHistory.unshift(mockInsuranceRates);
    return { success: true, data: undefined as unknown as T };
  }

  // --- Tax ---
  if (action === 'tax' && body && body.staffId) {
    const key = `${body.year}-${body.month}`;
    if (!mockTaxManual[key]) mockTaxManual[key] = [];
    const existing = mockTaxManual[key].findIndex(t => t.staffId === body.staffId);
    const entry: TaxManual = {
      staffId: body.staffId as string,
      name: mockStaffDetails.find(s => s.staffId === body.staffId)?.name || '',
      incomeTax: Number(body.incomeTax) || 0,
      residentTax: Number(body.residentTax) || 0,
      updatedAt: new Date().toISOString(),
    };
    if (existing !== -1) {
      mockTaxManual[key][existing] = entry;
    } else {
      mockTaxManual[key].push(entry);
    }
    return { success: true, data: undefined as unknown as T };
  }

  if (action === 'tax' && !body) {
    const key = `${queryParams?.year}-${queryParams?.month}`;
    return { success: true, data: (mockTaxManual[key] || []) as unknown as T };
  }

  // --- Incentive ---
  if (action === 'incentive' && body && body.staffId) {
    const key = `${body.year}-${body.month}`;
    if (!mockIncentives[key]) mockIncentives[key] = [];
    mockIncentives[key].push({
      staffId: body.staffId as string,
      name: mockStaffDetails.find(s => s.staffId === body.staffId)?.name || '',
      itemName: body.itemName as string,
      amount: Number(body.amount) || 0,
      remarks: body.remarks as string,
    });
    return { success: true, data: undefined as unknown as T };
  }

  if (action === 'incentive' && !body) {
    const key = `${queryParams?.year}-${queryParams?.month}`;
    return { success: true, data: (mockIncentives[key] || []) as unknown as T };
  }

  // --- Bulk Attendance ---
  if (action === 'attendance/bulk-save') {
    const staffId = body?.staffId as string;
    const year = Number(body?.year);
    const month = Number(body?.month);
    const rows = body?.rows as unknown as BulkAttendanceRow[];
    const staff = mockStaffDetails.find(s => s.staffId === staffId);
    if (!staff || !rows) return { success: false, error: 'データが不正です' };

    const key = `${staffId}-${year}-${month}`;
    const records: AttendanceRecord[] = rows
      .filter(r => r.clockIn && r.clockOut)
      .map(row => ({
        date: row.date,
        staffId,
        name: staff.name,
        clockIn: row.clockIn ? `${row.date}T${row.clockIn}:00` : undefined,
        clockOut: row.clockOut ? `${row.date}T${row.clockOut}:00` : undefined,
        breakMinutes: row.breakMinutes,
        breakMinutesIsManual: row.breakMinutesIsManual,
        workMinutes: row.workMinutes,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        isHoliday: row.isHoliday,
        remarks: row.remarks || undefined,
      }));
    mockBulkAttendance[key] = records;
    return { success: true, data: { saved: records.length } as unknown as T };
  }

  if (action === 'attendance/bulk-get') {
    const staffId = queryParams?.staffId || '';
    const year = Number(queryParams?.year);
    const month = Number(queryParams?.month);
    const key = `${staffId}-${year}-${month}`;
    const saved = mockBulkAttendance[key];
    if (saved) {
      return { success: true, data: saved as unknown as T };
    }
    // Fall back to generated mock data
    const records = generateMockAttendance(staffId, year, month);
    return { success: true, data: records as unknown as T };
  }

  // --- Applications ---
  if (action === 'applications/create') {
    const id = 'AP' + Date.now() + Math.random().toString(36).slice(2, 6);
    const staffId = String(body?.staffId || '');
    const staff = mockStaff.find(s => s.staffId === staffId);
    const app: Application = {
      id,
      staffId,
      staffName: staff?.name || '',
      date: String(body?.date || ''),
      type: body?.type as ApplicationType,
      reason: String(body?.reason || ''),
      details: (body?.details as Application['details']) || {},
      status: 'pending',
      submittedAt: new Date().toISOString(),
    };
    mockApplications.push(app);
    return { success: true, data: { id } as unknown as T };
  }

  if (action === 'applications/list') {
    const staffId = queryParams?.staffId;
    const status = queryParams?.status as ApplicationStatus | undefined;
    const yearMonth = queryParams?.yearMonth;
    let filtered: Application[] = mockApplications;
    if (staffId) filtered = filtered.filter(r => r.staffId === staffId);
    if (status) filtered = filtered.filter(r => r.status === status);
    if (yearMonth) filtered = filtered.filter(r => r.date.startsWith(yearMonth));
    return { success: true, data: filtered as unknown as T };
  }

  if (action === 'applications/approve') {
    const id = String(body?.id || '');
    const app = mockApplications.find(a => a.id === id);
    if (app) {
      app.status = 'approved';
      app.reviewedAt = new Date().toISOString();
      app.reviewedBy = String(body?.reviewedBy || '');
    }
    return { success: true, data: undefined as unknown as T };
  }

  if (action === 'applications/reject') {
    const id = String(body?.id || '');
    const app = mockApplications.find(a => a.id === id);
    if (app) {
      app.status = 'rejected';
      app.reviewedAt = new Date().toISOString();
      app.reviewedBy = String(body?.reviewedBy || '');
      app.rejectionReason = String(body?.rejectionReason || '');
    }
    return { success: true, data: undefined as unknown as T };
  }

  // --- Submissions ---
  if (action === 'submissions/submit') {
    const staffId = String(body?.staffId || '');
    const yearMonth = String(body?.yearMonth || '');
    const remarks = body?.remarks as string | undefined;
    // Group by (date, type) and only consider the most recent application per group.
    // This way a re-submitted (newer) approved app supersedes an older rejected one.
    const monthApps = mockApplications.filter(
      a => a.staffId === staffId && a.date.startsWith(yearMonth)
    );
    const latestByKey = new Map<string, Application>();
    monthApps.forEach(a => {
      const key = `${a.date}|${a.type}`;
      const cur = latestByKey.get(key);
      if (!cur || cur.submittedAt < a.submittedAt) {
        latestByKey.set(key, a);
      }
    });
    const blocked = [...latestByKey.values()].filter(a => a.status !== 'approved');
    if (blocked.length > 0) {
      return {
        success: false,
        error: '未承認の申請があります（' + blocked.length + '件）。承認後に再度提出してください。'
      };
    }
    const staff = mockStaff.find(s => s.staffId === staffId);
    const existing = mockSubmissions.find(s => s.staffId === staffId && s.yearMonth === yearMonth);
    const now = new Date().toISOString();
    if (existing) {
      existing.status = 'submitted';
      existing.submittedAt = now;
      existing.remarks = remarks;
      existing.rejectionReason = undefined;
    } else {
      mockSubmissions.push({
        staffId,
        staffName: staff?.name || '',
        yearMonth,
        status: 'submitted',
        submittedAt: now,
        remarks,
      });
    }
    return { success: true, data: undefined as unknown as T };
  }

  if (action === 'submissions/status') {
    const staffId = queryParams?.staffId || '';
    const yearMonth = queryParams?.yearMonth || '';
    const sub = mockSubmissions.find(s => s.staffId === staffId && s.yearMonth === yearMonth);
    return {
      success: true,
      data: (sub || { staffId, staffName: '', yearMonth, status: 'draft' as SubmissionStatus }) as unknown as T,
    };
  }

  if (action === 'submissions/clock-gate') {
    const staffId = queryParams?.staffId || '';
    const now = new Date();
    const dayOfMonth = now.getDate();
    const curYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevYm = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    const prevSub = mockSubmissions.find(s => s.staffId === staffId && s.yearMonth === prevYm);
    const prevStatus = (prevSub?.status || 'draft') as SubmissionStatus;
    // デモではモックに前月勤怠があるか不明なので、提出済み以外は「実績あり」とみなす
    const hasPrevAttendance = !(prevStatus === 'submitted' || prevStatus === 'approved');
    const prevSubmitted = prevStatus === 'submitted' || prevStatus === 'approved';
    const gate: ClockGate = {
      today: `${curYm}-${String(dayOfMonth).padStart(2, '0')}`,
      dayOfMonth,
      currentYearMonth: curYm,
      prevYearMonth: prevYm,
      prevStatus,
      hasPrevAttendance,
      deadlineDay: 7,
      blockDay: 4,
      deadlineDate: `${curYm}-07`,
      alertActive: dayOfMonth >= 1 && dayOfMonth <= 7 && !prevSubmitted && hasPrevAttendance,
      clockBlocked: dayOfMonth >= 4 && !prevSubmitted && hasPrevAttendance,
    };
    return { success: true, data: gate as unknown as T };
  }

  if (action === 'submissions/list') {
    const yearMonth = queryParams?.yearMonth;
    const status = queryParams?.status as SubmissionStatus | undefined;
    let filtered = mockSubmissions;
    if (yearMonth) filtered = filtered.filter(s => s.yearMonth === yearMonth);
    if (status) filtered = filtered.filter(s => s.status === status);
    return { success: true, data: filtered as unknown as T };
  }

  if (action === 'submissions/approve') {
    const staffId = String(body?.staffId || '');
    const yearMonth = String(body?.yearMonth || '');
    const sub = mockSubmissions.find(s => s.staffId === staffId && s.yearMonth === yearMonth);
    if (sub) {
      sub.status = 'approved';
      sub.reviewedAt = new Date().toISOString();
      sub.reviewedBy = String(body?.reviewedBy || '');
    }
    return { success: true, data: undefined as unknown as T };
  }

  if (action === 'submissions/reject') {
    const staffId = String(body?.staffId || '');
    const yearMonth = String(body?.yearMonth || '');
    const sub = mockSubmissions.find(s => s.staffId === staffId && s.yearMonth === yearMonth);
    if (sub) {
      sub.status = 'rejected';
      sub.reviewedAt = new Date().toISOString();
      sub.reviewedBy = String(body?.reviewedBy || '');
      sub.rejectionReason = String(body?.rejectionReason || '');
    }
    return { success: true, data: undefined as unknown as T };
  }

  // --- Shifts ---
  if (action === 'shifts/staff-month' || action === 'shifts/monthly') {
    const staffId = queryParams?.staffId;
    const year = queryParams?.year;
    const month = queryParams?.month;
    const key = `${year}-${month}`;
    const all = mockShifts[key] || [];
    const filtered = staffId ? all.filter(s => s.staffId === staffId) : all;
    return {
      success: true,
      data: { exists: !!mockShifts[key], shifts: filtered } as unknown as T,
    };
  }

  // --- Password ---
  if (action === 'password/change' || action === 'password/reset') {
    return { success: true, data: undefined as unknown as T };
  }

  // --- Admins (manager UI) ---
  if (action === 'admins' && !body) {
    return { success: true, data: [...mockAdmins] as unknown as T };
  }
  if (action === 'admins' && body) {
    const newAdmin: AdminInfo = {
      adminId: 'A' + String(Date.now()).slice(-6),
      email: String(body.email || '').toLowerCase(),
      name: String(body.name || ''),
    };
    mockAdmins.push(newAdmin);
    return { success: true, data: { adminId: newAdmin.adminId } as unknown as T };
  }
  if (action === 'admins/update') {
    const adminId = String(body?.adminId || '');
    const idx = mockAdmins.findIndex(a => a.adminId === adminId);
    if (idx !== -1) {
      if (body?.name) mockAdmins[idx].name = String(body.name);
      if (body?.email) mockAdmins[idx].email = String(body.email).toLowerCase();
    }
    return { success: true, data: undefined as unknown as T };
  }
  if (action === 'admins/delete') {
    const adminId = String(body?.adminId || '');
    const idx = mockAdmins.findIndex(a => a.adminId === adminId);
    if (idx !== -1) mockAdmins.splice(idx, 1);
    return { success: true, data: undefined as unknown as T };
  }

  // --- Attendance history ---
  if (action === 'attendance/history') {
    const staffId = queryParams?.staffId;
    const date = queryParams?.date;
    let filtered = mockEditHistory;
    if (staffId) filtered = filtered.filter(h => h.editedBy === staffId);
    if (date) {
      const filterDate = date;
      filtered = filtered.filter(h => h.editedAt.startsWith(filterDate));
    }
    return { success: true, data: filtered as unknown as T };
  }

  // --- Shift Requests ---
  if (action === 'shift-requests/submit') {
    const staffId = String(body?.staffId || '');
    const targetYearMonth = String(body?.targetYearMonth || '');
    const incomingOffDays = Array.isArray(body?.offDays)
      ? (body!.offDays as import('../types').ShiftRequestOffDay[])
      : [];
    const remarks = body?.remarks ? String(body.remarks) : undefined;
    const staff = mockStaff.find(s => s.staffId === staffId);
    const id = 'SR' + Date.now() + Math.random().toString(36).slice(2, 6);

    const existingIdx = mockShiftRequests.findIndex(
      r => r.staffId === staffId && r.targetYearMonth === targetYearMonth
    );
    const existingOffDays = existingIdx !== -1 ? mockShiftRequests[existingIdx].offDays : [];

    // マージ: approved/rejected は保持、pending は新セットの有無で残すかどうか決める
    const newDateSet = new Set(incomingOffDays.map(d => d.date));
    const merged: import('../types').ShiftRequestOffDay[] = [];
    const seen = new Set<string>();
    for (const e of existingOffDays) {
      if (e.status === 'approved' || e.status === 'rejected') {
        merged.push(e);
        seen.add(e.date);
      } else if (newDateSet.has(e.date)) {
        merged.push(e);
        seen.add(e.date);
      }
    }
    for (const d of newDateSet) {
      if (!seen.has(d)) merged.push({ date: d, status: 'pending' });
    }
    merged.sort((a, b) => (a.date < b.date ? -1 : 1));

    const record: import('../types').ShiftRequest = {
      id: existingIdx !== -1 ? mockShiftRequests[existingIdx].id : id,
      staffId,
      staffName: staff?.name || '',
      targetYearMonth,
      offDays: merged,
      remarks,
      submittedAt: new Date().toISOString(),
    };
    if (existingIdx !== -1) {
      mockShiftRequests[existingIdx] = record;
    } else {
      mockShiftRequests.push(record);
    }
    return { success: true, data: { id: record.id } as unknown as T };
  }

  if (action === 'shift-requests/list') {
    const staffId = queryParams?.staffId;
    const targetYearMonth = queryParams?.targetYearMonth;
    let filtered: import('../types').ShiftRequest[] = mockShiftRequests;
    if (staffId) filtered = filtered.filter(r => r.staffId === staffId);
    if (targetYearMonth) filtered = filtered.filter(r => r.targetYearMonth === targetYearMonth);
    return { success: true, data: filtered as unknown as T };
  }

  if (action === 'shift-requests/review-day') {
    const reqId = String(body?.id || '');
    const staffIdParam = body?.staffId ? String(body.staffId) : '';
    const targetYearMonth = body?.targetYearMonth ? String(body.targetYearMonth) : '';
    const date = String(body?.date || '');
    const status = String(body?.status || '') as 'approved' | 'rejected';
    const rejectionReason = body?.rejectionReason ? String(body.rejectionReason) : undefined;
    const reviewedBy = body?.reviewedBy ? String(body.reviewedBy) : undefined;
    // staffId + targetYearMonth で特定（行ベース格納の代理）
    const req = mockShiftRequests.find(r =>
      (staffIdParam && targetYearMonth)
        ? (r.staffId === staffIdParam && r.targetYearMonth === targetYearMonth)
        : r.id === reqId
    );
    if (!req) return { success: false, error: '希望シフト申請が見つかりません' };
    const day = req.offDays.find(d => d.date === date);
    if (!day) return { success: false, error: '対象日が見つかりません' };
    day.status = status;
    day.reviewedAt = new Date().toISOString();
    day.reviewedBy = reviewedBy;
    day.rejectionReason = status === 'rejected' ? rejectionReason : undefined;
    return { success: true, data: undefined as unknown as T };
  }

  return { success: false, error: 'Unknown endpoint: ' + action };
}

// Authentication API (email + password)
export const authApi = {
  login: (email: string, password: string): Promise<ApiResponse<AuthResponse>> =>
    apiRequest('auth', { email, password }),

  // 後方互換: 統合ログインに収束しているため login を呼ぶだけ
  adminLogin: (email: string, password: string): Promise<ApiResponse<AuthResponse>> =>
    apiRequest('auth', { email, password }),

  // スタッフのセルフ登録。成功時は staffInfo + token を含む AuthResponse を返す
  // ので、呼び出し側で auto-login と同じフローに繋げる。
  register: (params: {
    name: string;
    email: string;
    password: string;
  }): Promise<ApiResponse<AuthResponse>> =>
    apiRequest('auth/register', params as unknown as Record<string, unknown>),
};

// Staff API
export const staffApi = {
  getList: (): Promise<ApiResponse<StaffInfo[]>> =>
    apiRequest('staff'),

  getDetails: (staffId: string): Promise<ApiResponse<Staff>> =>
    apiRequest('staff/detail', undefined, { staffId }),

  create: (staff: Omit<Staff, 'staffId'>): Promise<ApiResponse<{ staffId: string }>> =>
    apiRequest('staff', staff as unknown as Record<string, unknown>),

  update: (staffId: string, data: Partial<Staff>): Promise<ApiResponse<void>> =>
    apiRequest('staff/update', { staffId, ...data } as unknown as Record<string, unknown>),

  delete: (staffId: string): Promise<ApiResponse<void>> =>
    apiRequest('staff/delete', { staffId }),
};

// Attendance API (no GPS)
export const attendanceApi = {
  clock: (
    staffId: string,
    type: ClockType
  ): Promise<ApiResponse<{ success: boolean }>> => {
    const now = new Date();
    const timestamp = `${fmtDate(now)}T${fmtTime(now.getHours(), now.getMinutes())}:${String(now.getSeconds()).padStart(2, '0')}`;
    return apiRequest('clock', { staffId, type, timestamp });
  },

  getToday: (staffId: string): Promise<ApiResponse<TodayAttendance>> =>
    apiRequest('attendance/today', undefined, { staffId }),

  getMonthly: (
    staffId: string,
    year: number,
    month: number
  ): Promise<ApiResponse<AttendanceRecord[]>> =>
    apiRequest('attendance', undefined, {
      staffId,
      year: String(year),
      month: String(month),
    }),

  update: (
    date: string,
    staffId: string,
    field: string,
    value: string | number,
    options?: { reason?: string; editorId?: string; editorRole?: 'staff' | 'admin' }
  ): Promise<ApiResponse<void>> =>
    apiRequest('attendance/update', {
      date, staffId, field, value,
      reason: options?.reason,
      editorId: options?.editorId,
      editorRole: options?.editorRole || 'staff',
    }),

  getHistory: (params: { staffId?: string; date?: string }): Promise<ApiResponse<ClockEditHistory[]>> =>
    apiRequest('attendance/history', undefined, {
      ...(params.staffId ? { staffId: params.staffId } : {}),
      ...(params.date ? { date: params.date } : {}),
    }),
};

// Paid leave API
export const paidLeaveApi = {
  getBalance: (staffId: string): Promise<ApiResponse<PaidLeaveBalance>> =>
    apiRequest('paid-leave/balance', undefined, { staffId }),

  request: (staffId: string, leaveDate: string): Promise<ApiResponse<{ requestId: string }>> =>
    apiRequest('paid-leave/request', { staffId, leaveDate }),

  updateStatus: (
    requestId: string,
    status: 'approved' | 'rejected'
  ): Promise<ApiResponse<void>> =>
    apiRequest('paid-leave/update', { requestId, status }),

  getAll: (): Promise<ApiResponse<PaidLeaveRequest[]>> =>
    apiRequest('paid-leave/all'),
};

// Salary API
export const salaryApi = {
  get: (staffId: string, year: number, month: number): Promise<ApiResponse<SalaryRecord>> =>
    apiRequest('salary', undefined, {
      staffId,
      year: String(year),
      month: String(month),
    }),

  calculate: (year: number, month: number): Promise<ApiResponse<SalaryRecord[]>> =>
    apiRequest('salary/calculate', { year, month }),

  getPdf: (staffId: string, year: number, month: number): string =>
    `${API_BASE_URL}?action=salary/pdf&staffId=${staffId}&year=${year}&month=${month}`,

  getAllPdf: (year: number, month: number): string =>
    `${API_BASE_URL}?action=salary/pdf-all&year=${year}&month=${month}`,
};

// Incentive API
export const incentiveApi = {
  create: (
    staffId: string,
    year: number,
    month: number,
    itemName: string,
    amount: number,
    remarks?: string
  ): Promise<ApiResponse<void>> =>
    apiRequest('incentive', { staffId, year, month, itemName, amount, remarks }),

  getMonthly: (year: number, month: number): Promise<ApiResponse<Incentive[]>> =>
    apiRequest('incentive', undefined, {
      year: String(year),
      month: String(month),
    }),
};

// Tax API
export const taxApi = {
  update: (
    staffId: string,
    year: number,
    month: number,
    incomeTax: number,
    residentTax: number
  ): Promise<ApiResponse<void>> =>
    apiRequest('tax', { staffId, year, month, incomeTax, residentTax }),

  getMonthly: (year: number, month: number): Promise<ApiResponse<TaxManual[]>> =>
    apiRequest('tax', undefined, {
      year: String(year),
      month: String(month),
    }),
};

// Bulk Attendance API
export const bulkAttendanceApi = {
  save: (
    staffId: string,
    year: number,
    month: number,
    rows: BulkAttendanceRow[]
  ): Promise<ApiResponse<{ saved: number }>> =>
    apiRequest('attendance/bulk-save', {
      staffId,
      year,
      month,
      rows: rows as unknown as Record<string, unknown>[],
    } as unknown as Record<string, unknown>),

  get: (
    staffId: string,
    year: number,
    month: number
  ): Promise<ApiResponse<AttendanceRecord[]>> =>
    apiRequest('attendance/bulk-get', undefined, {
      staffId,
      year: String(year),
      month: String(month),
    }),
};

// Insurance rates API
export const insuranceApi = {
  get: (): Promise<ApiResponse<{ rates: InsuranceRates; history: InsuranceRates[] }>> =>
    apiRequest('insurance-rates'),

  update: (rates: Omit<InsuranceRates, 'updatedAt' | 'updatedBy'>): Promise<ApiResponse<void>> =>
    apiRequest('insurance-rates', rates as unknown as Record<string, unknown>),
};

// Applications API
export const applicationApi = {
  create: (params: {
    staffId: string;
    date: string;
    type: ApplicationType;
    reason: string;
    details?: Application['details'];
  }): Promise<ApiResponse<{ id: string }>> =>
    apiRequest('applications/create', params as unknown as Record<string, unknown>),

  list: (params?: {
    staffId?: string;
    status?: ApplicationStatus;
    yearMonth?: string;
  }): Promise<ApiResponse<Application[]>> =>
    apiRequest('applications/list', undefined, {
      ...(params?.staffId ? { staffId: params.staffId } : {}),
      ...(params?.status ? { status: params.status } : {}),
      ...(params?.yearMonth ? { yearMonth: params.yearMonth } : {}),
    }),

  approve: (id: string, reviewedBy: string): Promise<ApiResponse<void>> =>
    apiRequest('applications/approve', { id, reviewedBy }),

  reject: (id: string, reviewedBy: string, rejectionReason: string): Promise<ApiResponse<void>> =>
    apiRequest('applications/reject', { id, reviewedBy, rejectionReason }),
};

// Monthly Submission API
export const submissionApi = {
  submit: (staffId: string, yearMonth: string, remarks?: string): Promise<ApiResponse<void>> =>
    apiRequest('submissions/submit', { staffId, yearMonth, remarks }),

  getStatus: (staffId: string, yearMonth: string): Promise<ApiResponse<MonthlySubmission>> =>
    apiRequest('submissions/status', undefined, { staffId, yearMonth }),

  // 打刻ゲート / 提出期限アラートの状態を取得
  clockGate: (staffId: string): Promise<ApiResponse<ClockGate>> =>
    apiRequest('submissions/clock-gate', undefined, { staffId }),

  list: (params?: {
    yearMonth?: string;
    status?: SubmissionStatus;
  }): Promise<ApiResponse<MonthlySubmission[]>> =>
    apiRequest('submissions/list', undefined, {
      ...(params?.yearMonth ? { yearMonth: params.yearMonth } : {}),
      ...(params?.status ? { status: params.status } : {}),
    }),

  approve: (staffId: string, yearMonth: string, reviewedBy: string): Promise<ApiResponse<void>> =>
    apiRequest('submissions/approve', { staffId, yearMonth, reviewedBy }),

  reject: (
    staffId: string,
    yearMonth: string,
    reviewedBy: string,
    rejectionReason: string
  ): Promise<ApiResponse<void>> =>
    apiRequest('submissions/reject', { staffId, yearMonth, reviewedBy, rejectionReason }),
};

// Shifts API
export const shiftApi = {
  getStaffMonth: (
    staffId: string,
    year: number,
    month: number
  ): Promise<ApiResponse<{ exists: boolean; shifts: Shift[] }>> =>
    apiRequest('shifts/staff-month', undefined, {
      staffId,
      year: String(year),
      month: String(month),
    }),

  getMonthly: (year: number, month: number): Promise<ApiResponse<{ exists: boolean; shifts: Shift[] }>> =>
    apiRequest('shifts/monthly', undefined, {
      year: String(year),
      month: String(month),
    }),
};

// Password API
export const passwordApi = {
  change: (email: string, oldPassword: string, newPassword: string): Promise<ApiResponse<void>> =>
    apiRequest('password/change', { email, oldPassword, newPassword }),

  reset: (email: string, newPassword: string): Promise<ApiResponse<void>> =>
    apiRequest('password/reset', { email, newPassword }),
};

// Shift request API (希望休 申請)
export const shiftRequestApi = {
  // スタッフが提出。target_year_month は 'YYYY-MM'。offDays は希望休として申請する日のリスト。
  submit: (params: {
    staffId: string;
    targetYearMonth: string;
    offDays: import('../types').ShiftRequestOffDay[];
    remarks?: string;
  }): Promise<ApiResponse<{ id: string }>> =>
    apiRequest('shift-requests/submit', params as unknown as Record<string, unknown>),

  // 管理者が一覧取得（または該当スタッフのみ）。
  list: (params?: {
    staffId?: string;
    targetYearMonth?: string;
  }): Promise<ApiResponse<import('../types').ShiftRequest[]>> =>
    apiRequest('shift-requests/list', undefined, {
      ...(params?.staffId ? { staffId: params.staffId } : {}),
      ...(params?.targetYearMonth ? { targetYearMonth: params.targetYearMonth } : {}),
    }),

  // 管理者が日単位で承認/却下。
  // 行ベース格納のため staffId + targetYearMonth + date で行を特定する。
  // id ('SR-<staffId>-<yearMonth>' 形式) も後方互換のため送る。
  reviewDay: (params: {
    id: string;
    staffId: string;
    targetYearMonth: string;
    date: string;
    status: 'approved' | 'rejected';
    rejectionReason?: string;
    reviewedBy?: string;
  }): Promise<ApiResponse<void>> =>
    apiRequest('shift-requests/review-day', params as unknown as Record<string, unknown>),
};

// Admin management API (for super admin / setup)
export const adminApi = {
  list: (): Promise<ApiResponse<AdminInfo[]>> =>
    apiRequest('admins'),

  create: (params: { name: string; email: string; password: string }): Promise<ApiResponse<{ adminId: string }>> =>
    apiRequest('admins', params as unknown as Record<string, unknown>),

  update: (params: {
    adminId: string;
    name?: string;
    email?: string;
    password?: string;
  }): Promise<ApiResponse<void>> =>
    apiRequest('admins/update', params as unknown as Record<string, unknown>),

  delete: (adminId: string): Promise<ApiResponse<void>> =>
    apiRequest('admins/delete', { adminId }),
};

export default {
  auth: authApi,
  staff: staffApi,
  attendance: attendanceApi,
  bulkAttendance: bulkAttendanceApi,
  application: applicationApi,
  submission: submissionApi,
  shift: shiftApi,
  paidLeave: paidLeaveApi,
  salary: salaryApi,
  incentive: incentiveApi,
  tax: taxApi,
  insurance: insuranceApi,
  password: passwordApi,
  adminMgmt: adminApi,
};
