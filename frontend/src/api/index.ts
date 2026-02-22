import type {
  ApiResponse,
  AuthResponse,
  StaffInfo,
  Staff,
  TodayAttendance,
  AttendanceRecord,
  ClockType,
  PaidLeaveRequest,
  PaidLeaveBalance,
  SalaryRecord,
  InsuranceRates,
  Incentive,
  TaxManual,
} from '../types';

// Base URL for the Google Apps Script Web App
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// Demo mode flag - when true, uses mock data instead of real API
const DEMO_MODE = !API_BASE_URL || import.meta.env.VITE_DEMO_MODE === 'true';

// Admin PIN (in production, this should be handled by the backend)
const ADMIN_PIN = import.meta.env.VITE_ADMIN_PIN || '9999';

// --- Helper: format date as YYYY-MM-DD in local timezone ---
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtTime(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// --- Mock data for demo mode ---
const mockStaff: StaffInfo[] = [
  { staffId: 'S001', name: '佐藤 花子', status: 'active' },
  { staffId: 'S002', name: '田中 太郎', status: 'active' },
  { staffId: 'S003', name: '山田 次郎', status: 'active' },
];

const mockStaffDetails: Staff[] = [
  {
    staffId: 'S001',
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
    name: '山田 次郎',
    monthlySalary: 220000,
    transportation: 10000,
    hireDate: '2023-06-01',
    paidLeaveBalance: 8,
    status: 'active',
    birthDate: '1995-11-08',
  },
];

// In-memory storage for demo mode
const mockTodayRecords: Record<string, TodayAttendance> = {};
const mockPaidLeaveRequests: PaidLeaveRequest[] = [];
const mockTaxManual: Record<string, TaxManual[]> = {};
const mockIncentives: Record<string, Incentive[]> = {};
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
    const breakStart = `${dateStr}T13:00:00`;
    const breakEnd = `${dateStr}T14:00:00`;
    const breakMinutes = 60;
    const workMinutes = (clockOutH * 60 + clockOutM) - (clockInH * 60 + clockInM) - breakMinutes;

    records.push({
      date: dateStr,
      staffId,
      name: staff.name,
      clockIn,
      clockOut,
      breakStart,
      breakEnd,
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

// GAS API - All requests use GET to avoid CORS issues
async function apiRequest<T>(
  action: string,
  body?: Record<string, unknown>,
  queryParams?: Record<string, string>
): Promise<ApiResponse<T>> {
  if (DEMO_MODE) {
    return handleDemoRequest<T>(action, body, queryParams);
  }

  try {
    const url = new URL(API_BASE_URL);
    url.searchParams.set('action', action);

    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    if (body) {
      url.searchParams.set('data', JSON.stringify(body));
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

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

  // --- Auth ---
  if (action === 'auth') {
    const staffId = body?.staffId as string;
    const pinCode = body?.pinCode as string;
    const staff = mockStaff.find(s => s.staffId === staffId);
    if (staff && pinCode?.length === 4) {
      return {
        success: true,
        data: { success: true, staffInfo: staff, token: 'demo-token-' + Date.now() } as unknown as T,
      };
    }
    return { success: false, error: 'PINコードが正しくありません' };
  }

  if (action === 'admin-auth') {
    const pinCode = body?.pinCode as string;
    if (pinCode === ADMIN_PIN) {
      return {
        success: true,
        data: { success: true, token: 'admin-token-' + Date.now() } as unknown as T,
      };
    }
    return { success: false, error: '管理者PINが正しくありません' };
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
      name: body.name as string,
      monthlySalary: Number(body.monthlySalary) || 0,
      transportation: Number(body.transportation) || 0,
      hireDate: (body.hireDate as string) || '',
      birthDate: (body.birthDate as string) || '',
      paidLeaveBalance: Number(body.paidLeaveBalance) || 0,
      status: 'active',
    };
    mockStaffDetails.push(newStaff);
    mockStaff.push({ staffId: newStaffId, name: newStaff.name, status: 'active' });
    return { success: true, data: { staffId: newStaffId } as unknown as T };
  }

  if (action === 'staff/update') {
    const staffId = body?.staffId as string;
    const idx = mockStaffDetails.findIndex(s => s.staffId === staffId);
    if (idx !== -1) {
      mockStaffDetails[idx] = { ...mockStaffDetails[idx], ...body, staffId } as Staff;
      const listIdx = mockStaff.findIndex(s => s.staffId === staffId);
      if (listIdx !== -1 && body?.name) mockStaff[listIdx].name = body.name as string;
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

  // --- Clock ---
  if (action === 'clock') {
    const staffId = body?.staffId as string;
    const type = body?.type as ClockType;
    const now = new Date();
    const timestamp = `${fmtDate(now)}T${fmtTime(now.getHours(), now.getMinutes())}:${String(now.getSeconds()).padStart(2, '0')}`;

    if (!mockTodayRecords[staffId]) {
      mockTodayRecords[staffId] = { status: 'not_started', records: [] };
    }

    const record = mockTodayRecords[staffId];
    record.records.push({
      type,
      time: timestamp,
      latitude: body?.latitude as number,
      longitude: body?.longitude as number,
    });

    switch (type) {
      case 'clock_in': record.status = 'working'; break;
      case 'break_start': record.status = 'on_break'; break;
      case 'break_end': record.status = 'working'; break;
      case 'clock_out':
      case 'early_leave_company':
      case 'early_leave_self':
        record.status = 'finished'; break;
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

  return { success: false, error: 'Unknown endpoint: ' + action };
}

// Authentication API
export const authApi = {
  login: (staffId: string, pinCode: string): Promise<ApiResponse<AuthResponse>> =>
    apiRequest('auth', { staffId, pinCode }),

  adminLogin: (pinCode: string): Promise<ApiResponse<{ success: boolean; token: string }>> =>
    apiRequest('admin-auth', { pinCode }),

  verifyAdminPin: (pinCode: string): boolean => {
    return pinCode === ADMIN_PIN;
  },
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

// Attendance API
export const attendanceApi = {
  clock: (
    staffId: string,
    type: ClockType,
    latitude?: number,
    longitude?: number
  ): Promise<ApiResponse<{ success: boolean }>> => {
    const now = new Date();
    const timestamp = `${fmtDate(now)}T${fmtTime(now.getHours(), now.getMinutes())}:${String(now.getSeconds()).padStart(2, '0')}`;
    return apiRequest('clock', { staffId, type, latitude, longitude, timestamp });
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
    value: string | number
  ): Promise<ApiResponse<void>> =>
    apiRequest('attendance/update', { date, staffId, field, value }),
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

// Insurance rates API
export const insuranceApi = {
  get: (): Promise<ApiResponse<{ rates: InsuranceRates; history: InsuranceRates[] }>> =>
    apiRequest('insurance-rates'),

  update: (rates: Omit<InsuranceRates, 'updatedAt' | 'updatedBy'>): Promise<ApiResponse<void>> =>
    apiRequest('insurance-rates', rates as unknown as Record<string, unknown>),
};

export default {
  auth: authApi,
  staff: staffApi,
  attendance: attendanceApi,
  paidLeave: paidLeaveApi,
  salary: salaryApi,
  incentive: incentiveApi,
  tax: taxApi,
  insurance: insuranceApi,
};
