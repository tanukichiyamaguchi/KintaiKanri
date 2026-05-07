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
const SPREADSHEET_ID = '1cQJf5tgTwRIpNUU-rtQMeSCn9DKti4qyzTm-1j2DXC0'; // KintaiKanri spreadsheet
const WEEKLY_HOURS = 44; // Beauty industry special measure

// PBKDF2 iteration count for password hashing
const PBKDF2_ITERATIONS = 10000;

// Sheet names
const SHEETS = {
  STAFF_MASTER: 'staff_master',
  ADMINS: 'admins',
  PAID_LEAVE: 'paid_leave',
  INSURANCE_RATES: 'insurance_rates',
  STANDARD_REMUNERATION: 'standard_remuneration',
  APPLICATIONS: 'applications',
  SUBMISSIONS: 'submissions',
  ATTENDANCE_HISTORY: 'attendance_history',
};

// Shift sheet name pattern: shift_YYYYMM
function shiftSheetName(year, month) {
  return 'shift_' + year + String(month).padStart(2, '0');
}

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
      headers: ['staff_id', 'email', 'password_hash', 'password_salt', 'name', 'monthly_salary', 'transportation', 'hire_date', 'paid_leave_balance', 'status', 'birth_date']
    },
    {
      name: SHEETS.ADMINS,
      headers: ['admin_id', 'email', 'password_hash', 'password_salt', 'name', 'created_at']
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
    },
    {
      name: SHEETS.APPLICATIONS,
      headers: ['id', 'staff_id', 'staff_name', 'date', 'type', 'reason', 'details_json', 'status', 'submitted_at', 'reviewed_at', 'reviewed_by', 'rejection_reason']
    },
    {
      name: SHEETS.SUBMISSIONS,
      headers: ['staff_id', 'staff_name', 'year_month', 'status', 'submitted_at', 'reviewed_at', 'reviewed_by', 'remarks', 'rejection_reason']
    },
    {
      name: SHEETS.ATTENDANCE_HISTORY,
      headers: ['date', 'staff_id', 'field', 'old_value', 'new_value', 'edited_at', 'edited_by', 'editor_role', 'reason']
    }
  ];

  for (const sheetInfo of sheetsToCreate) {
    let sheet = ss.getSheetByName(sheetInfo.name);
    if (!sheet) {
      sheet = ss.insertSheet(sheetInfo.name);
      Logger.log('Created sheet: ' + sheetInfo.name);
    }

    // 新規シートはデフォルトカラム数が少ない可能性があるため、必要数まで拡張する
    if (sheet.getMaxColumns() < sheetInfo.headers.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), sheetInfo.headers.length - sheet.getMaxColumns());
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
  if (insuranceSheet) {
    const insuranceData = insuranceSheet.getDataRange().getValues();
    if (insuranceData.length <= 1) {
      const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
      insuranceSheet.appendRow([today, 4.905, 0.80, 9.15, 0.60, new Date().toISOString(), 'System']);
      Logger.log('Added default insurance rates');
    }
  }

  Logger.log('System setup complete!');
  return { success: true, message: 'System setup complete!' };
}

/**
 * テスト用スタッフを追加（email: test@example.com / password: test1234）
 * 初回 setupSystem の後に一度実行する想定。
 */
function addTestStaff() {
  const sheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const data = sheetToObjects(sheet);
  if (data.find(s => s.staff_id === 'S000001')) {
    Logger.log('Test staff already exists');
    return { success: false, message: 'Test staff already exists' };
  }

  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const salt = generateSalt();
  const hash = hashPassword('test1234', salt);
  sheet.appendRow([
    'S000001',
    'test@example.com',
    hash,
    salt,
    'テストスタッフ',
    250000, 15000, today, 10, 'active', '1990-01-01'
  ]);

  Logger.log('Test staff added! email: test@example.com / password: test1234');
  return { success: true, message: 'Test staff added! email: test@example.com / password: test1234' };
}

/**
 * テスト用管理者を追加（email: admin@example.com / password: admin1234）
 */
function addTestAdmin() {
  const sheet = getOrCreateSheet(SHEETS.ADMINS);
  const data = sheetToObjects(sheet);
  if (data.find(a => a.email === 'admin@example.com')) {
    Logger.log('Test admin already exists');
    return { success: false, message: 'Test admin already exists' };
  }

  const salt = generateSalt();
  const hash = hashPassword('admin1234', salt);
  sheet.appendRow([
    'A000001',
    'admin@example.com',
    hash,
    salt,
    'システム管理者',
    new Date().toISOString()
  ]);

  Logger.log('Test admin added! email: admin@example.com / password: admin1234');
  return { success: true, message: 'Test admin added! email: admin@example.com / password: admin1234' };
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

// ヘッダー行を安全に取得する（空シートや getLastColumn=0 を許容）。
// getRange(1,1,1,0) は GAS で例外になるため、必ず lastCol>=1 を担保してから呼ぶ。
function getHeaderRow_(sheet) {
  if (!sheet) return [];
  const lastCol = sheet.getLastColumn();
  if (!lastCol || lastCol < 1) return [];
  try {
    return sheet.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  } catch (e) {
    Logger.log('getHeaderRow_ failed: ' + (e && e.message));
    return [];
  }
}

// ヘッダー名から列番号(1-indexed)を取得。見つからなければ -1。
function getColumnIndex_(headers, columnName) {
  if (!headers || !headers.length) return -1;
  for (let i = 0; i < headers.length; i++) {
    if (headers[i] === columnName) return i + 1;
  }
  return -1;
}

// ヘッダー名で列に値を書き込む防御的ラッパ。列が存在しなければ no-op + ログ。
// これにより headers.indexOf('xxx') + 1 が 0 になって getRange(row, 0) が
// 例外を起こす事故を防ぐ。
function setCellByColumnName_(sheet, rowIndex, headers, columnName, value) {
  const col = getColumnIndex_(headers, columnName);
  if (col < 1) {
    Logger.log('setCellByColumnName_: column "' + columnName + '" not found in sheet ' + (sheet && sheet.getName ? sheet.getName() : '?'));
    return false;
  }
  if (!rowIndex || rowIndex < 1) {
    Logger.log('setCellByColumnName_: invalid rowIndex=' + rowIndex);
    return false;
  }
  try {
    sheet.getRange(rowIndex, col).setValue(value);
    return true;
  } catch (e) {
    Logger.log('setCellByColumnName_ failed col=' + columnName + ': ' + (e && e.message));
    return false;
  }
}

// ヘッダー名でセルを読む防御的ラッパ。列が無ければ undefined。
function getCellByColumnName_(sheet, rowIndex, headers, columnName) {
  const col = getColumnIndex_(headers, columnName);
  if (col < 1 || !rowIndex || rowIndex < 1) return undefined;
  try {
    return sheet.getRange(rowIndex, col).getValue();
  } catch (e) {
    Logger.log('getCellByColumnName_ failed col=' + columnName + ': ' + (e && e.message));
    return undefined;
  }
}

// 数値セルを安全に Number に変換。null/undefined/'' は 0、NaN も 0。
function safeNumber_(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback || 0;
  const n = Number(value);
  return isNaN(n) ? (fallback || 0) : n;
}

// new Date() の結果が有効な Date かどうかを判定するヘルパ。
function isValidDate_(d) {
  return d instanceof Date && !isNaN(d.getTime());
}

// Date / 文字列を安全に Date オブジェクトに変換。失敗時 null。
function toDateOrNull_(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return isValidDate_(value) ? value : null;
  const d = new Date(value);
  return isValidDate_(d) ? d : null;
}

// Initialize sheet with headers (ヘッダーは setupSystem の定義と同期)
function initializeSheet(sheet, sheetName) {
  const headers = {
    [SHEETS.STAFF_MASTER]: [
      'staff_id', 'email', 'password_hash', 'password_salt', 'name',
      'monthly_salary', 'transportation', 'hire_date', 'paid_leave_balance', 'status', 'birth_date'
    ],
    [SHEETS.ADMINS]: [
      'admin_id', 'email', 'password_hash', 'password_salt', 'name', 'created_at'
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
    [SHEETS.APPLICATIONS]: [
      'id', 'staff_id', 'staff_name', 'date', 'type', 'reason', 'details_json',
      'status', 'submitted_at', 'reviewed_at', 'reviewed_by', 'rejection_reason'
    ],
    [SHEETS.SUBMISSIONS]: [
      'staff_id', 'staff_name', 'year_month', 'status', 'submitted_at',
      'reviewed_at', 'reviewed_by', 'remarks', 'rejection_reason'
    ],
    [SHEETS.ATTENDANCE_HISTORY]: [
      'date', 'staff_id', 'field', 'old_value', 'new_value', 'edited_at',
      'edited_by', 'editor_role', 'reason'
    ],
  };

  if (headers[sheetName]) {
    if (sheet.getMaxColumns() < headers[sheetName].length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), headers[sheetName].length - sheet.getMaxColumns());
    }
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
      'break_minutes', 'break_minutes_is_manual', 'work_minutes',
      'late_minutes', 'early_leave_minutes',
      'is_holiday', 'remarks', 'source'
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

// PBKDF2-HMAC-SHA256 風のパスワードハッシュ（GAS には bcrypt / scrypt が無いため自前実装）。
// 注: 厳密な RFC 2898 準拠ではない（GAS の computeHmacSha256Signature(value, key) は
// "value=メッセージ / key=鍵" の順なので、ここでは password と salt の役割が標準とは
// 入れ替わっているが、ハッシュ生成と検証で同じ手順を踏めば自己整合する）。
// 注: GAS の Utilities.computeHmacSha256Signature は (String,String) または (Byte[],Byte[])
// のオーバーロードしか持たず、(Byte[],String) は実行時例外になる。そのため2回目以降の
// 反復では salt を base64 デコードしたバイト列に切り替える。
function hashPassword(password, salt) {
  if (!password || !salt) return '';
  // password / salt は必ず String に正規化（Date/Number セルが渡された場合の保険）
  const passwordStr = String(password);
  const saltStr = String(salt);
  if (!passwordStr || !saltStr) return '';
  const iterations = PBKDF2_ITERATIONS;
  // 初回: (String, String) 版で U_1
  let buffer;
  try {
    buffer = Utilities.computeHmacSha256Signature(passwordStr, saltStr);
  } catch (e) {
    Logger.log('hashPassword first HMAC failed: ' + (e && e.message));
    return '';
  }
  if (!buffer || !buffer.length) return '';
  // result は JS 配列にコピーして以降は通常配列として扱う
  const result = [];
  for (let j = 0; j < buffer.length; j++) {
    result[j] = buffer[j];
  }
  // 2回目以降は (Byte[], Byte[]) 版を使うため salt をバイトに変換。
  // 万一 saltStr が base64 として不正な場合は 1 回ハッシュで終了する（互換のためエラーにはしない）。
  let saltBytes;
  try {
    saltBytes = Utilities.base64Decode(saltStr);
  } catch (e) {
    Logger.log('hashPassword base64Decode(salt) failed: ' + (e && e.message));
    return Utilities.base64Encode(result);
  }
  if (!saltBytes || !saltBytes.length) return Utilities.base64Encode(result);
  for (let i = 1; i < iterations; i++) {
    try {
      buffer = Utilities.computeHmacSha256Signature(buffer, saltBytes);
    } catch (e) {
      Logger.log('hashPassword iter HMAC failed at i=' + i + ': ' + (e && e.message));
      break;
    }
    if (!buffer || !buffer.length) break;
    for (let j = 0; j < buffer.length; j++) {
      // signed byte 同士の XOR は signed byte 範囲に収まる(-128..127)
      result[j] = (result[j] ^ buffer[j]) | 0;
      // -128..127 にクランプ（万一 32bit 拡張で範囲外になった場合の保険）
      if (result[j] > 127) result[j] -= 256;
      else if (result[j] < -128) result[j] += 256;
    }
  }
  return Utilities.base64Encode(result);
}

// 16バイトの salt を生成して base64 エンコード。
// GAS の base64Encode は signed byte (-128..127) の配列を受け付ける。
function generateSalt() {
  const bytes = [];
  for (let i = 0; i < 16; i++) {
    // Math.random は暗号学的に弱いが GAS には crypto.getRandomValues が無いため、
    // タイムスタンプを混ぜてエントロピーを補強する。
    const r = Math.floor(Math.random() * 256) ^ ((Date.now() >>> (i % 24)) & 0xFF);
    bytes.push((r & 0xFF) - 128);
  }
  return Utilities.base64Encode(bytes);
}

// Generate unique ID
function generateId() {
  return Utilities.getUuid();
}

// Convert sheet data to array of objects
function sheetToObjects(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (!data || data.length <= 1) return [];

  const headers = data[0] || [];
  // ヘッダー行が完全に空なら（=シート初期化失敗）空配列を返す
  if (!headers.length || headers.every(h => h === '' || h == null)) return [];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      if (header !== '' && header != null) {
        obj[header] = row[index];
      }
    });
    return obj;
  });
}

// Find row index by column value
function findRowIndex(sheet, column, value) {
  if (!sheet) return -1;
  const data = sheet.getDataRange().getValues();
  if (!data || data.length === 0) return -1;
  const headers = data[0] || [];
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
    // e は doGet / doPost から渡される EventObject。スクリプトエディタから直接実行された場合は undefined。
    const safeEvent = e || {};
    const safeParam = safeEvent.parameter || {};
    const path = safeParam.action || safeEvent.pathInfo || '';
    let body = {};

    // Parse body from POST request or from 'data' query parameter (for GET requests to avoid CORS)
    if (method === 'POST' && safeEvent.postData && safeEvent.postData.contents) {
      try {
        body = JSON.parse(safeEvent.postData.contents) || {};
        if (typeof body !== 'object' || body === null) body = {};
      } catch (parseErr) {
        Logger.log('Failed to parse postData contents: ' + parseErr.message);
        body = {};
      }
    } else if (safeParam.data) {
      // Support GET requests with data parameter to avoid CORS preflight issues
      try {
        body = JSON.parse(safeParam.data) || {};
        if (typeof body !== 'object' || body === null) body = {};
      } catch (parseError) {
        Logger.log('Failed to parse data parameter: ' + parseError.message);
        body = {};
      }
    }

    const params = safeParam;
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

      // Self-registration (staff only)
      case 'auth/register':
        result = handleRegister(body);
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
      case 'attendance/bulk-get':
        result = handleBulkGetAttendance(params);
        break;
      case 'attendance/bulk-save':
        result = handleBulkSaveAttendance(body);
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

      // Shifts (read-only from spreadsheet)
      case 'shifts/monthly':
        result = handleGetMonthlyShifts(params);
        break;
      case 'shifts/staff-month':
        result = handleGetStaffMonthShifts(params);
        break;

      // Applications
      case 'applications/create':
        result = handleCreateApplication(body);
        break;
      case 'applications/list':
        result = handleListApplications(params);
        break;
      case 'applications/approve':
        result = handleApproveApplication(body);
        break;
      case 'applications/reject':
        result = handleRejectApplication(body);
        break;

      // Monthly submission
      case 'submissions/submit':
        result = handleSubmitMonthly(body);
        break;
      case 'submissions/status':
        result = handleGetSubmissionStatus(params);
        break;
      case 'submissions/list':
        result = handleListSubmissions(params);
        break;
      case 'submissions/approve':
        result = handleApproveSubmission(body);
        break;
      case 'submissions/reject':
        result = handleRejectSubmission(body);
        break;

      // Password management
      case 'password/change':
        result = handleChangePassword(body);
        break;
      case 'password/reset':
        result = handleResetPassword(body);
        break;

      // Admins (manager UI)
      case 'admins':
        if (hasBody) {
          result = handleCreateAdmin(body);
        } else {
          result = handleListAdmins();
        }
        break;
      case 'admins/update':
        result = handleUpdateAdmin(body);
        break;
      case 'admins/delete':
        result = handleDeleteAdmin(body);
        break;

      // Attendance edit history
      case 'attendance/history':
        result = handleGetAttendanceHistory(params);
        break;

      // Setup - initialize system
      case 'setup':
        result = setupSystem();
        break;

      default:
        result = { success: false, error: '未対応のアクションです: ' + path };
    }

    output.setContent(JSON.stringify(result));

  } catch (error) {
    // error は Error / 文字列 / その他 何でも投げられる可能性があるため安全に文字列化。
    const errMsg = error && error.message ? error.message : String(error);
    Logger.log('handleRequest caught: ' + errMsg + ' stack=' + (error && error.stack));
    try {
      output.setContent(JSON.stringify({
        success: false,
        error: errMsg
      }));
    } catch (jsonErr) {
      output.setContent('{"success":false,"error":"internal error"}');
    }
  }

  return output;
}

// Handler functions

/**
 * 統合ログイン: email + password。
 * staff_master を先に検索し、見つからなければ admins を検索する。
 */
function handleAuth(body) {
  const { email, password } = body;

  if (!email || !password) {
    return { success: false, error: 'メールアドレスとパスワードを入力してください' };
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  // 1) Try staff first
  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staffData = sheetToObjects(staffSheet);
  const staff = staffData.find(s => String(s.email || '').trim().toLowerCase() === normalizedEmail);

  if (staff) {
    if (staff.status !== 'active') {
      return { success: false, error: 'アカウントが無効です' };
    }
    const expected = hashPassword(password, staff.password_salt);
    if (expected !== staff.password_hash) {
      return { success: false, error: 'メールアドレスまたはパスワードが正しくありません' };
    }
    return {
      success: true,
      isAdmin: false,
      staffInfo: {
        staffId: staff.staff_id,
        email: staff.email,
        name: staff.name,
        status: staff.status
      },
      token: generateId()
    };
  }

  // 2) Try admin
  const adminSheet = getOrCreateSheet(SHEETS.ADMINS);
  const adminData = sheetToObjects(adminSheet);
  const admin = adminData.find(a => String(a.email || '').trim().toLowerCase() === normalizedEmail);

  if (admin) {
    const expected = hashPassword(password, admin.password_salt);
    if (expected !== admin.password_hash) {
      return { success: false, error: 'メールアドレスまたはパスワードが正しくありません' };
    }
    return {
      success: true,
      isAdmin: true,
      adminInfo: {
        adminId: admin.admin_id,
        email: admin.email,
        name: admin.name
      },
      token: generateId()
    };
  }

  return { success: false, error: 'メールアドレスまたはパスワードが正しくありません' };
}

/**
 * 後方互換: 管理者専用ログイン。新フローでは handleAuth に統合済みだが
 * 既存ルーティングが残る場合のため email/password を受けて admins から検索する。
 */
function handleAdminAuth(body) {
  return handleAuth(body);
}

/**
 * スタッフのセルフ登録（ログイン画面の「新規登録」フォームから呼ばれる）。
 * 管理者は GAS 関数 (addTestAdmin / handleCreateAdmin) からのみ作成する仕様。
 *
 * 登録時の値:
 *   - 必須: name / email / password
 *   - 自動: staffId / hire_date(今日) / status='active'
 *   - 既定値0: monthly_salary, transportation, paid_leave_balance, birth_date
 *   - 給与・誕生日・有給日数は管理者画面から後で設定する想定
 *
 * 重複チェック: staff_master と admins の両方で email を確認する
 * （両方で同じ email を作らない）。
 *
 * 成功時は {staffInfo, token} を返し、フロント側で自動ログイン可能にする。
 */
function handleRegister(body) {
  const name = body && body.name ? String(body.name).trim() : '';
  const email = body && body.email ? String(body.email).trim().toLowerCase() : '';
  const password = body && body.password ? String(body.password) : '';

  if (!name || !email || !password) {
    return { success: false, error: '氏名・メールアドレス・パスワードをすべて入力してください' };
  }

  // 簡易バリデーション
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: 'メールアドレスの形式が正しくありません' };
  }
  if (password.length < 8) {
    return { success: false, error: 'パスワードは8文字以上で設定してください' };
  }

  // 既存登録チェック（staff_master）
  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staffData = sheetToObjects(staffSheet);
  if (staffData.find(function (s) { return String(s.email || '').toLowerCase() === email; })) {
    return { success: false, error: 'このメールアドレスは既に登録されています' };
  }

  // 既存登録チェック（admins）— 衝突を避ける
  const adminSheet = getOrCreateSheet(SHEETS.ADMINS);
  const adminData = sheetToObjects(adminSheet);
  if (adminData.find(function (a) { return String(a.email || '').toLowerCase() === email; })) {
    return { success: false, error: 'このメールアドレスは既に登録されています' };
  }

  // 作成
  const staffId = 'S' + String(Date.now()).slice(-6);
  const salt = generateSalt();
  const hash = hashPassword(password, salt);
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  // ヘッダー: staff_id, email, password_hash, password_salt, name,
  //          monthly_salary, transportation, hire_date, paid_leave_balance, status, birth_date
  staffSheet.appendRow([
    staffId, email, hash, salt, name,
    0, 0, today, 0, 'active', ''
  ]);

  return {
    success: true,
    isAdmin: false,
    staffInfo: {
      staffId: staffId,
      email: email,
      name: name,
      status: 'active'
    },
    token: generateId()
  };
}

/**
 * リアルタイム打刻処理。GPSは不要、休憩は法定基準で自動付与（実労働時間から算出）。
 * 月次提出済み(submitted/approved)の場合はブロックする。
 */
function handleClock(body) {
  const { staffId, type, timestamp } = body;

  if (!staffId || !type) {
    return { success: false, error: '必須項目が入力されていません' };
  }

  const allowedTypes = ['clock_in', 'clock_out'];
  if (allowedTypes.indexOf(type) === -1) {
    return { success: false, error: '不正な打刻種別です' };
  }

  // 不正な timestamp が渡された場合は現在時刻にフォールバックして処理続行。
  // Invalid Date のまま Utilities.formatDate を呼ぶと例外になるためここで弾く。
  let now = timestamp ? new Date(timestamp) : new Date();
  if (!isValidDate_(now)) {
    Logger.log('handleClock: invalid timestamp received, falling back to server time. timestamp=' + timestamp);
    now = new Date();
  }
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const yearMonth = year + '-' + String(month).padStart(2, '0');

  // 月次提出ステータスチェック (submitted/approved の月は打刻不可)
  const submissionStatus = getSubmissionStatus_(staffId, yearMonth);
  if (submissionStatus === 'submitted' || submissionStatus === 'approved') {
    return { success: false, error: 'この月は提出済みのため打刻できません' };
  }

  const sheet = getAttendanceSheet(year, month);
  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staffData = sheetToObjects(staffSheet);
  const staff = staffData.find(s => s.staff_id === staffId);

  if (!staff) {
    return { success: false, error: 'スタッフが見つかりません' };
  }

  // Find or create today's record。
  // date 列は文字列で書き込んでいるが、Sheets が Date 型に自動変換する場合があるため両対応。
  let rowIndex = -1;
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const rowDate = formatDateOnly_(data[i][0]);
    if (rowDate === dateStr && data[i][1] === staffId) {
      rowIndex = i + 1;
      break;
    }
  }

  const timeStr = now.toISOString();

  // Column index reference (1-based) for new schema (no GPS):
  // 1=date, 2=staff_id, 3=name, 4=clock_in, 5=clock_out, 6=clock_out_type,
  // 7=break_minutes, 8=break_minutes_is_manual, 9=work_minutes,
  // 10=late_minutes, 11=early_leave_minutes,
  // 12=is_holiday, 13=remarks, 14=source

  if (rowIndex === -1) {
    // Create new record
    const newRow = [
      dateStr, staffId, staff.name,
      '', '', '',           // clock_in, clock_out, clock_out_type
      0, false,              // break_minutes, break_minutes_is_manual
      0, 0, 0,               // work_minutes, late_minutes, early_leave_minutes
      false, '',             // is_holiday, remarks
      'punch'                // source
    ];

    if (type === 'clock_in') {
      newRow[3] = timeStr;
    } else {
      // 出勤打刻が無いまま退勤等を打とうとした場合のガード
      return { success: false, error: '出勤打刻が記録されていません' };
    }

    sheet.appendRow(newRow);
    rowIndex = sheet.getLastRow();
  } else {
    if (type === 'clock_in') {
      // 同日2回目以降の出勤打刻はブロック（誤操作防止）。
      const existingClockIn = sheet.getRange(rowIndex, 4).getValue();
      if (existingClockIn) {
        return { success: false, error: '本日は既に出勤打刻されています' };
      }
      sheet.getRange(rowIndex, 4).setValue(timeStr);
    } else if (type === 'clock_out') {
      const existingClockIn = sheet.getRange(rowIndex, 4).getValue();
      if (!existingClockIn) {
        return { success: false, error: '出勤打刻が記録されていません' };
      }
      const existingClockOut = sheet.getRange(rowIndex, 5).getValue();
      if (existingClockOut) {
        return { success: false, error: '本日は既に退勤打刻されています' };
      }
      sheet.getRange(rowIndex, 5).setValue(timeStr);
      sheet.getRange(rowIndex, 6).setValue('normal');

      // Auto-calculate break (legal minimum) + work minutes
      // existingClockIn は Date / 文字列のどちらでもありうる（Sheets が自動変換するため）
      const startTime = toDateOrNull_(existingClockIn);
      if (startTime) {
        const elapsedMinutes = Math.floor((now.getTime() - startTime.getTime()) / 60000);
        const isManual = sheet.getRange(rowIndex, 8).getValue() === true;
        let breakMinutes = safeNumber_(sheet.getRange(rowIndex, 7).getValue(), 0);
        if (!isManual) {
          breakMinutes = computeLegalBreakMinutes_(elapsedMinutes);
          sheet.getRange(rowIndex, 7).setValue(breakMinutes);
        }
        const workMinutes = Math.max(0, elapsedMinutes - breakMinutes);
        sheet.getRange(rowIndex, 9).setValue(workMinutes);
      }
    }
  }

  return { success: true };
}

/**
 * 法定休憩時間（分）を拘束時間から算出（労働基準法 第34条）。
 *
 * 法的要件（実労働時間ベース）:
 *   実労働 6h超 → 45分以上 / 実労働 8h超 → 60分以上
 *
 * 拘束時間ベースの閾値:
 *   - 拘束 8h45m超 → 60分（実労働 7h45m超〜になり、8h超ケースで60分必要を担保）
 *   - 拘束 6時間超 → 45分（実労働 5h15m〜7h台、6h超ケースで45分必要を担保）
 *   - それ以外      → 0分
 *
 * 例: 拘束 9h00m → 60分（45分だと実労働 8h15m で60分必要だが付与不足）
 *     拘束 7h00m → 45分（実労働 6h15m）
 */
function computeLegalBreakMinutes_(elapsedMinutes) {
  if (elapsedMinutes > 8 * 60 + 45) return 60;
  if (elapsedMinutes > 6 * 60) return 45;
  return 0;
}

function handleGetTodayAttendance(params) {
  const staffId = params.staffId;

  if (!staffId) {
    return { success: false, error: 'スタッフIDが指定されていません' };
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  const sheet = getAttendanceSheet(year, month);
  const data = sheetToObjects(sheet);
  const todayRecord = data.find(r => formatDateOnly_(r.date) === dateStr && r.staff_id === staffId);

  if (!todayRecord) {
    return {
      success: true,
      data: {
        status: 'not_started',
        records: []
      }
    };
  }

  // Build records array (Date オブジェクトは ISO 文字列に正規化)
  const records = [];
  if (todayRecord.clock_in) {
    records.push({ type: 'clock_in', time: toIsoString_(todayRecord.clock_in) });
  }
  if (todayRecord.clock_out) {
    records.push({ type: 'clock_out', time: toIsoString_(todayRecord.clock_out) });
  }

  // Determine status (no break state in new model)
  let status = 'not_started';
  if (todayRecord.clock_out) {
    status = 'finished';
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
    return { success: false, error: '必須パラメータが指定されていません' };
  }

  const yNum = parseInt(year, 10);
  const mNum = parseInt(month, 10);
  if (!yNum || !mNum || mNum < 1 || mNum > 12) {
    return { success: false, error: '年月が不正です' };
  }
  const sheet = getAttendanceSheet(yNum, mNum);
  const data = sheetToObjects(sheet);
  const staffRecords = data.filter(r => r.staff_id === staffId);

  return {
    success: true,
    data: staffRecords.map(r => ({
      date: formatDateOnly_(r.date),
      staffId: r.staff_id,
      name: r.name,
      clockIn: toIsoString_(r.clock_in),
      clockOut: toIsoString_(r.clock_out),
      clockOutType: r.clock_out_type,
      breakMinutes: Number(r.break_minutes) || 0,
      breakMinutesIsManual: r.break_minutes_is_manual === true || r.break_minutes_is_manual === 'TRUE',
      workMinutes: Number(r.work_minutes) || 0,
      lateMinutes: Number(r.late_minutes) || 0,
      earlyLeaveMinutes: Number(r.early_leave_minutes) || 0,
      isHoliday: r.is_holiday === true || r.is_holiday === 'TRUE',
      remarks: r.remarks,
      source: r.source || 'punch'
    }))
  };
}

// Date / 文字列を ISO 文字列に正規化。空・無効値は空文字を返す。
function toIsoString_(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? '' : value.toISOString();
  }
  // 既に ISO 文字列ならそのまま、その他はパースして再フォーマット
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toISOString();
}

// 日付セル（Date / "YYYY-MM-DD" 文字列）を YYYY-MM-DD に正規化。
function formatDateOnly_(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value);
}

// "YYYY-MM" 形式に正規化。Google Sheets は "2026-05" 等の文字列を自動的に
// Date オブジェクトに変換してしまうことがあるため、比較前に必ずこれを通す。
function formatYearMonthValue_(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM');
  }
  const s = String(value).trim();
  // "YYYY-MM" / "YYYY-M" 形式
  const m1 = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m1) return m1[1] + '-' + String(parseInt(m1[2], 10)).padStart(2, '0');
  // "YYYY-MM-DD" 形式（先頭7文字を取って正規化）
  const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m2) return m2[1] + '-' + String(parseInt(m2[2], 10)).padStart(2, '0');
  // "YYYY/MM" or "YYYY/MM/DD"
  const m3 = s.match(/^(\d{4})\/(\d{1,2})/);
  if (m3) return m3[1] + '-' + String(parseInt(m3[2], 10)).padStart(2, '0');
  return s;
}

function handleGetStaffList() {
  const sheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const data = sheetToObjects(sheet);

  return {
    success: true,
    data: data.map(s => ({
      staffId: s.staff_id,
      email: s.email,
      name: s.name,
      status: s.status
    }))
  };
}

function handleGetStaffDetail(params) {
  const staffId = params.staffId;

  if (!staffId) {
    return { success: false, error: 'スタッフIDが指定されていません' };
  }

  const sheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const data = sheetToObjects(sheet);
  const staff = data.find(s => s.staff_id === staffId);

  if (!staff) {
    return { success: false, error: 'スタッフが見つかりません' };
  }

  return {
    success: true,
    data: {
      staffId: staff.staff_id,
      email: staff.email,
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
  const { name, email, password, monthlySalary, transportation, hireDate, birthDate, paidLeaveBalance } = body;

  if (!name || !email || !password) {
    return { success: false, error: '氏名・メール・パスワードは必須です' };
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const sheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staffData = sheetToObjects(sheet);
  if (staffData.find(s => String(s.email || '').toLowerCase() === normalizedEmail)) {
    return { success: false, error: 'このメールアドレスは既に登録されています' };
  }

  const staffId = 'S' + String(Date.now()).slice(-6);
  const salt = generateSalt();
  const hash = hashPassword(password, salt);

  sheet.appendRow([
    staffId, normalizedEmail, hash, salt, name,
    monthlySalary || 0, transportation || 0,
    hireDate || '', paidLeaveBalance || 0, 'active', birthDate || ''
  ]);

  return { success: true, staffId };
}

function handleUpdateStaff(body) {
  const { staffId } = body;
  const updates = {};
  Object.keys(body).forEach(k => { if (k !== 'staffId') updates[k] = body[k]; });

  if (!staffId) {
    return { success: false, error: 'スタッフIDが指定されていません' };
  }

  const sheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const rowIndex = findRowIndex(sheet, 'staff_id', staffId);

  if (rowIndex === -1) {
    return { success: false, error: 'スタッフが見つかりません' };
  }

  const headers = getHeaderRow_(sheet);
  // body のキーから sheet のカラム名へのマッピング
  const fieldToColumn = {
    email: 'email',
    name: 'name',
    monthlySalary: 'monthly_salary',
    transportation: 'transportation',
    hireDate: 'hire_date',
    paidLeaveBalance: 'paid_leave_balance',
    status: 'status',
    birthDate: 'birth_date'
  };

  Object.keys(updates).forEach(key => {
    if (key === 'password' && updates[key]) {
      const salt = generateSalt();
      const hash = hashPassword(updates[key], salt);
      setCellByColumnName_(sheet, rowIndex, headers, 'password_hash', hash);
      setCellByColumnName_(sheet, rowIndex, headers, 'password_salt', salt);
    } else if (key === 'email' && updates[key]) {
      setCellByColumnName_(sheet, rowIndex, headers, 'email', String(updates[key]).trim().toLowerCase());
    } else if (fieldToColumn[key]) {
      setCellByColumnName_(sheet, rowIndex, headers, fieldToColumn[key], updates[key]);
    }
  });

  return { success: true };
}

function handleDeleteStaff(body) {
  const { staffId } = body;

  if (!staffId) {
    return { success: false, error: 'スタッフIDが指定されていません' };
  }

  const sheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const rowIndex = findRowIndex(sheet, 'staff_id', staffId);

  if (rowIndex === -1) {
    return { success: false, error: 'スタッフが見つかりません' };
  }

  // Soft delete - set status to inactive
  const headers = getHeaderRow_(sheet);
  setCellByColumnName_(sheet, rowIndex, headers, 'status', 'inactive');

  return { success: true };
}

function handleGetPaidLeaveBalance(params) {
  const staffId = params.staffId;

  if (!staffId) {
    return { success: false, error: 'スタッフIDが指定されていません' };
  }

  // Get balance from staff master
  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staffData = sheetToObjects(staffSheet);
  const staff = staffData.find(s => s.staff_id === staffId);

  if (!staff) {
    return { success: false, error: 'スタッフが見つかりません' };
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
    return { success: false, error: '必須項目が入力されていません' };
  }

  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staffData = sheetToObjects(staffSheet);
  const staff = staffData.find(s => s.staff_id === staffId);

  if (!staff) {
    return { success: false, error: 'スタッフが見つかりません' };
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
    return { success: false, error: '必須項目が入力されていません' };
  }

  const sheet = getOrCreateSheet(SHEETS.PAID_LEAVE);
  const rowIndex = findRowIndex(sheet, 'id', requestId);

  if (rowIndex === -1) {
    return { success: false, error: '申請が見つかりません' };
  }

  const headers = getHeaderRow_(sheet);
  setCellByColumnName_(sheet, rowIndex, headers, 'status', status);

  if (status === 'approved') {
    setCellByColumnName_(sheet, rowIndex, headers, 'approved_date', new Date().toISOString());

    // Decrease paid leave balance
    const staffId = getCellByColumnName_(sheet, rowIndex, headers, 'staff_id');

    if (staffId) {
      const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
      const staffRowIndex = findRowIndex(staffSheet, 'staff_id', staffId);

      if (staffRowIndex !== -1) {
        const staffHeaders = getHeaderRow_(staffSheet);
        const currentBalance = safeNumber_(getCellByColumnName_(staffSheet, staffRowIndex, staffHeaders, 'paid_leave_balance'), 0);
        setCellByColumnName_(staffSheet, staffRowIndex, staffHeaders, 'paid_leave_balance', currentBalance - 1);
      }
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
    return { success: false, error: '適用開始日が指定されていません' };
  }

  const sheet = getOrCreateSheet(SHEETS.INSURANCE_RATES);
  const rowIndex = findRowIndex(sheet, 'effective_date', effectiveDate);

  const now = new Date().toISOString();

  if (rowIndex !== -1) {
    // Update existing
    const headers = getHeaderRow_(sheet);
    setCellByColumnName_(sheet, rowIndex, headers, 'health_insurance_rate', healthInsuranceRate);
    setCellByColumnName_(sheet, rowIndex, headers, 'nursing_insurance_rate', nursingInsuranceRate);
    setCellByColumnName_(sheet, rowIndex, headers, 'pension_rate', pensionRate);
    setCellByColumnName_(sheet, rowIndex, headers, 'employment_insurance_rate', employmentInsuranceRate);
    setCellByColumnName_(sheet, rowIndex, headers, 'updated_at', now);
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
    return { success: false, error: '必須パラメータが指定されていません' };
  }

  const yNum = parseInt(year, 10);
  const mNum = parseInt(month, 10);
  if (!yNum || !mNum || mNum < 1 || mNum > 12) {
    return { success: false, error: '年月が不正です' };
  }
  const sheet = getTaxSheet(yNum, mNum);
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
    return { success: false, error: '必須項目が入力されていません' };
  }

  const yNum = parseInt(year, 10);
  const mNum = parseInt(month, 10);
  if (!yNum || !mNum || mNum < 1 || mNum > 12) {
    return { success: false, error: '年月が不正です' };
  }

  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staffData = sheetToObjects(staffSheet);
  const staff = staffData.find(s => s.staff_id === staffId);

  if (!staff) {
    return { success: false, error: 'スタッフが見つかりません' };
  }

  const sheet = getTaxSheet(yNum, mNum);
  const rowIndex = findRowIndex(sheet, 'staff_id', staffId);
  const now = new Date().toISOString();

  if (rowIndex !== -1) {
    const headers = getHeaderRow_(sheet);
    setCellByColumnName_(sheet, rowIndex, headers, 'income_tax', safeNumber_(incomeTax, 0));
    setCellByColumnName_(sheet, rowIndex, headers, 'resident_tax', safeNumber_(residentTax, 0));
    setCellByColumnName_(sheet, rowIndex, headers, 'updated_at', now);
  } else {
    sheet.appendRow([staffId, staff.name, safeNumber_(incomeTax, 0), safeNumber_(residentTax, 0), now]);
  }

  return { success: true };
}

function handleGetIncentive(params) {
  const { year, month } = params;

  if (!year || !month) {
    return { success: false, error: '必須パラメータが指定されていません' };
  }

  const yNum = parseInt(year, 10);
  const mNum = parseInt(month, 10);
  if (!yNum || !mNum || mNum < 1 || mNum > 12) {
    return { success: false, error: '年月が不正です' };
  }
  const sheet = getIncentiveSheet(yNum, mNum);
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
    return { success: false, error: '必須項目が入力されていません' };
  }

  const yNum = parseInt(year, 10);
  const mNum = parseInt(month, 10);
  if (!yNum || !mNum || mNum < 1 || mNum > 12) {
    return { success: false, error: '年月が不正です' };
  }

  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staffData = sheetToObjects(staffSheet);
  const staff = staffData.find(s => s.staff_id === staffId);

  if (!staff) {
    return { success: false, error: 'スタッフが見つかりません' };
  }

  const sheet = getIncentiveSheet(yNum, mNum);
  sheet.appendRow([staffId, staff.name, itemName, safeNumber_(amount, 0), remarks || '']);

  return { success: true };
}

function handleCalculateSalary(body) {
  const { year, month } = body;

  if (!year || !month) {
    return { success: false, error: '必須項目が入力されていません' };
  }

  const yNum = parseInt(year, 10);
  const mNum = parseInt(month, 10);
  if (!yNum || !mNum || mNum < 1 || mNum > 12) {
    return { success: false, error: '年月が不正です' };
  }

  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staffData = sheetToObjects(staffSheet).filter(s => s.status === 'active');

  const attendanceSheet = getAttendanceSheet(yNum, mNum);
  const attendanceData = sheetToObjects(attendanceSheet);

  const taxSheet = getTaxSheet(yNum, mNum);
  const taxData = sheetToObjects(taxSheet);

  const incentiveSheet = getIncentiveSheet(yNum, mNum);
  const incentiveData = sheetToObjects(incentiveSheet);

  const ratesResponse = handleGetInsuranceRates();
  const rates = ratesResponse.data?.rates || {
    healthInsuranceRate: 4.905,
    nursingInsuranceRate: 0.80,
    pensionRate: 9.15,
    employmentInsuranceRate: 0.60
  };

  const salarySheet = getSalarySheet(yNum, mNum);
  const results = [];

  for (const staff of staffData) {
    const staffAttendance = attendanceData.filter(a => a.staff_id === staff.staff_id);
    const staffTax = taxData.find(t => t.staff_id === staff.staff_id) || {};
    const staffIncentives = incentiveData.filter(i => i.staff_id === staff.staff_id);

    // 数値カラムは String/null/undefined の混在で文字列連結を起こさないよう Number に正規化。
    const monthlySalary = safeNumber_(staff.monthly_salary, 0);
    const transportation = safeNumber_(staff.transportation, 0);

    // Calculate work hours
    const totalWorkMinutes = staffAttendance.reduce((sum, a) => sum + safeNumber_(a.work_minutes, 0), 0);
    const totalWorkHours = totalWorkMinutes / 60;

    // Calculate overtime (simplified - would need week-by-week calculation for accuracy)
    const monthlyWorkingHours = (WEEKLY_HOURS * 52) / 12;
    const overtimeHours = Math.max(0, totalWorkHours - monthlyWorkingHours);

    // Late and early leave
    const lateMinutes = staffAttendance.reduce((sum, a) => sum + safeNumber_(a.late_minutes, 0), 0);
    const earlyLeaveMinutes = staffAttendance.reduce((sum, a) => sum + safeNumber_(a.early_leave_minutes, 0), 0);

    // Calculate pay (monthlyWorkingHours は固定値なので 0 除算なし、ただし monthlySalary=0 で hourlyRate=0)
    const hourlyRate = monthlyWorkingHours > 0 ? monthlySalary / monthlyWorkingHours : 0;
    const minuteRate = hourlyRate / 60;

    const overtimePay = Math.floor(overtimeHours * hourlyRate * 1.25);
    const nightPay = 0; // Would need hour-by-hour calculation
    const holidayPay = 0; // Would need to check holiday flags

    const incentiveTotal = staffIncentives.reduce((sum, i) => sum + safeNumber_(i.amount, 0), 0);

    const grossPay = monthlySalary + overtimePay + nightPay + holidayPay +
                     transportation + incentiveTotal;

    // Deductions
    const lateDeduction = Math.floor(lateMinutes * minuteRate);
    const earlyLeaveDeduction = Math.floor(earlyLeaveMinutes * minuteRate);

    // Insurance (simplified - would use standard remuneration table)
    const healthRate = safeNumber_(rates.healthInsuranceRate, 0);
    const nursingRate = safeNumber_(rates.nursingInsuranceRate, 0);
    const pensionRate = safeNumber_(rates.pensionRate, 0);
    const empInsRate = safeNumber_(rates.employmentInsuranceRate, 0);
    const healthInsurance = Math.floor(grossPay * healthRate / 100);
    const nursingInsurance = isNursingInsuranceTarget(staff.birth_date) ?
                            Math.floor(grossPay * nursingRate / 100) : 0;
    const pension = Math.floor(grossPay * pensionRate / 100);
    const employmentInsurance = Math.floor(grossPay * empInsRate / 100);

    // Tax
    const incomeTax = safeNumber_(staffTax.income_tax, 0);
    const residentTax = safeNumber_(staffTax.resident_tax, 0);

    const totalDeduction = lateDeduction + earlyLeaveDeduction +
                          healthInsurance + nursingInsurance + pension + employmentInsurance +
                          incomeTax + residentTax;

    const netPay = grossPay - totalDeduction;

    const salaryRecord = {
      staffId: staff.staff_id,
      name: staff.name,
      baseSalary: monthlySalary,
      totalWorkHours: Math.round(totalWorkHours * 100) / 100,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
      nightHours: 0,
      holidayHours: 0,
      overtimePay,
      nightPay,
      holidayPay,
      transportation: transportation,
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

    // setValues は対象シートに rowData.length 列以上が無いと例外になる。
    // 万一足りない場合は列を追加して書き込み可能にする。
    if (salarySheet.getMaxColumns() < rowData.length) {
      try {
        salarySheet.insertColumnsAfter(salarySheet.getMaxColumns(), rowData.length - salarySheet.getMaxColumns());
      } catch (e) {
        Logger.log('insertColumnsAfter failed in handleCalculateSalary: ' + (e && e.message));
      }
    }

    if (existingRow !== -1) {
      try {
        salarySheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
      } catch (e) {
        Logger.log('salarySheet.setValues failed: ' + (e && e.message));
      }
    } else {
      try {
        salarySheet.appendRow(rowData);
      } catch (e) {
        Logger.log('salarySheet.appendRow failed: ' + (e && e.message));
      }
    }
  }

  return { success: true, data: results };
}

function handleGetSalary(params) {
  const { staffId, year, month } = params;

  if (!staffId || !year || !month) {
    return { success: false, error: '必須パラメータが指定されていません' };
  }

  const yNum = parseInt(year, 10);
  const mNum = parseInt(month, 10);
  if (!yNum || !mNum || mNum < 1 || mNum > 12) {
    return { success: false, error: '年月が不正です' };
  }
  const sheet = getSalarySheet(yNum, mNum);
  const data = sheetToObjects(sheet);
  const record = data.find(r => r.staff_id === staffId);

  if (!record) {
    return { success: false, error: '給与レコードが見つかりません' };
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
  const { date, staffId, field, value, reason, editorId, editorRole } = body;

  if (!date || !staffId || !field) {
    return { success: false, error: '必須項目が入力されていません' };
  }

  const dateParts = String(date).split('-');
  const year = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10);
  if (!year || !month || month < 1 || month > 12) {
    return { success: false, error: '日付形式が不正です（YYYY-MM-DD 形式で指定してください）' };
  }
  const yearMonth = year + '-' + String(month).padStart(2, '0');

  // 提出済みの月はスタッフ編集不可（管理者は許可）
  const submissionStatus = getSubmissionStatus_(staffId, yearMonth);
  if ((submissionStatus === 'submitted' || submissionStatus === 'approved') && editorRole !== 'admin') {
    return { success: false, error: 'この月は提出済みのため編集できません' };
  }

  const sheet = getAttendanceSheet(year, month);
  const data = sheet.getDataRange().getValues();
  const headers = (data && data[0]) ? data[0] : [];

  // Find the row（date 列は Date 型 / 文字列の両方ありうる）
  let rowIndex = -1;
  if (data && data.length > 1) {
    for (let i = 1; i < data.length; i++) {
      if (formatDateOnly_(data[i][0]) === date && data[i][1] === staffId) {
        rowIndex = i + 1;
        break;
      }
    }
  }

  if (rowIndex === -1) {
    // Create empty row so manual edits can land
    const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
    const staffData = sheetToObjects(staffSheet);
    const staff = staffData.find(s => s.staff_id === staffId);
    if (!staff) return { success: false, error: 'スタッフが見つかりません' };

    sheet.appendRow([
      date, staffId, staff.name,
      '', '', '',
      0, false,
      0, 0, 0,
      false, '',
      'manual'
    ]);
    rowIndex = sheet.getLastRow();
  }

  // Map field names
  const fieldMap = {
    clockIn: 'clock_in',
    clockOut: 'clock_out',
    clockOutType: 'clock_out_type',
    breakMinutes: 'break_minutes',
    workMinutes: 'work_minutes',
    isHoliday: 'is_holiday',
    remarks: 'remarks'
  };

  const columnName = fieldMap[field] || field;
  const colIndex = headers.indexOf(columnName);

  if (colIndex === -1) {
    return { success: false, error: '不正なフィールド名です: ' + field };
  }

  // Capture old value for history
  const oldValue = sheet.getRange(rowIndex, colIndex + 1).getValue();

  // Apply update
  sheet.getRange(rowIndex, colIndex + 1).setValue(value);

  // Mark break as manually overridden if user changed break_minutes
  if (columnName === 'break_minutes') {
    const manualCol = headers.indexOf('break_minutes_is_manual');
    if (manualCol !== -1) sheet.getRange(rowIndex, manualCol + 1).setValue(true);
  }

  // Source becomes 'manual' on edit
  const sourceCol = headers.indexOf('source');
  if (sourceCol !== -1) sheet.getRange(rowIndex, sourceCol + 1).setValue('manual');

  // Recompute work_minutes if a time field changed
  if (columnName === 'clock_in' || columnName === 'clock_out' || columnName === 'break_minutes') {
    const ciCol = headers.indexOf('clock_in');
    const coCol = headers.indexOf('clock_out');
    const brCol = headers.indexOf('break_minutes');
    const wmCol = headers.indexOf('work_minutes');
    if (wmCol !== -1 && ciCol !== -1 && coCol !== -1 && brCol !== -1) {
      const ciVal = sheet.getRange(rowIndex, ciCol + 1).getValue();
      const coVal = sheet.getRange(rowIndex, coCol + 1).getValue();
      const brVal = safeNumber_(sheet.getRange(rowIndex, brCol + 1).getValue(), 0);
      if (ciVal && coVal) {
        // Sheets は ISO 文字列を Date に自動変換することがあるため両対応する
        const start = toDateOrNull_(ciVal);
        const end = toDateOrNull_(coVal);
        if (start && end) {
          const elapsed = Math.floor((end.getTime() - start.getTime()) / 60000);
          const workMin = Math.max(0, elapsed - brVal);
          sheet.getRange(rowIndex, wmCol + 1).setValue(workMin);
        }
      }
    }
  }

  // Append to history
  appendAttendanceHistory_(date, staffId, field, oldValue, value, editorId, editorRole, reason);

  return { success: true };
}

/**
 * 出勤簿（/attendance）画面の月次データ取得。
 * 既存 handleGetAttendance と同じデータを返すが、エンドポイント名を分離して
 * フロントの「読み取り専用」「編集可能」呼び出し側を区別できるようにしている。
 */
function handleBulkGetAttendance(params) {
  return handleGetAttendance(params);
}

/**
 * 出勤簿（/attendance）からの月次一括保存。
 *  - 各 row: {date, clockIn ('HH:MM'), clockOut ('HH:MM'), breakMinutes,
 *            workMinutes, isHoliday, breakMinutesIsManual, remarks}
 *  - 提出済み (submitted/approved) の月はスタッフ編集不可（管理者は editorRole='admin' で許可）。
 *  - 既存行があれば更新、無ければ append。
 *  - clockIn/clockOut は受信時 'HH:MM' 形式なので、ISO 文字列 (YYYY-MM-DDTHH:MM:00) に正規化して保存。
 *  - 空の行（出勤・退勤・休憩・備考すべて空）はスキップして書き込まない。
 */
function handleBulkSaveAttendance(body) {
  const staffId = body && body.staffId ? String(body.staffId) : '';
  const year = body ? parseInt(body.year, 10) : NaN;
  const month = body ? parseInt(body.month, 10) : NaN;
  const rows = body && Array.isArray(body.rows) ? body.rows : null;
  const editorRole = body && body.editorRole === 'admin' ? 'admin' : 'staff';

  if (!staffId || !year || !month || month < 1 || month > 12 || !rows) {
    return { success: false, error: 'パラメータが不正または不足しています' };
  }

  const yearMonth = year + '-' + String(month).padStart(2, '0');

  // 提出済みチェック（スタッフのみ）
  const submissionStatus = getSubmissionStatus_(staffId, yearMonth);
  if ((submissionStatus === 'submitted' || submissionStatus === 'approved') && editorRole !== 'admin') {
    return { success: false, error: 'この月は提出済みのため編集できません' };
  }

  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staff = sheetToObjects(staffSheet).find(s => s.staff_id === staffId);
  if (!staff) return { success: false, error: 'スタッフが見つかりません' };

  const sheet = getAttendanceSheet(year, month);
  const data = sheet.getDataRange().getValues();
  const headers = (data && data[0]) ? data[0] : [];

  // 既存行を date でインデックス化（このスタッフの行のみ）
  const dateToRowIndex = {};
  if (data && data.length > 1) {
    for (let i = 1; i < data.length; i++) {
      const rowDate = formatDateOnly_(data[i][0]);
      const rowStaffId = data[i][1];
      if (rowStaffId === staffId && rowDate) {
        dateToRowIndex[rowDate] = i + 1; // 1-indexed
      }
    }
  }

  let savedCount = 0;
  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    if (!row || !row.date) continue;

    const date = String(row.date);
    const clockIn = row.clockIn ? String(row.clockIn).trim() : '';
    const clockOut = row.clockOut ? String(row.clockOut).trim() : '';
    const breakMinutes = safeNumber_(row.breakMinutes, 0);
    const workMinutes = safeNumber_(row.workMinutes, 0);
    const isHoliday = row.isHoliday === true || row.isHoliday === 'TRUE';
    const breakMinutesIsManual = row.breakMinutesIsManual === true || row.breakMinutesIsManual === 'TRUE';
    const remarks = row.remarks ? String(row.remarks) : '';

    // 全フィールドが空ならスキップ
    if (!clockIn && !clockOut && breakMinutes === 0 && !remarks && !isHoliday) {
      continue;
    }

    // HH:MM → ISO 文字列に正規化（保存形式統一）
    const clockInIso = clockIn && /^\d{1,2}:\d{2}$/.test(clockIn) ? (date + 'T' + clockIn.padStart(5, '0') + ':00') : '';
    const clockOutIso = clockOut && /^\d{1,2}:\d{2}$/.test(clockOut) ? (date + 'T' + clockOut.padStart(5, '0') + ':00') : '';

    let rowIndex = dateToRowIndex[date];
    if (!rowIndex) {
      // 新規行
      // ヘッダー: date, staff_id, name, clock_in, clock_out, clock_out_type,
      //          break_minutes, break_minutes_is_manual, work_minutes,
      //          late_minutes, early_leave_minutes, is_holiday, remarks, source
      sheet.appendRow([
        date, staffId, staff.name,
        clockInIso, clockOutIso, clockOutIso ? 'normal' : '',
        breakMinutes, breakMinutesIsManual,
        workMinutes, 0, 0,
        isHoliday, remarks,
        'manual'
      ]);
      rowIndex = sheet.getLastRow();
      dateToRowIndex[date] = rowIndex;
    } else {
      // 既存行を更新（カラム名指定で安全に書き込み）
      setCellByColumnName_(sheet, rowIndex, headers, 'clock_in', clockInIso);
      setCellByColumnName_(sheet, rowIndex, headers, 'clock_out', clockOutIso);
      if (clockOutIso) setCellByColumnName_(sheet, rowIndex, headers, 'clock_out_type', 'normal');
      setCellByColumnName_(sheet, rowIndex, headers, 'break_minutes', breakMinutes);
      setCellByColumnName_(sheet, rowIndex, headers, 'break_minutes_is_manual', breakMinutesIsManual);
      setCellByColumnName_(sheet, rowIndex, headers, 'work_minutes', workMinutes);
      setCellByColumnName_(sheet, rowIndex, headers, 'is_holiday', isHoliday);
      setCellByColumnName_(sheet, rowIndex, headers, 'remarks', remarks);
      setCellByColumnName_(sheet, rowIndex, headers, 'source', 'manual');
    }
    savedCount++;
  }

  return { success: true, data: { saved: savedCount } };
}

function appendAttendanceHistory_(date, staffId, field, oldValue, newValue, editorId, editorRole, reason) {
  const sheet = getOrCreateSheet(SHEETS.ATTENDANCE_HISTORY);
  sheet.appendRow([
    date, staffId, field,
    oldValue == null ? '' : String(oldValue),
    newValue == null ? '' : String(newValue),
    new Date().toISOString(),
    editorId || '',
    editorRole || 'staff',
    reason || ''
  ]);
}

// Helper function to check nursing insurance eligibility
function isNursingInsuranceTarget(birthDate) {
  if (!birthDate) return false;

  const birth = toDateOrNull_(birthDate);
  if (!birth) return false;
  const today = new Date();

  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age >= 40 && age < 65;
}

// ============================================================
// Shift parser & handlers
// ============================================================

/**
 * シフトセル文字列をパース。
 *  - "9:00-18:00" → { isOff:false, startTime, endTime }
 *  - "休"          → { isOff:true }
 *  - 末尾 "(仮)"   → tentative:true
 */
function parseShiftCell_(cellValue) {
  if (cellValue == null) return { defined: false, isTentative: false, isOff: false };
  let raw;
  if (cellValue instanceof Date) {
    raw = String(cellValue);
  } else {
    raw = String(cellValue);
  }
  raw = raw.trim();
  if (!raw) return { defined: false, isTentative: false, isOff: false };

  // 半角・全角の "(仮)" 両対応
  const tentative = /[\(（]仮[\)）]/.test(raw);
  const cleaned = raw.replace(/[\(（]仮[\)）]/g, '').trim();

  if (cleaned === '休' || cleaned === '×' || cleaned === '-' || cleaned === 'OFF' || cleaned === 'off') {
    return { defined: true, isOff: true, isTentative: tentative, rawCell: raw };
  }

  // 全角コロン・全角ハイフン・全角数字を半角に正規化
  const normalized = cleaned
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[:：]/g, ':')
    .replace(/[~〜ー―—–-]/g, '-');

  const m = normalized.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (m) {
    const startTime = String(m[1]).padStart(2, '0') + ':' + m[2];
    const endTime = String(m[3]).padStart(2, '0') + ':' + m[4];
    return { defined: true, isOff: false, isTentative: tentative, startTime, endTime, rawCell: raw };
  }

  return { defined: true, isOff: false, isTentative: tentative, parseError: raw, rawCell: raw };
}

/**
 * 月次のシフトシート（shift_YYYYMM）から全スタッフ × 全日付分の Shift[] を返す。
 */
function readShiftSheet_(year, month) {
  const ss = getSpreadsheet();
  const name = shiftSheetName(year, month);
  const sheet = ss.getSheetByName(name);
  if (!sheet) return { exists: false, shifts: [] };

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { exists: true, shifts: [] };

  const headers = data[0].map(h => h == null ? '' : String(h).trim());
  // column 0 = 日付, column 1 = 曜日, column 2..N = staff names
  const staffCols = [];
  for (let c = 2; c < headers.length; c++) {
    if (headers[c]) staffCols.push({ name: headers[c], col: c });
  }

  // staff_master からスタッフ名 → staff_id のマッピング
  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staffData = sheetToObjects(staffSheet);
  const nameToId = {};
  staffData.forEach(s => { if (s.name) nameToId[String(s.name).trim()] = s.staff_id; });

  const shifts = [];
  for (let r = 1; r < data.length; r++) {
    const dateRaw = data[r][0];
    if (!dateRaw) continue;
    const dateStr = formatDateValue_(dateRaw, year, month);
    if (!dateStr) continue;

    staffCols.forEach(sc => {
      const parsed = parseShiftCell_(data[r][sc.col]);
      if (!parsed.defined) return;
      const staffId = nameToId[String(sc.name).trim()];
      shifts.push({
        staffId: staffId || '',
        staffName: sc.name,
        date: dateStr,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        isOff: parsed.isOff,
        isTentative: parsed.isTentative,
        parseError: parsed.parseError,
        rawCell: parsed.rawCell
      });
    });
  }

  return { exists: true, shifts };
}

/**
 * 日付セルの値を YYYY-MM-DD に正規化。
 *  - Date オブジェクト → そのまま整形
 *  - "7/1" → year/month を補って整形
 */
function formatDateValue_(value, defaultYear, defaultMonth) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  // 数値（シリアル値）として保持されているケースは GAS で日付セルから来ることがあるが、
  // 通常 getValue() が Date を返すため通常は到達しない。念のため数値→文字列化してパース継続。
  const s = String(value).trim();
  if (!s) return null;
  // M/D
  let m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    return defaultYear + '-' + String(parseInt(m[1], 10)).padStart(2, '0') + '-' + String(parseInt(m[2], 10)).padStart(2, '0');
  }
  // YYYY/M/D
  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    return m[1] + '-' + String(parseInt(m[2], 10)).padStart(2, '0') + '-' + String(parseInt(m[3], 10)).padStart(2, '0');
  }
  // YYYY-MM-DD
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    return m[1] + '-' + String(parseInt(m[2], 10)).padStart(2, '0') + '-' + String(parseInt(m[3], 10)).padStart(2, '0');
  }
  return null;
}

/** GET shifts/monthly?year=&month= → 全スタッフの月次シフト */
function handleGetMonthlyShifts(params) {
  const year = parseInt(params.year, 10);
  const month = parseInt(params.month, 10);
  if (!year || !month || month < 1 || month > 12) return { success: false, error: '年月が不正または不足しています' };
  const result = readShiftSheet_(year, month);
  return { success: true, data: { exists: result.exists, shifts: result.shifts } };
}

/** GET shifts/staff-month?staffId=&year=&month= → 当該スタッフの月次シフト */
function handleGetStaffMonthShifts(params) {
  const { staffId } = params;
  const year = parseInt(params.year, 10);
  const month = parseInt(params.month, 10);
  if (!staffId || !year || !month || month < 1 || month > 12) return { success: false, error: '必須パラメータが不正または不足しています' };
  const result = readShiftSheet_(year, month);
  return {
    success: true,
    data: {
      exists: result.exists,
      shifts: result.shifts.filter(s => s.staffId === staffId)
    }
  };
}

/**
 * 翌月のシフトシート雛形を自動生成。日付・曜日・アクティブスタッフ列を入れた状態で作成。
 * 管理者がスクリプトエディタから手動実行する想定。
 */
function generateShiftTemplate(year, month) {
  if (!year || !month) {
    const next = new Date();
    next.setMonth(next.getMonth() + 1);
    year = next.getFullYear();
    month = next.getMonth() + 1;
  }
  const ss = getSpreadsheet();
  const name = shiftSheetName(year, month);
  if (ss.getSheetByName(name)) {
    Logger.log(name + ' already exists');
    return { success: false, message: name + ' already exists' };
  }
  const sheet = ss.insertSheet(name);

  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staffData = sheetToObjects(staffSheet).filter(s => s.status === 'active');
  const headers = ['日付', '曜日'].concat(staffData.map(s => s.name));
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  const lastDay = new Date(year, month, 0).getDate();
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const rows = [];
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = month + '/' + d;
    const dow = new Date(year, month - 1, d).getDay();
    rows.push([dateStr, weekdays[dow]].concat(staffData.map(() => '')));
  }
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

  Logger.log('Generated shift template: ' + name);
  return { success: true, sheetName: name };
}

// ============================================================
// Application handlers
// ============================================================

function handleCreateApplication(body) {
  const { staffId, date, type, reason, details } = body;
  if (!staffId || !date || !type || !reason) {
    return { success: false, error: '必須項目が入力されていません' };
  }

  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staff = sheetToObjects(staffSheet).find(s => s.staff_id === staffId);
  if (!staff) return { success: false, error: 'スタッフが見つかりません' };

  const sheet = getOrCreateSheet(SHEETS.APPLICATIONS);
  const id = 'AP' + Date.now() + Math.random().toString(36).slice(2, 6);
  const now = new Date().toISOString();
  sheet.appendRow([
    id, staffId, staff.name, date, type, reason,
    JSON.stringify(details || {}),
    'pending', now, '', '', ''
  ]);

  // notify all admins
  notifyAdminsApplicationSubmitted_(staff, date, type, reason);

  return { success: true, data: { id } };
}

function handleListApplications(params) {
  const sheet = getOrCreateSheet(SHEETS.APPLICATIONS);
  const data = sheetToObjects(sheet);
  const { staffId, status, yearMonth } = params;

  let filtered = data;
  if (staffId) filtered = filtered.filter(r => r.staff_id === staffId);
  if (status) filtered = filtered.filter(r => r.status === status);
  if (yearMonth) filtered = filtered.filter(r => formatDateOnly_(r.date).startsWith(yearMonth));

  return {
    success: true,
    data: filtered.map(r => ({
      id: r.id,
      staffId: r.staff_id,
      staffName: r.staff_name,
      date: formatDateOnly_(r.date),
      type: r.type,
      reason: r.reason,
      details: safeJsonParse_(r.details_json) || {},
      status: r.status,
      submittedAt: toIsoString_(r.submitted_at),
      reviewedAt: toIsoString_(r.reviewed_at),
      reviewedBy: r.reviewed_by,
      rejectionReason: r.rejection_reason
    }))
  };
}

function handleApproveApplication(body) {
  const { id, reviewedBy } = body;
  if (!id) return { success: false, error: 'IDが指定されていません' };
  const sheet = getOrCreateSheet(SHEETS.APPLICATIONS);
  const rowIndex = findRowIndex(sheet, 'id', id);
  if (rowIndex === -1) return { success: false, error: '申請が見つかりません' };

  const headers = getHeaderRow_(sheet);
  setCellByColumnName_(sheet, rowIndex, headers, 'status', 'approved');
  setCellByColumnName_(sheet, rowIndex, headers, 'reviewed_at', new Date().toISOString());
  setCellByColumnName_(sheet, rowIndex, headers, 'reviewed_by', reviewedBy || '');

  // notify staff
  const app = sheetToObjects(sheet).find(r => r.id === id);
  if (app) {
    try { notifyStaffApplicationReviewed_(app, 'approved'); }
    catch (e) { Logger.log('notifyStaffApplicationReviewed_ failed: ' + (e && e.message)); }
  }

  return { success: true };
}

function handleRejectApplication(body) {
  const { id, reviewedBy, rejectionReason } = body;
  if (!id || !rejectionReason) {
    return { success: false, error: 'IDまたは却下理由が指定されていません' };
  }
  const sheet = getOrCreateSheet(SHEETS.APPLICATIONS);
  const rowIndex = findRowIndex(sheet, 'id', id);
  if (rowIndex === -1) return { success: false, error: '申請が見つかりません' };

  const headers = getHeaderRow_(sheet);
  setCellByColumnName_(sheet, rowIndex, headers, 'status', 'rejected');
  setCellByColumnName_(sheet, rowIndex, headers, 'reviewed_at', new Date().toISOString());
  setCellByColumnName_(sheet, rowIndex, headers, 'reviewed_by', reviewedBy || '');
  setCellByColumnName_(sheet, rowIndex, headers, 'rejection_reason', rejectionReason);

  const app = sheetToObjects(sheet).find(r => r.id === id);
  if (app) {
    try { notifyStaffApplicationReviewed_(app, 'rejected', rejectionReason); }
    catch (e) { Logger.log('notifyStaffApplicationReviewed_ failed: ' + (e && e.message)); }
  }

  return { success: true };
}

// ============================================================
// Monthly submission handlers
// ============================================================

function getSubmissionStatus_(staffId, yearMonth) {
  const sheet = getOrCreateSheet(SHEETS.SUBMISSIONS);
  const data = sheetToObjects(sheet);
  const targetYm = formatYearMonthValue_(yearMonth);
  const rec = data.find(r => r.staff_id === staffId && formatYearMonthValue_(r.year_month) === targetYm);
  return rec ? rec.status : 'draft';
}

function handleGetSubmissionStatus(params) {
  const { staffId, yearMonth } = params;
  if (!staffId || !yearMonth) return { success: false, error: '必須パラメータが指定されていません' };
  const targetYm = formatYearMonthValue_(yearMonth);
  const sheet = getOrCreateSheet(SHEETS.SUBMISSIONS);
  const rec = sheetToObjects(sheet).find(
    r => r.staff_id === staffId && formatYearMonthValue_(r.year_month) === targetYm
  );
  if (!rec) {
    return { success: true, data: { staffId, yearMonth, status: 'draft' } };
  }
  return {
    success: true,
    data: {
      staffId: rec.staff_id,
      staffName: rec.staff_name,
      yearMonth: formatYearMonthValue_(rec.year_month),
      status: rec.status,
      submittedAt: toIsoString_(rec.submitted_at),
      reviewedAt: toIsoString_(rec.reviewed_at),
      reviewedBy: rec.reviewed_by,
      remarks: rec.remarks,
      rejectionReason: rec.rejection_reason
    }
  };
}

/**
 * 月次提出。提出ゲートチェック: 全申請が approved であること（pending/rejected があると失敗）。
 * 差異検出（未申請の差異）はクライアント側で行う想定（GAS側では申請ステータスのみ確認）。
 */
function handleSubmitMonthly(body) {
  const { staffId, yearMonth, remarks } = body;
  if (!staffId || !yearMonth) return { success: false, error: '必須パラメータが指定されていません' };

  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staff = sheetToObjects(staffSheet).find(s => s.staff_id === staffId);
  if (!staff) return { success: false, error: 'スタッフが見つかりません' };

  // 既存提出の重複チェック: 既に提出済み/承認済みの場合は再提出不可。
  // 差戻し / draft の場合のみ再提出を許可する。
  const existingStatus = getSubmissionStatus_(staffId, yearMonth);
  if (existingStatus === 'submitted') {
    return {
      success: false,
      error: 'すでに提出済みです。管理者が承認または差戻しするまで再提出はできません。'
    };
  }
  if (existingStatus === 'approved') {
    return {
      success: false,
      error: 'この月は既に確定済みのため再提出できません。'
    };
  }

  // ゲート: 当月の全申請が approved か
  const apps = sheetToObjects(getOrCreateSheet(SHEETS.APPLICATIONS))
    .filter(a => a.staff_id === staffId && formatDateOnly_(a.date).startsWith(yearMonth));
  const blocked = apps.filter(a => a.status !== 'approved');
  if (blocked.length > 0) {
    return {
      success: false,
      error: '未承認の申請があります（' + blocked.length + '件）。承認後に再度提出してください。'
    };
  }

  const sheet = getOrCreateSheet(SHEETS.SUBMISSIONS);
  const rowIndex = findSubmissionRowIndex_(sheet, staffId, yearMonth);
  const now = new Date().toISOString();

  if (rowIndex === -1) {
    sheet.appendRow([staffId, staff.name, yearMonth, 'submitted', now, '', '', remarks || '', '']);
  } else {
    const headers = getHeaderRow_(sheet);
    setCellByColumnName_(sheet, rowIndex, headers, 'status', 'submitted');
    setCellByColumnName_(sheet, rowIndex, headers, 'submitted_at', now);
    setCellByColumnName_(sheet, rowIndex, headers, 'remarks', remarks || '');
    setCellByColumnName_(sheet, rowIndex, headers, 'rejection_reason', '');
  }

  try { notifyAdminsMonthlySubmitted_(staff, yearMonth); }
  catch (e) { Logger.log('notifyAdminsMonthlySubmitted_ failed: ' + (e && e.message)); }

  return { success: true };
}

function findSubmissionRowIndex_(sheet, staffId, yearMonth) {
  if (!sheet) return -1;
  const data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return -1;
  const headers = data[0] || [];
  const sIdx = headers.indexOf('staff_id');
  const ymIdx = headers.indexOf('year_month');
  if (sIdx === -1 || ymIdx === -1) return -1;
  const targetYm = formatYearMonthValue_(yearMonth);
  for (let i = 1; i < data.length; i++) {
    if (data[i][sIdx] === staffId && formatYearMonthValue_(data[i][ymIdx]) === targetYm) {
      return i + 1;
    }
  }
  return -1;
}

// 同一 staffId × yearMonth に複数行が存在するケース（過去の Date 比較バグで生まれた重複）
// に対応するため、一致する全行のインデックスを返す。
// approve / reject 系処理ではこれを使い、見つかった全行に同じステータス更新を適用することで
// 既存重複を実質的にデデュープする。
function findAllSubmissionRows_(sheet, staffId, yearMonth) {
  const result = [];
  if (!sheet) return result;
  const data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return result;
  const headers = data[0] || [];
  const sIdx = headers.indexOf('staff_id');
  const ymIdx = headers.indexOf('year_month');
  if (sIdx === -1 || ymIdx === -1) return result;
  const targetYm = formatYearMonthValue_(yearMonth);
  for (let i = 1; i < data.length; i++) {
    if (data[i][sIdx] === staffId && formatYearMonthValue_(data[i][ymIdx]) === targetYm) {
      result.push(i + 1);
    }
  }
  return result;
}

function handleListSubmissions(params) {
  const sheet = getOrCreateSheet(SHEETS.SUBMISSIONS);
  const data = sheetToObjects(sheet);
  const { yearMonth, status } = params;

  // 過去のバグ等で同一 (staffId, yearMonth) に複数行が存在する可能性があるため、
  // ここで dedupe する。判定優先度:
  //   1) reviewed_at が新しい方を優先（つまり既に承認/差戻し済みの記録）
  //   2) submitted_at が新しい方
  //   3) status の優先順位 approved > rejected > submitted > draft
  //      （approve/reject 系で全行に同じ更新を入れるためどれを残しても結果は同等だが、
  //       UI 上の見え方が安定するように決定論的に選ぶ）
  const STATUS_ORDER = { approved: 4, rejected: 3, submitted: 2, draft: 1 };
  const dedupedMap = {};
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (!r.staff_id) continue;
    const ym = formatYearMonthValue_(r.year_month);
    if (!ym) continue;
    const key = r.staff_id + '|' + ym;
    const existing = dedupedMap[key];
    if (!existing) {
      dedupedMap[key] = r;
      continue;
    }
    const newReviewed = toIsoString_(r.reviewed_at) || '';
    const oldReviewed = toIsoString_(existing.reviewed_at) || '';
    if (newReviewed !== oldReviewed) {
      if (newReviewed > oldReviewed) dedupedMap[key] = r;
      continue;
    }
    const newSubmitted = toIsoString_(r.submitted_at) || '';
    const oldSubmitted = toIsoString_(existing.submitted_at) || '';
    if (newSubmitted !== oldSubmitted) {
      if (newSubmitted > oldSubmitted) dedupedMap[key] = r;
      continue;
    }
    const newRank = STATUS_ORDER[r.status] || 0;
    const oldRank = STATUS_ORDER[existing.status] || 0;
    if (newRank > oldRank) dedupedMap[key] = r;
  }
  let filtered = Object.keys(dedupedMap).map(k => dedupedMap[k]);

  if (yearMonth) {
    const targetYm = formatYearMonthValue_(yearMonth);
    filtered = filtered.filter(r => formatYearMonthValue_(r.year_month) === targetYm);
  }
  if (status) filtered = filtered.filter(r => r.status === status);
  return {
    success: true,
    data: filtered.map(r => ({
      staffId: r.staff_id,
      staffName: r.staff_name,
      yearMonth: formatYearMonthValue_(r.year_month),
      status: r.status,
      submittedAt: toIsoString_(r.submitted_at),
      reviewedAt: toIsoString_(r.reviewed_at),
      reviewedBy: r.reviewed_by,
      remarks: r.remarks,
      rejectionReason: r.rejection_reason
    }))
  };
}

function handleApproveSubmission(body) {
  const { staffId, yearMonth, reviewedBy } = body;
  if (!staffId || !yearMonth) return { success: false, error: '必須パラメータが指定されていません' };
  const sheet = getOrCreateSheet(SHEETS.SUBMISSIONS);
  // 重複行が存在する可能性を考慮し、一致する全行に対して同じ更新を適用する
  const rowIndices = findAllSubmissionRows_(sheet, staffId, yearMonth);
  if (rowIndices.length === 0) return { success: false, error: '月次提出が見つかりません' };

  const headers = getHeaderRow_(sheet);
  const now = new Date().toISOString();
  for (let k = 0; k < rowIndices.length; k++) {
    const ri = rowIndices[k];
    setCellByColumnName_(sheet, ri, headers, 'status', 'approved');
    setCellByColumnName_(sheet, ri, headers, 'reviewed_at', now);
    setCellByColumnName_(sheet, ri, headers, 'reviewed_by', reviewedBy || '');
  }

  const targetYm = formatYearMonthValue_(yearMonth);
  const sub = sheetToObjects(sheet).find(
    r => r.staff_id === staffId && formatYearMonthValue_(r.year_month) === targetYm
  );
  if (sub) {
    try { notifyStaffMonthlyReviewed_(sub, 'approved'); }
    catch (e) { Logger.log('notifyStaffMonthlyReviewed_ failed: ' + (e && e.message)); }
  }

  return { success: true, data: { updated: rowIndices.length } };
}

function handleRejectSubmission(body) {
  const { staffId, yearMonth, reviewedBy, rejectionReason } = body;
  if (!staffId || !yearMonth || !rejectionReason) {
    return { success: false, error: '必須項目が入力されていません' };
  }
  const sheet = getOrCreateSheet(SHEETS.SUBMISSIONS);
  // 重複行も含めて一括差戻し
  const rowIndices = findAllSubmissionRows_(sheet, staffId, yearMonth);
  if (rowIndices.length === 0) return { success: false, error: '月次提出が見つかりません' };

  const headers = getHeaderRow_(sheet);
  const now = new Date().toISOString();
  for (let k = 0; k < rowIndices.length; k++) {
    const ri = rowIndices[k];
    setCellByColumnName_(sheet, ri, headers, 'status', 'rejected');
    setCellByColumnName_(sheet, ri, headers, 'reviewed_at', now);
    setCellByColumnName_(sheet, ri, headers, 'reviewed_by', reviewedBy || '');
    setCellByColumnName_(sheet, ri, headers, 'rejection_reason', rejectionReason);
  }

  const targetYm = formatYearMonthValue_(yearMonth);
  const sub = sheetToObjects(sheet).find(
    r => r.staff_id === staffId && formatYearMonthValue_(r.year_month) === targetYm
  );
  if (sub) {
    try { notifyStaffMonthlyReviewed_(sub, 'rejected', rejectionReason); }
    catch (e) { Logger.log('notifyStaffMonthlyReviewed_ failed: ' + (e && e.message)); }
  }

  return { success: true, data: { updated: rowIndices.length } };
}

// ============================================================
// Password / Admin management
// ============================================================

function handleChangePassword(body) {
  const { email, oldPassword, newPassword } = body;
  if (!email || !oldPassword || !newPassword) return { success: false, error: '必須項目が入力されていません' };

  const normalized = String(email).trim().toLowerCase();
  const ctx = findUserByEmail_(normalized);
  if (!ctx) return { success: false, error: 'ユーザーが見つかりません' };

  const expected = hashPassword(oldPassword, ctx.user.password_salt);
  if (expected !== ctx.user.password_hash) {
    return { success: false, error: '現在のパスワードが正しくありません' };
  }

  const newSalt = generateSalt();
  const newHash = hashPassword(newPassword, newSalt);
  const sheet = ctx.sheet;
  const headers = getHeaderRow_(sheet);
  setCellByColumnName_(sheet, ctx.rowIndex, headers, 'password_hash', newHash);
  setCellByColumnName_(sheet, ctx.rowIndex, headers, 'password_salt', newSalt);

  return { success: true };
}

/** 管理者によるパスワードリセット（管理者の認可は呼び出し側で確認する想定） */
function handleResetPassword(body) {
  const { email, newPassword } = body;
  if (!email || !newPassword) return { success: false, error: '必須項目が入力されていません' };
  const normalized = String(email).trim().toLowerCase();
  const ctx = findUserByEmail_(normalized);
  if (!ctx) return { success: false, error: 'ユーザーが見つかりません' };

  const newSalt = generateSalt();
  const newHash = hashPassword(newPassword, newSalt);
  const sheet = ctx.sheet;
  const headers = getHeaderRow_(sheet);
  setCellByColumnName_(sheet, ctx.rowIndex, headers, 'password_hash', newHash);
  setCellByColumnName_(sheet, ctx.rowIndex, headers, 'password_salt', newSalt);
  return { success: true };
}

function findUserByEmail_(email) {
  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staffData = sheetToObjects(staffSheet);
  for (let i = 0; i < staffData.length; i++) {
    if (String(staffData[i].email || '').toLowerCase() === email) {
      return { user: staffData[i], sheet: staffSheet, rowIndex: i + 2, kind: 'staff' };
    }
  }
  const adminSheet = getOrCreateSheet(SHEETS.ADMINS);
  const adminData = sheetToObjects(adminSheet);
  for (let i = 0; i < adminData.length; i++) {
    if (String(adminData[i].email || '').toLowerCase() === email) {
      return { user: adminData[i], sheet: adminSheet, rowIndex: i + 2, kind: 'admin' };
    }
  }
  return null;
}

function handleListAdmins() {
  const sheet = getOrCreateSheet(SHEETS.ADMINS);
  const data = sheetToObjects(sheet);
  return {
    success: true,
    data: data.map(a => ({ adminId: a.admin_id, email: a.email, name: a.name }))
  };
}

function handleCreateAdmin(body) {
  const { name, email, password } = body;
  if (!name || !email || !password) return { success: false, error: '必須項目が入力されていません' };

  const normalized = String(email).trim().toLowerCase();
  const sheet = getOrCreateSheet(SHEETS.ADMINS);
  if (sheetToObjects(sheet).find(a => String(a.email || '').toLowerCase() === normalized)) {
    return { success: false, error: 'このメールアドレスは既に登録されています' };
  }

  const adminId = 'A' + String(Date.now()).slice(-6);
  const salt = generateSalt();
  const hash = hashPassword(password, salt);
  sheet.appendRow([adminId, normalized, hash, salt, name, new Date().toISOString()]);
  return { success: true, data: { adminId } };
}

function handleUpdateAdmin(body) {
  const { adminId, name, email, password } = body;
  if (!adminId) return { success: false, error: '管理者IDが指定されていません' };
  const sheet = getOrCreateSheet(SHEETS.ADMINS);
  const rowIndex = findRowIndex(sheet, 'admin_id', adminId);
  if (rowIndex === -1) return { success: false, error: '管理者が見つかりません' };

  const headers = getHeaderRow_(sheet);
  if (name) setCellByColumnName_(sheet, rowIndex, headers, 'name', name);
  if (email) setCellByColumnName_(sheet, rowIndex, headers, 'email', String(email).trim().toLowerCase());
  if (password) {
    const salt = generateSalt();
    const hash = hashPassword(password, salt);
    setCellByColumnName_(sheet, rowIndex, headers, 'password_hash', hash);
    setCellByColumnName_(sheet, rowIndex, headers, 'password_salt', salt);
  }
  return { success: true };
}

function handleDeleteAdmin(body) {
  const { adminId } = body;
  if (!adminId) return { success: false, error: '管理者IDが指定されていません' };
  const sheet = getOrCreateSheet(SHEETS.ADMINS);
  const rowIndex = findRowIndex(sheet, 'admin_id', adminId);
  if (rowIndex === -1) return { success: false, error: '管理者が見つかりません' };
  sheet.deleteRow(rowIndex);
  return { success: true };
}

// ============================================================
// Attendance edit history
// ============================================================

function handleGetAttendanceHistory(params) {
  const sheet = getOrCreateSheet(SHEETS.ATTENDANCE_HISTORY);
  const data = sheetToObjects(sheet);
  const { staffId, date } = params;
  let filtered = data;
  if (staffId) filtered = filtered.filter(r => r.staff_id === staffId);
  if (date) filtered = filtered.filter(r => formatDateOnly_(r.date) === date);
  return {
    success: true,
    data: filtered.map(r => ({
      date: formatDateOnly_(r.date),
      staffId: r.staff_id,
      field: r.field,
      oldValue: r.old_value == null ? '' : String(r.old_value),
      newValue: r.new_value == null ? '' : String(r.new_value),
      editedAt: toIsoString_(r.edited_at),
      editedBy: r.edited_by,
      editorRole: r.editor_role,
      reason: r.reason
    }))
  };
}

// ============================================================
// Email notifications (MailApp.sendEmail)
// ============================================================

function getAdminEmails_() {
  const sheet = getOrCreateSheet(SHEETS.ADMINS);
  return sheetToObjects(sheet).map(a => a.email).filter(e => !!e);
}

function safeSendEmail_(to, subject, body) {
  try {
    if (!to) return;
    // noReply: true は Google Workspace 契約のドメインでのみ有効。個人アカウントでは無視される。
    // 失敗時は throw されることがあるので try/catch で握りつぶす。
    MailApp.sendEmail({
      to: to,
      subject: subject,
      body: body,
      noReply: true
    });
  } catch (e) {
    // noReply 等のオプションで失敗するケースのため、フォールバックで再送
    try {
      MailApp.sendEmail(to, subject, body);
    } catch (e2) {
      Logger.log('Mail send failed to=' + to + ' err=' + e2.message);
    }
  }
}

function notifyAdminsApplicationSubmitted_(staff, date, type, reason) {
  const admins = getAdminEmails_();
  if (admins.length === 0) return;
  const typeLabel = applicationTypeLabel_(type);
  const subject = '【勤怠申請】' + staff.name + ' から ' + typeLabel + ' の申請があります';
  const body = staff.name + 'さんから以下の申請が届きました。\n\n'
    + '対象日: ' + date + '\n'
    + '種別: ' + typeLabel + '\n'
    + '理由: ' + reason + '\n\n'
    + '管理画面にて承認/却下をお願いします。';
  admins.forEach(email => safeSendEmail_(email, subject, body));
}

function notifyStaffApplicationReviewed_(app, status, rejectionReason) {
  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staff = sheetToObjects(staffSheet).find(s => s.staff_id === app.staff_id);
  if (!staff || !staff.email) return;
  const typeLabel = applicationTypeLabel_(app.type);
  const subject = '【勤怠申請】' + app.date + ' の' + typeLabel + 'が ' + (status === 'approved' ? '承認' : '却下') + ' されました';
  let body = staff.name + 'さん\n\n'
    + app.date + ' の' + typeLabel + '申請が ' + (status === 'approved' ? '承認' : '却下') + ' されました。\n';
  if (status === 'rejected' && rejectionReason) {
    body += '\n却下理由: ' + rejectionReason + '\n';
  }
  safeSendEmail_(staff.email, subject, body);
}

function notifyAdminsMonthlySubmitted_(staff, yearMonth) {
  const admins = getAdminEmails_();
  if (admins.length === 0) return;
  const subject = '【月次提出】' + staff.name + ' が ' + yearMonth + ' の勤怠を提出しました';
  const body = staff.name + 'さんが ' + yearMonth + ' の勤怠を提出しました。管理画面で確認してください。';
  admins.forEach(email => safeSendEmail_(email, subject, body));
}

function notifyStaffMonthlyReviewed_(sub, status, rejectionReason) {
  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staff = sheetToObjects(staffSheet).find(s => s.staff_id === sub.staff_id);
  if (!staff || !staff.email) return;
  const subject = '【月次勤怠】' + sub.year_month + ' が ' + (status === 'approved' ? '確定' : '差し戻し') + ' されました';
  let body = staff.name + 'さん\n\n' + sub.year_month + ' の勤怠が ' + (status === 'approved' ? '確定' : '差し戻し') + ' されました。\n';
  if (status === 'rejected' && rejectionReason) {
    body += '\n差戻理由: ' + rejectionReason + '\n再編集後に再提出してください。\n';
  }
  safeSendEmail_(staff.email, subject, body);
}

function applicationTypeLabel_(type) {
  const map = {
    late_arrival: '遅刻',
    early_leave: '早退',
    overtime: '残業',
    absence: '欠勤',
    extra_work: 'シフト外勤務',
    shift_change: '時刻変更',
    break_deviation: '休憩相違'
  };
  return map[type] || type;
}

// ============================================================
// Misc helpers
// ============================================================

function safeJsonParse_(s) {
  if (!s) return null;
  try { return JSON.parse(String(s)); } catch (e) { return null; }
}

/**
 * onOpen: スプレッドシート起動時にメニューを追加
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('勤怠管理')
    .addItem('翌月のシフト雛形を作成', 'menuGenerateNextMonthShift')
    .addItem('テストスタッフ追加', 'addTestStaff')
    .addItem('テスト管理者追加', 'addTestAdmin')
    .addItem('システム初期化', 'setupSystem')
    .addToUi();
}

function menuGenerateNextMonthShift() {
  const result = generateShiftTemplate();
  SpreadsheetApp.getUi().alert(result.success ? '作成: ' + result.sheetName : '失敗: ' + (result.message || ''));
}
