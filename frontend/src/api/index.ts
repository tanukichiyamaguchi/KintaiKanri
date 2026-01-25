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
// Replace this with your actual deployed GAS URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// Demo mode flag - when true, uses mock data instead of real API
const DEMO_MODE = !API_BASE_URL || import.meta.env.VITE_DEMO_MODE === 'true';

// Mock data for demo mode
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
let mockTodayRecords: Record<string, TodayAttendance> = {};

async function apiRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: Record<string, unknown>
): Promise<ApiResponse<T>> {
  if (DEMO_MODE) {
    return handleDemoRequest<T>(endpoint, method, body);
  }

  try {
    const url = `${API_BASE_URL}${endpoint}`;
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    return {
      success: response.ok,
      data: response.ok ? data : undefined,
      error: response.ok ? undefined : data.error || 'An error occurred',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

// Demo mode request handler
async function handleDemoRequest<T>(
  endpoint: string,
  method: string,
  body?: Record<string, unknown>
): Promise<ApiResponse<T>> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 300));

  // Auth endpoint
  if (endpoint === '/auth' && method === 'POST') {
    const staffId = body?.staffId as string;
    const pinCode = body?.pinCode as string;
    const staff = mockStaff.find(s => s.staffId === staffId);

    // In demo mode, any 4-digit PIN works
    if (staff && pinCode?.length === 4) {
      return {
        success: true,
        data: {
          success: true,
          staffInfo: staff,
          token: 'demo-token-' + Date.now(),
        } as unknown as T,
      };
    }
    return { success: false, error: 'Invalid credentials' };
  }

  // Get staff list
  if (endpoint === '/admin/staff' && method === 'GET') {
    return { success: true, data: mockStaff as unknown as T };
  }

  // Get staff details
  if (endpoint.startsWith('/admin/staff/') && method === 'GET') {
    const staffId = endpoint.split('/').pop();
    const staff = mockStaffDetails.find(s => s.staffId === staffId);
    if (staff) {
      return { success: true, data: staff as unknown as T };
    }
    return { success: false, error: 'Staff not found' };
  }

  // Clock endpoint
  if (endpoint === '/clock' && method === 'POST') {
    const staffId = body?.staffId as string;
    const type = body?.type as ClockType;
    const timestamp = body?.timestamp as string || new Date().toISOString();

    if (!mockTodayRecords[staffId]) {
      mockTodayRecords[staffId] = {
        status: 'not_started',
        records: [],
      };
    }

    const record = mockTodayRecords[staffId];
    record.records.push({
      type,
      time: timestamp,
      latitude: body?.latitude as number,
      longitude: body?.longitude as number,
    });

    // Update status
    switch (type) {
      case 'clock_in':
        record.status = 'working';
        break;
      case 'break_start':
        record.status = 'on_break';
        break;
      case 'break_end':
        record.status = 'working';
        break;
      case 'clock_out':
      case 'early_leave_company':
      case 'early_leave_self':
        record.status = 'finished';
        break;
    }

    return { success: true, data: { success: true, record } as unknown as T };
  }

  // Today's attendance
  if (endpoint.includes('/attendance/today') && method === 'GET') {
    const urlParams = new URLSearchParams(endpoint.split('?')[1]);
    const staffId = urlParams.get('staffId') || '';

    const attendance = mockTodayRecords[staffId] || {
      status: 'not_started' as const,
      records: [],
    };

    return { success: true, data: attendance as unknown as T };
  }

  // Paid leave balance
  if (endpoint.includes('/paid-leave/balance') && method === 'GET') {
    const urlParams = new URLSearchParams(endpoint.split('?')[1]);
    const staffId = urlParams.get('staffId') || '';
    const staff = mockStaffDetails.find(s => s.staffId === staffId);

    return {
      success: true,
      data: {
        balance: staff?.paidLeaveBalance || 0,
        history: [],
      } as unknown as T,
    };
  }

  return { success: false, error: 'Endpoint not implemented in demo mode' };
}

// Authentication API
export const authApi = {
  login: (staffId: string, pinCode: string): Promise<ApiResponse<AuthResponse>> =>
    apiRequest('/auth', 'POST', { staffId, pinCode }),
};

// Staff API
export const staffApi = {
  getList: (): Promise<ApiResponse<StaffInfo[]>> =>
    apiRequest('/admin/staff'),

  getDetails: (staffId: string): Promise<ApiResponse<Staff>> =>
    apiRequest(`/admin/staff/${staffId}`),

  create: (staff: Omit<Staff, 'staffId'>): Promise<ApiResponse<{ staffId: string }>> =>
    apiRequest('/admin/staff', 'POST', staff as unknown as Record<string, unknown>),

  update: (staffId: string, data: Partial<Staff>): Promise<ApiResponse<void>> =>
    apiRequest(`/admin/staff/${staffId}`, 'PUT', data as unknown as Record<string, unknown>),

  delete: (staffId: string): Promise<ApiResponse<void>> =>
    apiRequest(`/admin/staff/${staffId}`, 'DELETE'),
};

// Attendance API
export const attendanceApi = {
  clock: (
    staffId: string,
    type: ClockType,
    latitude?: number,
    longitude?: number
  ): Promise<ApiResponse<{ success: boolean }>> =>
    apiRequest('/clock', 'POST', {
      staffId,
      type,
      latitude,
      longitude,
      timestamp: new Date().toISOString(),
    }),

  getToday: (staffId: string): Promise<ApiResponse<TodayAttendance>> =>
    apiRequest(`/attendance/today?staffId=${staffId}`),

  getMonthly: (
    staffId: string,
    year: number,
    month: number
  ): Promise<ApiResponse<AttendanceRecord[]>> =>
    apiRequest(`/attendance?staffId=${staffId}&year=${year}&month=${month}`),

  update: (
    date: string,
    staffId: string,
    field: string,
    value: string | number
  ): Promise<ApiResponse<void>> =>
    apiRequest('/admin/attendance', 'PUT', { date, staffId, field, value }),
};

// Paid leave API
export const paidLeaveApi = {
  getBalance: (staffId: string): Promise<ApiResponse<PaidLeaveBalance>> =>
    apiRequest(`/paid-leave/balance?staffId=${staffId}`),

  request: (staffId: string, leaveDate: string): Promise<ApiResponse<{ requestId: string }>> =>
    apiRequest('/paid-leave/request', 'POST', { staffId, leaveDate }),

  updateStatus: (
    requestId: string,
    status: 'approved' | 'rejected'
  ): Promise<ApiResponse<void>> =>
    apiRequest(`/admin/paid-leave/${requestId}`, 'PUT', { status }),

  getAll: (): Promise<ApiResponse<PaidLeaveRequest[]>> =>
    apiRequest('/admin/paid-leave'),
};

// Salary API
export const salaryApi = {
  get: (staffId: string, year: number, month: number): Promise<ApiResponse<SalaryRecord>> =>
    apiRequest(`/salary?staffId=${staffId}&year=${year}&month=${month}`),

  calculate: (year: number, month: number): Promise<ApiResponse<SalaryRecord[]>> =>
    apiRequest('/admin/salary/calculate', 'POST', { year, month }),

  getPdf: (staffId: string, year: number, month: number): string =>
    `${API_BASE_URL}/salary/pdf?staffId=${staffId}&year=${year}&month=${month}`,

  getAllPdf: (year: number, month: number): string =>
    `${API_BASE_URL}/admin/salary/pdf-all?year=${year}&month=${month}`,
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
    apiRequest('/admin/incentive', 'POST', {
      staffId,
      year,
      month,
      itemName,
      amount,
      remarks,
    }),

  getMonthly: (year: number, month: number): Promise<ApiResponse<Incentive[]>> =>
    apiRequest(`/admin/incentive?year=${year}&month=${month}`),
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
    apiRequest('/admin/tax', 'POST', {
      staffId,
      year,
      month,
      incomeTax,
      residentTax,
    }),

  getMonthly: (year: number, month: number): Promise<ApiResponse<TaxManual[]>> =>
    apiRequest(`/admin/tax?year=${year}&month=${month}`),
};

// Insurance rates API
export const insuranceApi = {
  get: (): Promise<ApiResponse<{ rates: InsuranceRates; history: InsuranceRates[] }>> =>
    apiRequest('/admin/insurance-rates'),

  update: (rates: Omit<InsuranceRates, 'updatedAt' | 'updatedBy'>): Promise<ApiResponse<void>> =>
    apiRequest('/admin/insurance-rates', 'POST', rates as unknown as Record<string, unknown>),
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
