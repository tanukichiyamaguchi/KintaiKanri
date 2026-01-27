/**
 * KATEstageLASH 勤怠管理システム - Google Apps Script Backend
 *
 * Setup Instructions:
 * 1. Create a new Google Spreadsheet
 * 2. Go to Extensions > Apps Script
 * 3. Copy this code into the Apps Script editor
 * 4. Set up the SPREADSHEET_ID constant below
 * 5. Run setupSystem() function once to initialize all sheets
 * 6. Deploy as Web App (Execute as: Me, Who has access: Anyone)
 */

// Configuration
const SPREADSHEET_ID = ''; // Set your spreadsheet ID here
const WEEKLY_HOURS = 44; // Beauty industry special measure
const ADMIN_PIN = '9999'; // Admin PIN code - CHANGE THIS IN PRODUCTION

// Sheet names
const SHEETS = {
  STAFF_MASTER: 'staff_master',
  PAID_LEAVE: 'paid_leave',
  INSURANCE_RATES: 'insurance_rates',
  STANDARD_REMUNERATION: 'standard_remuneration',
};

/**
 * 初期セットアップ - この関数を一度実行してすべてのシートを作成
 * Run this function once to set up all sheets
 */
function setupSystem() {
  const ss = getSpreadsheet();

  // Create all master sheets
  const sheetsToCreate = [
    {
      name: SHEETS.STAFF_MASTER,
      headers: ['staff_id', 'name', 'pin_code', 'monthly_salary', 'transportation', 'hire_date', 'paid_leave_balance', 'status', 'birth_date']
    },
    {
      name: SHEETS.PAID_LEAVE,
      headers: ['id', 'staff_id', 'name', 'request_date', 'leave_date', 'status', 'approved_date', 'remarks']
    },
    {
      name: SHEETS.INSURANCE_RATES,
      headers: ['effective_date', 'health_insurance_rate', 'nursing_insurance_rate', 'pension_rate', 'employment_insurance_rate', 'updated_at', 'updated_by']
    },
    {
      name: SHEETS.STANDARD_REMUNERATION,
      headers: ['grade', 'monthly_min', 'monthly_max', 'standard_monthly']
    }
  ];

  for (const sheetInfo of sheetsToCreate) {
    let sheet = ss.getSheetByName(sheetInfo.name);
    if (!sheet) {
      sheet = ss.insertSheet(sheetInfo.name);
      Logger.log('Created sheet: ' + sheetInfo.name);
    }

    // Set headers if row 1 is empty
    const firstRow = sheet.getRange(1, 1, 1, sheetInfo.headers.length).getValues()[0];
    if (!firstRow[0]) {
      sheet.getRange(1, 1, 1, sheetInfo.headers.length).setValues([sheetInfo.headers]);
      Logger.log('Added headers to: ' + sheetInfo.name);
    }
  }

  // Add default insurance rates if none exist
  const insuranceSheet = ss.getSheetByName(SHEETS.INSURANCE_RATES);
  const insuranceData = insuranceSheet.getDataRange().getValues();
  if (insuranceData.length <= 1) {
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    insuranceSheet.appendRow([today, 4.905, 0.80, 9.15, 0.60, new Date().toISOString(), 'System']);
    Logger.log('Added default insurance rates');
  }

  Logger.log('System setup complete!');
  return { success: true, message: 'System setup complete!' };
}

/**
 * テスト用スタッフを追加（PIN: 1234）
 * Run this to add a test staff member with PIN 1234
 */
function addTestStaff() {
  const sheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const testPin = hashPin('1234');

  // Check if test staff already exists
  const data = sheetToObjects(sheet);
  if (data.find(s => s.staff_id === 'S000001')) {
    Logger.log('Test staff already exists');
    return { success: false, message: 'Test staff already exists' };
  }

  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  sheet.appendRow(['S000001', 'テストスタッフ', testPin, 250000, 15000, today, 10, 'active', '1990-01-01']);

  Logger.log('Test staff added! Staff ID: S000001, PIN: 1234');
  return { success: true, message: 'Test staff added! Staff ID: S000001, PIN: 1234' };
}

/**
 * PINコードをハッシュ化するテスト用関数
 */
function testHashPin() {
  const pins = ['1234', '0000', '9999'];
  for (const pin of pins) {
    Logger.log('PIN ' + pin + ' -> ' + hashPin(pin));
  }
}

// Get spreadsheet
function getSpreadsheet() {
  if (!SPREADSHEET_ID) {
    throw new Error('SPREADSHEET_ID is not configured. Please set your spreadsheet ID.');
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

// Get or create sheet
function getOrCreateSheet(sheetName) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    initializeSheet(sheet, sheetName);
  }
  return sheet;
}

// Initialize sheet with headers
function initializeSheet(sheet, sheetName) {
  const headers = {
    [SHEETS.STAFF_MASTER]: [
      'staff_id', 'name', 'pin_code', 'monthly_salary', 'transportation',
      'hire_date', 'paid_leave_balance', 'status', 'birth_date'
    ],
    [SHEETS.PAID_LEAVE]: [
      'id', 'staff_id', 'name', 'request_date', 'leave_date',
      'status', 'approved_date', 'remarks'
    ],
    [SHEETS.INSURANCE_RATES]: [
      'effective_date', 'health_insurance_rate', 'nursing_insurance_rate',
      'pension_rate', 'employment_insurance_rate', 'updated_at', 'updated_by'
    ],
    [SHEETS.STANDARD_REMUNERATION]: [
      'grade', 'monthly_min', 'monthly_max', 'standard_monthly'
    ],
  };

  if (headers[sheetName]) {
    sheet.getRange(1, 1, 1, headers[sheetName].length).setValues([headers[sheetName]]);
  }
}

// Get attendance sheet for a specific month
function getAttendanceSheet(year, month) {
  const sheetName = `attendance_${year}${String(month).padStart(2, '0')}`;
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const headers = [
      'date', 'staff_id', 'name', 'clock_in', 'clock_out', 'clock_out_type',
      'break_start', 'break_end', 'break_minutes', 'work_minutes',
      'late_minutes', 'early_leave_minutes', 'clock_in_lat', 'clock_in_lng',
      'clock_out_lat', 'clock_out_lng', 'is_holiday', 'remarks'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sheet;
}

// Get salary sheet for a specific month
function getSalarySheet(year, month) {
  const sheetName = `salary_${year}${String(month).padStart(2, '0')}`;
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const headers = [
      'staff_id', 'name', 'base_salary', 'total_work_hours', 'overtime_hours',
      'night_hours', 'holiday_hours', 'overtime_pay', 'night_pay', 'holiday_pay',
      'transportation', 'incentive', 'gross_pay', 'late_deduction',
      'early_leave_deduction', 'health_insurance', 'nursing_insurance',
      'pension', 'employment_insurance', 'income_tax', 'resident_tax',
      'total_deduction', 'net_pay'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sheet;
}

// Get tax manual sheet for a specific month
function getTaxSheet(year, month) {
  const sheetName = `tax_manual_${year}${String(month).padStart(2, '0')}`;
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const headers = ['staff_id', 'name', 'income_tax', 'resident_tax', 'updated_at'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sheet;
}

// Get incentive sheet for a specific month
function getIncentiveSheet(year, month) {
  const sheetName = `incentive_${year}${String(month).padStart(2, '0')}`;
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const headers = ['staff_id', 'name', 'item_name', 'amount', 'remarks'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sheet;
}

// Hash PIN code using SHA-256
function hashPin(pin) {
  const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pin);
  return rawHash.map(byte => {
    const hex = (byte < 0 ? byte + 256 : byte).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

// Generate unique ID
function generateId() {
  return Utilities.getUuid();
}

// Convert sheet data to array of objects
function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

// Find row index by column value
function findRowIndex(sheet, column, value) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colIndex = headers.indexOf(column);

  if (colIndex === -1) return -1;

  for (let i = 1; i < data.length; i++) {
    if (data[i][colIndex] === value) {
      return i + 1; // 1-indexed
    }
  }
  return -1;
}

// Web App entry points
function doGet(e) {
  return handleRequest(e, 'GET');
}

function doPost(e) {
  return handleRequest(e, 'POST');
}

function handleRequest(e, method) {
  // Set CORS headers
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    const path = e.parameter.action || e.pathInfo || '';
    let body = {};

    // Parse body from POST request or from 'data' query parameter (for GET requests to avoid CORS)
    if (method === 'POST' && e.postData) {
      body = JSON.parse(e.postData.contents);
    } else if (e.parameter.data) {
      // Support GET requests with data parameter to avoid CORS preflight issues
      try {
        body = JSON.parse(e.parameter.data);
      } catch (parseError) {
        Logger.log('Failed to parse data parameter: ' + parseError.message);
      }
    }

    const params = e.parameter;
    const hasBody = Object.keys(body).length > 0;

    // Route the request
    let result;

    switch (path) {
      // Authentication
      case 'auth':
        result = handleAuth(body);
        break;

      // Admin Authentication
      case 'admin-auth':
        result = handleAdminAuth(body);
        break;

      // Clock operations
      case 'clock':
        result = handleClock(body);
        break;

      // Attendance
      case 'attendance/today':
        result = handleGetTodayAttendance(params);
        break;
      case 'attendance':
        result = handleGetAttendance(params);
        break;
      case 'attendance/update':
        result = handleUpdateAttendance(body);
        break;

      // Staff
      case 'staff':
        if (hasBody) {
          result = handleCreateStaff(body);
        } else {
          result = handleGetStaffList();
        }
        break;
      case 'staff/detail':
        result = handleGetStaffDetail(params);
        break;
      case 'staff/update':
        result = handleUpdateStaff(body);
        break;
      case 'staff/delete':
        result = handleDeleteStaff(body);
        break;

      // Paid leave
      case 'paid-leave/balance':
        result = handleGetPaidLeaveBalance(params);
        break;
      case 'paid-leave/request':
        result = handlePaidLeaveRequest(body);
        break;
      case 'paid-leave/all':
        result = handleGetAllPaidLeave();
        break;
      case 'paid-leave/update':
        result = handleUpdatePaidLeaveStatus(body);
        break;

      // Salary
      case 'salary':
        result = handleGetSalary(params);
        break;
      case 'salary/calculate':
        result = handleCalculateSalary(body);
        break;

      // Tax
      case 'tax':
        if (hasBody) {
          result = handleUpdateTax(body);
        } else {
          result = handleGetTax(params);
        }
        break;

      // Incentive
      case 'incentive':
        if (hasBody) {
          result = handleCreateIncentive(body);
        } else {
          result = handleGetIncentive(params);
        }
        break;

      // Insurance rates
      case 'insurance-rates':
        if (hasBody) {
          result = handleUpdateInsuranceRates(body);
        } else {
          result = handleGetInsuranceRates();
        }
        break;

      // Setup - initialize system
      case 'setup':
        result = setupSystem();
        break;

      default:
        result = { success: false, error: 'Unknown action: ' + path };
    }

    output.setContent(JSON.stringify(result));

  } catch (error) {
    output.setContent(JSON.stringify({
      success: false,
      error: error.message
    }));
  }

  return output;
}

// Handler functions

function handleAdminAuth(body) {
  const { pinCode } = body;

  if (!pinCode) {
    return { success: false, error: 'Missing pinCode' };
  }

  if (pinCode !== ADMIN_PIN) {
    return { success: false, error: '管理者PINが正しくありません' };
  }

  return {
    success: true,
    token: generateId()
  };
}

function handleAuth(body) {
  const { staffId, pinCode } = body;

  if (!staffId || !pinCode) {
    return { success: false, error: 'Missing staffId or pinCode' };
  }

  const sheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staffData = sheetToObjects(sheet);
  const staff = staffData.find(s => s.staff_id === staffId);

  if (!staff) {
    return { success: false, error: 'Staff not found' };
  }

  if (staff.status !== 'active') {
    return { success: false, error: 'Staff is not active' };
  }

  const hashedPin = hashPin(pinCode);
  if (staff.pin_code !== hashedPin) {
    return { success: false, error: 'Invalid PIN code' };
  }

  return {
    success: true,
    staffInfo: {
      staffId: staff.staff_id,
      name: staff.name,
      status: staff.status
    },
    token: generateId()
  };
}

function handleClock(body) {
  const { staffId, type, latitude, longitude, timestamp } = body;

  if (!staffId || !type) {
    return { success: false, error: 'Missing required fields' };
  }

  const now = timestamp ? new Date(timestamp) : new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  const sheet = getAttendanceSheet(year, month);
  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staffData = sheetToObjects(staffSheet);
  const staff = staffData.find(s => s.staff_id === staffId);

  if (!staff) {
    return { success: false, error: 'Staff not found' };
  }

  // Find or create today's record
  let rowIndex = -1;
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === dateStr && data[i][1] === staffId) {
      rowIndex = i + 1;
      break;
    }
  }

  const timeStr = now.toISOString();

  if (rowIndex === -1) {
    // Create new record
    const newRow = [
      dateStr, staffId, staff.name, '', '', '', '', '', 0, 0, 0, 0,
      '', '', '', '', false, ''
    ];

    // Set values based on type
    if (type === 'clock_in') {
      newRow[3] = timeStr; // clock_in
      newRow[12] = latitude || ''; // clock_in_lat
      newRow[13] = longitude || ''; // clock_in_lng
    }

    sheet.appendRow(newRow);
    rowIndex = sheet.getLastRow();
  } else {
    // Update existing record
    const colMap = {
      'clock_in': 4, 'clock_out': 5, 'clock_out_type': 6,
      'break_start': 7, 'break_end': 8
    };

    if (type === 'clock_in') {
      sheet.getRange(rowIndex, 4).setValue(timeStr);
      sheet.getRange(rowIndex, 13).setValue(latitude || '');
      sheet.getRange(rowIndex, 14).setValue(longitude || '');
    } else if (type === 'clock_out' || type === 'early_leave_company' || type === 'early_leave_self') {
      sheet.getRange(rowIndex, 5).setValue(timeStr);
      sheet.getRange(rowIndex, 6).setValue(
        type === 'clock_out' ? 'normal' :
        type === 'early_leave_company' ? 'early_company' : 'early_self'
      );
      sheet.getRange(rowIndex, 15).setValue(latitude || '');
      sheet.getRange(rowIndex, 16).setValue(longitude || '');

      // Calculate work minutes
      const clockIn = sheet.getRange(rowIndex, 4).getValue();
      if (clockIn) {
        const startTime = new Date(clockIn);
        const endTime = now;
        const breakMinutes = sheet.getRange(rowIndex, 9).getValue() || 0;
        const workMinutes = Math.floor((endTime - startTime) / 60000) - breakMinutes;
        sheet.getRange(rowIndex, 10).setValue(workMinutes);
      }
    } else if (type === 'break_start') {
      sheet.getRange(rowIndex, 7).setValue(timeStr);
    } else if (type === 'break_end') {
      sheet.getRange(rowIndex, 8).setValue(timeStr);
      // Calculate break minutes
      const breakStart = sheet.getRange(rowIndex, 7).getValue();
      if (breakStart) {
        const startTime = new Date(breakStart);
        const breakMinutes = Math.floor((now - startTime) / 60000);
        sheet.getRange(rowIndex, 9).setValue(breakMinutes);
      }
    }
  }

  return { success: true };
}

function handleGetTodayAttendance(params) {
  const staffId = params.staffId;

  if (!staffId) {
    return { success: false, error: 'Missing staffId' };
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  const sheet = getAttendanceSheet(year, month);
  const data = sheetToObjects(sheet);
  const todayRecord = data.find(r => r.date === dateStr && r.staff_id === staffId);

  if (!todayRecord) {
    return {
      success: true,
      data: {
        status: 'not_started',
        records: []
      }
    };
  }

  // Build records array
  const records = [];
  if (todayRecord.clock_in) {
    records.push({ type: 'clock_in', time: todayRecord.clock_in });
  }
  if (todayRecord.break_start) {
    records.push({ type: 'break_start', time: todayRecord.break_start });
  }
  if (todayRecord.break_end) {
    records.push({ type: 'break_end', time: todayRecord.break_end });
  }
  if (todayRecord.clock_out) {
    const clockOutType = todayRecord.clock_out_type === 'early_company' ? 'early_leave_company' :
                         todayRecord.clock_out_type === 'early_self' ? 'early_leave_self' : 'clock_out';
    records.push({ type: clockOutType, time: todayRecord.clock_out });
  }

  // Determine status
  let status = 'not_started';
  if (todayRecord.clock_out) {
    status = 'finished';
  } else if (todayRecord.break_start && !todayRecord.break_end) {
    status = 'on_break';
  } else if (todayRecord.clock_in) {
    status = 'working';
  }

  return {
    success: true,
    data: {
      status,
      records,
      currentRecord: todayRecord
    }
  };
}

function handleGetAttendance(params) {
  const { staffId, year, month } = params;

  if (!staffId || !year || !month) {
    return { success: false, error: 'Missing required parameters' };
  }

  const sheet = getAttendanceSheet(parseInt(year), parseInt(month));
  const data = sheetToObjects(sheet);
  const staffRecords = data.filter(r => r.staff_id === staffId);

  return {
    success: true,
    data: staffRecords.map(r => ({
      date: r.date,
      staffId: r.staff_id,
      name: r.name,
      clockIn: r.clock_in,
      clockOut: r.clock_out,
      clockOutType: r.clock_out_type,
      breakStart: r.break_start,
      breakEnd: r.break_end,
      breakMinutes: r.break_minutes || 0,
      workMinutes: r.work_minutes || 0,
      lateMinutes: r.late_minutes || 0,
      earlyLeaveMinutes: r.early_leave_minutes || 0,
      isHoliday: r.is_holiday === true || r.is_holiday === 'TRUE',
      remarks: r.remarks
    }))
  };
}

function handleGetStaffList() {
  const sheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const data = sheetToObjects(sheet);

  return {
    success: true,
    data: data.map(s => ({
      staffId: s.staff_id,
      name: s.name,
      status: s.status
    }))
  };
}

function handleGetStaffDetail(params) {
  const staffId = params.staffId;

  if (!staffId) {
    return { success: false, error: 'Missing staffId' };
  }

  const sheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const data = sheetToObjects(sheet);
  const staff = data.find(s => s.staff_id === staffId);

  if (!staff) {
    return { success: false, error: 'Staff not found' };
  }

  return {
    success: true,
    data: {
      staffId: staff.staff_id,
      name: staff.name,
      monthlySalary: staff.monthly_salary,
      transportation: staff.transportation,
      hireDate: staff.hire_date,
      paidLeaveBalance: staff.paid_leave_balance,
      status: staff.status,
      birthDate: staff.birth_date
    }
  };
}

function handleCreateStaff(body) {
  const { name, pinCode, monthlySalary, transportation, hireDate, birthDate, paidLeaveBalance } = body;

  if (!name || !pinCode) {
    return { success: false, error: 'Missing required fields (name and pinCode are required)' };
  }

  const sheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staffId = 'S' + String(Date.now()).slice(-6);
  const hashedPin = hashPin(pinCode);

  sheet.appendRow([
    staffId, name, hashedPin, monthlySalary || 0, transportation || 0,
    hireDate || '', paidLeaveBalance || 0, 'active', birthDate || ''
  ]);

  return { success: true, staffId };
}

function handleUpdateStaff(body) {
  const { staffId, ...updates } = body;

  if (!staffId) {
    return { success: false, error: 'Missing staffId' };
  }

  const sheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const rowIndex = findRowIndex(sheet, 'staff_id', staffId);

  if (rowIndex === -1) {
    return { success: false, error: 'Staff not found' };
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const columnMap = {
    name: headers.indexOf('name') + 1,
    monthlySalary: headers.indexOf('monthly_salary') + 1,
    transportation: headers.indexOf('transportation') + 1,
    hireDate: headers.indexOf('hire_date') + 1,
    paidLeaveBalance: headers.indexOf('paid_leave_balance') + 1,
    status: headers.indexOf('status') + 1,
    birthDate: headers.indexOf('birth_date') + 1
  };

  Object.keys(updates).forEach(key => {
    if (key === 'pinCode' && updates[key]) {
      const pinCol = headers.indexOf('pin_code') + 1;
      sheet.getRange(rowIndex, pinCol).setValue(hashPin(updates[key]));
    } else if (columnMap[key]) {
      sheet.getRange(rowIndex, columnMap[key]).setValue(updates[key]);
    }
  });

  return { success: true };
}

function handleDeleteStaff(body) {
  const { staffId } = body;

  if (!staffId) {
    return { success: false, error: 'Missing staffId' };
  }

  const sheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const rowIndex = findRowIndex(sheet, 'staff_id', staffId);

  if (rowIndex === -1) {
    return { success: false, error: 'Staff not found' };
  }

  // Soft delete - set status to inactive
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const statusCol = headers.indexOf('status') + 1;
  sheet.getRange(rowIndex, statusCol).setValue('inactive');

  return { success: true };
}

function handleGetPaidLeaveBalance(params) {
  const staffId = params.staffId;

  if (!staffId) {
    return { success: false, error: 'Missing staffId' };
  }

  // Get balance from staff master
  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staffData = sheetToObjects(staffSheet);
  const staff = staffData.find(s => s.staff_id === staffId);

  if (!staff) {
    return { success: false, error: 'Staff not found' };
  }

  // Get history
  const leaveSheet = getOrCreateSheet(SHEETS.PAID_LEAVE);
  const leaveData = sheetToObjects(leaveSheet);
  const history = leaveData.filter(l => l.staff_id === staffId);

  return {
    success: true,
    data: {
      balance: staff.paid_leave_balance || 0,
      history: history.map(h => ({
        id: h.id,
        staffId: h.staff_id,
        name: h.name,
        requestDate: h.request_date,
        leaveDate: h.leave_date,
        status: h.status,
        approvedDate: h.approved_date,
        remarks: h.remarks
      }))
    }
  };
}

function handlePaidLeaveRequest(body) {
  const { staffId, leaveDate } = body;

  if (!staffId || !leaveDate) {
    return { success: false, error: 'Missing required fields' };
  }

  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staffData = sheetToObjects(staffSheet);
  const staff = staffData.find(s => s.staff_id === staffId);

  if (!staff) {
    return { success: false, error: 'Staff not found' };
  }

  const sheet = getOrCreateSheet(SHEETS.PAID_LEAVE);
  const requestId = generateId();
  const now = new Date().toISOString();

  sheet.appendRow([
    requestId, staffId, staff.name, now, leaveDate, 'pending', '', ''
  ]);

  return { success: true, requestId };
}

function handleGetAllPaidLeave() {
  const sheet = getOrCreateSheet(SHEETS.PAID_LEAVE);
  const data = sheetToObjects(sheet);

  return {
    success: true,
    data: data.map(l => ({
      id: l.id,
      staffId: l.staff_id,
      name: l.name,
      requestDate: l.request_date,
      leaveDate: l.leave_date,
      status: l.status,
      approvedDate: l.approved_date,
      remarks: l.remarks
    }))
  };
}

function handleUpdatePaidLeaveStatus(body) {
  const { requestId, status } = body;

  if (!requestId || !status) {
    return { success: false, error: 'Missing required fields' };
  }

  const sheet = getOrCreateSheet(SHEETS.PAID_LEAVE);
  const rowIndex = findRowIndex(sheet, 'id', requestId);

  if (rowIndex === -1) {
    return { success: false, error: 'Request not found' };
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const statusCol = headers.indexOf('status') + 1;
  const approvedCol = headers.indexOf('approved_date') + 1;

  sheet.getRange(rowIndex, statusCol).setValue(status);

  if (status === 'approved') {
    sheet.getRange(rowIndex, approvedCol).setValue(new Date().toISOString());

    // Decrease paid leave balance
    const staffIdCol = headers.indexOf('staff_id') + 1;
    const staffId = sheet.getRange(rowIndex, staffIdCol).getValue();

    const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
    const staffRowIndex = findRowIndex(staffSheet, 'staff_id', staffId);

    if (staffRowIndex !== -1) {
      const staffHeaders = staffSheet.getRange(1, 1, 1, staffSheet.getLastColumn()).getValues()[0];
      const balanceCol = staffHeaders.indexOf('paid_leave_balance') + 1;
      const currentBalance = staffSheet.getRange(staffRowIndex, balanceCol).getValue() || 0;
      staffSheet.getRange(staffRowIndex, balanceCol).setValue(currentBalance - 1);
    }
  }

  return { success: true };
}

function handleGetInsuranceRates() {
  const sheet = getOrCreateSheet(SHEETS.INSURANCE_RATES);
  const data = sheetToObjects(sheet);

  // Sort by effective_date descending
  data.sort((a, b) => String(b.effective_date).localeCompare(String(a.effective_date)));

  const currentRates = data.length > 0 ? data[0] : null;

  return {
    success: true,
    data: {
      rates: currentRates ? {
        effectiveDate: currentRates.effective_date,
        healthInsuranceRate: currentRates.health_insurance_rate,
        nursingInsuranceRate: currentRates.nursing_insurance_rate,
        pensionRate: currentRates.pension_rate,
        employmentInsuranceRate: currentRates.employment_insurance_rate
      } : null,
      history: data.map(r => ({
        effectiveDate: r.effective_date,
        healthInsuranceRate: r.health_insurance_rate,
        nursingInsuranceRate: r.nursing_insurance_rate,
        pensionRate: r.pension_rate,
        employmentInsuranceRate: r.employment_insurance_rate,
        updatedAt: r.updated_at,
        updatedBy: r.updated_by
      }))
    }
  };
}

function handleUpdateInsuranceRates(body) {
  const { effectiveDate, healthInsuranceRate, nursingInsuranceRate, pensionRate, employmentInsuranceRate } = body;

  if (!effectiveDate) {
    return { success: false, error: 'Missing effectiveDate' };
  }

  const sheet = getOrCreateSheet(SHEETS.INSURANCE_RATES);
  const rowIndex = findRowIndex(sheet, 'effective_date', effectiveDate);

  const now = new Date().toISOString();

  if (rowIndex !== -1) {
    // Update existing
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    sheet.getRange(rowIndex, headers.indexOf('health_insurance_rate') + 1).setValue(healthInsuranceRate);
    sheet.getRange(rowIndex, headers.indexOf('nursing_insurance_rate') + 1).setValue(nursingInsuranceRate);
    sheet.getRange(rowIndex, headers.indexOf('pension_rate') + 1).setValue(pensionRate);
    sheet.getRange(rowIndex, headers.indexOf('employment_insurance_rate') + 1).setValue(employmentInsuranceRate);
    sheet.getRange(rowIndex, headers.indexOf('updated_at') + 1).setValue(now);
  } else {
    // Insert new
    sheet.appendRow([
      effectiveDate, healthInsuranceRate, nursingInsuranceRate,
      pensionRate, employmentInsuranceRate, now, ''
    ]);
  }

  return { success: true };
}

function handleGetTax(params) {
  const { year, month } = params;

  if (!year || !month) {
    return { success: false, error: 'Missing required parameters' };
  }

  const sheet = getTaxSheet(parseInt(year), parseInt(month));
  const data = sheetToObjects(sheet);

  return {
    success: true,
    data: data.map(t => ({
      staffId: t.staff_id,
      name: t.name,
      incomeTax: t.income_tax || 0,
      residentTax: t.resident_tax || 0,
      updatedAt: t.updated_at
    }))
  };
}

function handleUpdateTax(body) {
  const { staffId, year, month, incomeTax, residentTax } = body;

  if (!staffId || !year || !month) {
    return { success: false, error: 'Missing required fields' };
  }

  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staffData = sheetToObjects(staffSheet);
  const staff = staffData.find(s => s.staff_id === staffId);

  if (!staff) {
    return { success: false, error: 'Staff not found' };
  }

  const sheet = getTaxSheet(parseInt(year), parseInt(month));
  const rowIndex = findRowIndex(sheet, 'staff_id', staffId);
  const now = new Date().toISOString();

  if (rowIndex !== -1) {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    sheet.getRange(rowIndex, headers.indexOf('income_tax') + 1).setValue(incomeTax || 0);
    sheet.getRange(rowIndex, headers.indexOf('resident_tax') + 1).setValue(residentTax || 0);
    sheet.getRange(rowIndex, headers.indexOf('updated_at') + 1).setValue(now);
  } else {
    sheet.appendRow([staffId, staff.name, incomeTax || 0, residentTax || 0, now]);
  }

  return { success: true };
}

function handleGetIncentive(params) {
  const { year, month } = params;

  if (!year || !month) {
    return { success: false, error: 'Missing required parameters' };
  }

  const sheet = getIncentiveSheet(parseInt(year), parseInt(month));
  const data = sheetToObjects(sheet);

  return {
    success: true,
    data: data.map(i => ({
      staffId: i.staff_id,
      name: i.name,
      itemName: i.item_name,
      amount: i.amount || 0,
      remarks: i.remarks
    }))
  };
}

function handleCreateIncentive(body) {
  const { staffId, year, month, itemName, amount, remarks } = body;

  if (!staffId || !year || !month || !itemName) {
    return { success: false, error: 'Missing required fields' };
  }

  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staffData = sheetToObjects(staffSheet);
  const staff = staffData.find(s => s.staff_id === staffId);

  if (!staff) {
    return { success: false, error: 'Staff not found' };
  }

  const sheet = getIncentiveSheet(parseInt(year), parseInt(month));
  sheet.appendRow([staffId, staff.name, itemName, amount || 0, remarks || '']);

  return { success: true };
}

function handleCalculateSalary(body) {
  const { year, month } = body;

  if (!year || !month) {
    return { success: false, error: 'Missing required fields' };
  }

  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staffData = sheetToObjects(staffSheet).filter(s => s.status === 'active');

  const attendanceSheet = getAttendanceSheet(year, month);
  const attendanceData = sheetToObjects(attendanceSheet);

  const taxSheet = getTaxSheet(year, month);
  const taxData = sheetToObjects(taxSheet);

  const incentiveSheet = getIncentiveSheet(year, month);
  const incentiveData = sheetToObjects(incentiveSheet);

  const ratesResponse = handleGetInsuranceRates();
  const rates = ratesResponse.data?.rates || {
    healthInsuranceRate: 4.905,
    nursingInsuranceRate: 0.80,
    pensionRate: 9.15,
    employmentInsuranceRate: 0.60
  };

  const salarySheet = getSalarySheet(year, month);
  const results = [];

  for (const staff of staffData) {
    const staffAttendance = attendanceData.filter(a => a.staff_id === staff.staff_id);
    const staffTax = taxData.find(t => t.staff_id === staff.staff_id) || {};
    const staffIncentives = incentiveData.filter(i => i.staff_id === staff.staff_id);

    // Calculate work hours
    const totalWorkMinutes = staffAttendance.reduce((sum, a) => sum + (a.work_minutes || 0), 0);
    const totalWorkHours = totalWorkMinutes / 60;

    // Calculate overtime (simplified - would need week-by-week calculation for accuracy)
    const monthlyWorkingHours = (WEEKLY_HOURS * 52) / 12;
    const overtimeHours = Math.max(0, totalWorkHours - monthlyWorkingHours);

    // Late and early leave
    const lateMinutes = staffAttendance.reduce((sum, a) => sum + (a.late_minutes || 0), 0);
    const earlyLeaveMinutes = staffAttendance.reduce((sum, a) => sum + (a.early_leave_minutes || 0), 0);

    // Calculate pay
    const hourlyRate = staff.monthly_salary / monthlyWorkingHours;
    const minuteRate = hourlyRate / 60;

    const overtimePay = Math.floor(overtimeHours * hourlyRate * 1.25);
    const nightPay = 0; // Would need hour-by-hour calculation
    const holidayPay = 0; // Would need to check holiday flags

    const incentiveTotal = staffIncentives.reduce((sum, i) => sum + (i.amount || 0), 0);

    const grossPay = staff.monthly_salary + overtimePay + nightPay + holidayPay +
                     staff.transportation + incentiveTotal;

    // Deductions
    const lateDeduction = Math.floor(lateMinutes * minuteRate);
    const earlyLeaveDeduction = Math.floor(earlyLeaveMinutes * minuteRate);

    // Insurance (simplified - would use standard remuneration table)
    const healthInsurance = Math.floor(grossPay * rates.healthInsuranceRate / 100);
    const nursingInsurance = isNursingInsuranceTarget(staff.birth_date) ?
                            Math.floor(grossPay * rates.nursingInsuranceRate / 100) : 0;
    const pension = Math.floor(grossPay * rates.pensionRate / 100);
    const employmentInsurance = Math.floor(grossPay * rates.employmentInsuranceRate / 100);

    // Tax
    const incomeTax = staffTax.income_tax || 0;
    const residentTax = staffTax.resident_tax || 0;

    const totalDeduction = lateDeduction + earlyLeaveDeduction +
                          healthInsurance + nursingInsurance + pension + employmentInsurance +
                          incomeTax + residentTax;

    const netPay = grossPay - totalDeduction;

    const salaryRecord = {
      staffId: staff.staff_id,
      name: staff.name,
      baseSalary: staff.monthly_salary,
      totalWorkHours: Math.round(totalWorkHours * 100) / 100,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
      nightHours: 0,
      holidayHours: 0,
      overtimePay,
      nightPay,
      holidayPay,
      transportation: staff.transportation,
      incentive: incentiveTotal,
      grossPay,
      lateDeduction,
      earlyLeaveDeduction,
      healthInsurance,
      nursingInsurance,
      pension,
      employmentInsurance,
      incomeTax,
      residentTax,
      totalDeduction,
      netPay
    };

    results.push(salaryRecord);

    // Save to sheet
    const existingRow = findRowIndex(salarySheet, 'staff_id', staff.staff_id);
    const rowData = [
      salaryRecord.staffId, salaryRecord.name, salaryRecord.baseSalary,
      salaryRecord.totalWorkHours, salaryRecord.overtimeHours,
      salaryRecord.nightHours, salaryRecord.holidayHours,
      salaryRecord.overtimePay, salaryRecord.nightPay, salaryRecord.holidayPay,
      salaryRecord.transportation, salaryRecord.incentive, salaryRecord.grossPay,
      salaryRecord.lateDeduction, salaryRecord.earlyLeaveDeduction,
      salaryRecord.healthInsurance, salaryRecord.nursingInsurance,
      salaryRecord.pension, salaryRecord.employmentInsurance,
      salaryRecord.incomeTax, salaryRecord.residentTax,
      salaryRecord.totalDeduction, salaryRecord.netPay
    ];

    if (existingRow !== -1) {
      salarySheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
    } else {
      salarySheet.appendRow(rowData);
    }
  }

  return { success: true, data: results };
}

function handleGetSalary(params) {
  const { staffId, year, month } = params;

  if (!staffId || !year || !month) {
    return { success: false, error: 'Missing required parameters' };
  }

  const sheet = getSalarySheet(parseInt(year), parseInt(month));
  const data = sheetToObjects(sheet);
  const record = data.find(r => r.staff_id === staffId);

  if (!record) {
    return { success: false, error: 'Salary record not found' };
  }

  return {
    success: true,
    data: {
      staffId: record.staff_id,
      name: record.name,
      baseSalary: record.base_salary,
      totalWorkHours: record.total_work_hours,
      overtimeHours: record.overtime_hours,
      nightHours: record.night_hours,
      holidayHours: record.holiday_hours,
      overtimePay: record.overtime_pay,
      nightPay: record.night_pay,
      holidayPay: record.holiday_pay,
      transportation: record.transportation,
      incentive: record.incentive,
      grossPay: record.gross_pay,
      lateDeduction: record.late_deduction,
      earlyLeaveDeduction: record.early_leave_deduction,
      healthInsurance: record.health_insurance,
      nursingInsurance: record.nursing_insurance,
      pension: record.pension,
      employmentInsurance: record.employment_insurance,
      incomeTax: record.income_tax,
      residentTax: record.resident_tax,
      totalDeduction: record.total_deduction,
      netPay: record.net_pay
    }
  };
}

function handleUpdateAttendance(body) {
  const { date, staffId, field, value } = body;

  if (!date || !staffId || !field) {
    return { success: false, error: 'Missing required fields' };
  }

  const dateParts = date.split('-');
  const year = parseInt(dateParts[0]);
  const month = parseInt(dateParts[1]);

  const sheet = getAttendanceSheet(year, month);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // Find the row
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === date && data[i][1] === staffId) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex === -1) {
    return { success: false, error: 'Record not found' };
  }

  // Map field names
  const fieldMap = {
    clockIn: 'clock_in',
    clockOut: 'clock_out',
    breakStart: 'break_start',
    breakEnd: 'break_end',
    remarks: 'remarks'
  };

  const columnName = fieldMap[field] || field;
  const colIndex = headers.indexOf(columnName);

  if (colIndex === -1) {
    return { success: false, error: 'Invalid field' };
  }

  sheet.getRange(rowIndex, colIndex + 1).setValue(value);

  return { success: true };
}

// Helper function to check nursing insurance eligibility
function isNursingInsuranceTarget(birthDate) {
  if (!birthDate) return false;

  const birth = new Date(birthDate);
  const today = new Date();

  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age >= 40 && age < 65;
}
