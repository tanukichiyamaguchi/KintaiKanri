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

// Admin PIN (in production, this should be handled by the backend)
const ADMIN_PIN = import.meta.env.VITE_ADMIN_PIN || '9999';

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

// GAS API uses action parameter, not REST routes
async function apiRequest<T>(
  action: string,
  method: 'GET' | 'POST' = 'GET',
  body?: Record<string, unknown>,
  queryParams?: Record<string, string>
): Promise<ApiResponse<T>> {
  if (DEMO_MODE) {
    return handleDemoRequest<T>(action, method, body, queryParams);
  }

  try {
    // Build URL with action parameter
    const url = new URL(API_BASE_URL);
    url.searchParams.set('action', action);

    // Add query params for GET requests
    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body && method === 'POST') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url.toString(), options);
    const data = await response.json();

    // GAS returns success flag in response body
    if (data.success) {
      return {
        success: true,
        data: data.data || data,
      };
    } else {
      return {
        success: false,
        error: data.error || 'An error occurred',
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

// Demo mode request handler
async function handleDemoRequest<T>(
  action: string,
  method: string,
  body?: Record<string, unknown>,
  queryParams?: Record<string, string>
): Promise<ApiResponse<T>> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 300));

  // Auth endpoint
  if (action === 'auth' && method === 'POST') {
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

  // Admin auth
  if (action === 'admin-auth' && method === 'POST') {
    const pinCode = body?.pinCode as string;
    if (pinCode === ADMIN_PIN) {
      return {
        success: true,
        data: { success: true, token: 'admin-token-' + Date.now() } as unknown as T,
      };
    }
    return { success: false, error: '管理者PINが正しくありません' };
  }

  // Get staff list
  if (action === 'staff' && method === 'GET') {
    return { success: true, data: mockStaff as unknown as T };
  }

  // Get staff details
  if (action === 'staff/detail' && method === 'GET') {
    const staffId = queryParams?.staffId;
    const staff = mockStaffDetails.find(s => s.staffId === staffId);
    if (staff) {
      return { success: true, data: staff as unknown as T };
    }
    return { success: false, error: 'Staff not found' };
  }

  // Create staff
  if (action === 'staff' && method === 'POST') {
    const newStaffId = 'S' + String(Date.now()).slice(-6);
    const newStaff: Staff = {
      staffId: newStaffId,
      name: body?.name as string,
      monthlySalary: Number(body?.monthlySalary) || 0,
      transportation: Number(body?.transportation) || 0,
      hireDate: (body?.hireDate as string) || '',
      birthDate: (body?.birthDate as string) || '',
      paidLeaveBalance: Number(body?.paidLeaveBalance) || 0,
      status: 'active',
    };
    mockStaffDetails.push(newStaff);
    mockStaff.push({
      staffId: newStaffId,
      name: newStaff.name,
      status: 'active',
    });
    return { success: true, data: { staffId: newStaffId } as unknown as T };
  }

  // Update staff
  if (action === 'staff/update' && method === 'POST') {
    const staffId = body?.staffId as string;
    const staffIndex = mockStaffDetails.findIndex(s => s.staffId === staffId);
    if (staffIndex !== -1) {
      mockStaffDetails[staffIndex] = {
        ...mockStaffDetails[staffIndex],
        ...body,
        staffId, // Preserve staffId
      } as Staff;
      const listIndex = mockStaff.findIndex(s => s.staffId === staffId);
      if (listIndex !== -1 && body?.name) {
        mockStaff[listIndex].name = body.name as string;
      }
      return { success: true, data: undefined as unknown as T };
    }
    return { success: false, error: 'Staff not found' };
  }

  // Delete staff
  if (action === 'staff/delete' && method === 'POST') {
    const staffId = body?.staffId as string;
    const staffIndex = mockStaffDetails.findIndex(s => s.staffId === staffId);
    if (staffIndex !== -1) {
      mockStaffDetails.splice(staffIndex, 1);
      const listIndex = mockStaff.findIndex(s => s.staffId === staffId);
      if (listIndex !== -1) {
        mockStaff.splice(listIndex, 1);
      }
      return { success: true, data: undefined as unknown as T };
    }
    return { success: false, error: 'Staff not found' };
  }

  // Clock endpoint
  if (action === 'clock' && method === 'POST') {
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
  if (action === 'attendance/today' && method === 'GET') {
    const staffId = queryParams?.staffId || '';

    const attendance = mockTodayRecords[staffId] || {
      status: 'not_started' as const,
      records: [],
    };

    return { success: true, data: attendance as unknown as T };
  }

  // Paid leave balance
  if (action === 'paid-leave/balance' && method === 'GET') {
    const staffId = queryParams?.staffId || '';
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
    apiRequest('auth', 'POST', { staffId, pinCode }),

  adminLogin: (pinCode: string): Promise<ApiResponse<{ success: boolean; token: string }>> =>
    apiRequest('admin-auth', 'POST', { pinCode }),

  verifyAdminPin: (pinCode: string): boolean => {
    // In demo mode, check against the configured admin PIN
    return pinCode === ADMIN_PIN;
  },
};

// Staff API - updated to use GAS action format
export const staffApi = {
  getList: (): Promise<ApiResponse<StaffInfo[]>> =>
    apiRequest('staff', 'GET'),

  getDetails: (staffId: string): Promise<ApiResponse<Staff>> =>
    apiRequest('staff/detail', 'GET', undefined, { staffId }),

  create: (staff: Omit<Staff, 'staffId'>): Promise<ApiResponse<{ staffId: string }>> =>
    apiRequest('staff', 'POST', staff as unknown as Record<string, unknown>),

  update: (staffId: string, data: Partial<Staff>): Promise<ApiResponse<void>> =>
    apiRequest('staff/update', 'POST', { staffId, ...data } as unknown as Record<string, unknown>),

  delete: (staffId: string): Promise<ApiResponse<void>> =>
    apiRequest('staff/delete', 'POST', { staffId }),
};

// Attendance API
export const attendanceApi = {
  clock: (
    staffId: string,
    type: ClockType,
    latitude?: number,
    longitude?: number
  ): Promise<ApiResponse<{ success: boolean }>> =>
    apiRequest('clock', 'POST', {
      staffId,
      type,
      latitude,
      longitude,
      timestamp: new Date().toISOString(),
    }),

  getToday: (staffId: string): Promise<ApiResponse<TodayAttendance>> =>
    apiRequest('attendance/today', 'GET', undefined, { staffId }),

  getMonthly: (
    staffId: string,
    year: number,
    month: number
  ): Promise<ApiResponse<AttendanceRecord[]>> =>
    apiRequest('attendance', 'GET', undefined, {
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
    apiRequest('attendance/update', 'POST', { date, staffId, field, value }),
};

// Paid leave API
export const paidLeaveApi = {
  getBalance: (staffId: string): Promise<ApiResponse<PaidLeaveBalance>> =>
    apiRequest('paid-leave/balance', 'GET', undefined, { staffId }),

  request: (staffId: string, leaveDate: string): Promise<ApiResponse<{ requestId: string }>> =>
    apiRequest('paid-leave/request', 'POST', { staffId, leaveDate }),

  updateStatus: (
    requestId: string,
    status: 'approved' | 'rejected'
  ): Promise<ApiResponse<void>> =>
    apiRequest('paid-leave/update', 'POST', { requestId, status }),

  getAll: (): Promise<ApiResponse<PaidLeaveRequest[]>> =>
    apiRequest('paid-leave/all', 'GET'),
};

// Salary API
export const salaryApi = {
  get: (staffId: string, year: number, month: number): Promise<ApiResponse<SalaryRecord>> =>
    apiRequest('salary', 'GET', undefined, {
      staffId,
      year: String(year),
      month: String(month),
    }),

  calculate: (year: number, month: number): Promise<ApiResponse<SalaryRecord[]>> =>
    apiRequest('salary/calculate', 'POST', { year, month }),

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
    apiRequest('incentive', 'POST', {
      staffId,
      year,
      month,
      itemName,
      amount,
      remarks,
    }),

  getMonthly: (year: number, month: number): Promise<ApiResponse<Incentive[]>> =>
    apiRequest('incentive', 'GET', undefined, {
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
    apiRequest('tax', 'POST', {
      staffId,
      year,
      month,
      incomeTax,
      residentTax,
    }),

  getMonthly: (year: number, month: number): Promise<ApiResponse<TaxManual[]>> =>
    apiRequest('tax', 'GET', undefined, {
      year: String(year),
      month: String(month),
    }),
};

// Insurance rates API
export const insuranceApi = {
  get: (): Promise<ApiResponse<{ rates: InsuranceRates; history: InsuranceRates[] }>> =>
    apiRequest('insurance-rates', 'GET'),

  update: (rates: Omit<InsuranceRates, 'updatedAt' | 'updatedBy'>): Promise<ApiResponse<void>> =>
    apiRequest('insurance-rates', 'POST', rates as unknown as Record<string, unknown>),
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
