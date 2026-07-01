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

// このコードのバージョン。Apps Script に最新コードが反映されているかを
// メニュー「コードのバージョンを確認」で確認するための目印。
// 出勤簿の [h]:mm 書式修正・提出ゲートの重複行修正を含む版。
const CODE_VERSION = '2026-06-17c (submit-gate fix + attendance reassign tool)';

// 月次出勤簿の提出ルール
// - 提出期限: 毎月 7 日（前月分の出勤簿）
// - 打刻ブロック開始日: 毎月 4 日（この日以降、前月未提出だと打刻不可）
const MONTHLY_SUBMISSION_DEADLINE_DAY = 7;
const MONTHLY_SUBMISSION_BLOCK_DAY = 4;

// PBKDF2 iteration count for password hashing
const PBKDF2_ITERATIONS = 10000;

// Sheet names (日本語に統一)
const SHEETS = {
  STAFF_MASTER: 'スタッフマスター',
  ADMINS: '管理者',
  PAID_LEAVE: '有給休暇',
  INSURANCE_RATES: '保険料率',
  STANDARD_REMUNERATION: '標準報酬月額',
  APPLICATIONS: '勤怠申請',
  SUBMISSIONS: '月次提出',
  ATTENDANCE_HISTORY: '編集履歴',
  SHIFT_REQUESTS: '希望休申請',
};

// 旧シート名 → 新シート名のマッピング（移行ヘルパで使用）
const LEGACY_SHEET_NAME_MAP = {
  'staff_master': SHEETS.STAFF_MASTER,
  'admins': SHEETS.ADMINS,
  'paid_leave': SHEETS.PAID_LEAVE,
  'insurance_rates': SHEETS.INSURANCE_RATES,
  'standard_remuneration': SHEETS.STANDARD_REMUNERATION,
  'applications': SHEETS.APPLICATIONS,
  'submissions': SHEETS.SUBMISSIONS,
  'attendance_history': SHEETS.ATTENDANCE_HISTORY,
  'shift_requests': SHEETS.SHIFT_REQUESTS,
};

// シートのカラムヘッダー: 英語キー(コード) ↔ 日本語ラベル(表示) のマッピング。
// コード内では英語キー（snake_case）でアクセスし、シート上の表示は日本語にする。
// sheetToObjects / findHeaderIndex_ などの helper が両方向を吸収する。
const HEADER_LABELS = {
  'id': 'ID',
  'staff_id': 'スタッフID',
  'staff_name': 'スタッフ名',
  'admin_id': '管理者ID',
  'email': 'メールアドレス',
  'password_hash': 'パスワードハッシュ',
  'password_salt': 'ソルト',
  'name': '氏名',
  'monthly_salary': '月給',
  'transportation': '交通費',
  'hire_date': '入社日',
  'paid_leave_balance': '有給残日数',
  'status': 'ステータス',
  'birth_date': '生年月日',
  'created_at': '作成日時',
  'request_date': '申請日',
  'leave_date': '取得希望日',
  'approved_date': '承認日',
  'remarks': '備考',
  'effective_date': '適用開始日',
  'health_insurance_rate': '健康保険料率',
  'nursing_insurance_rate': '介護保険料率',
  'pension_rate': '厚生年金料率',
  'employment_insurance_rate': '雇用保険料率',
  'updated_at': '更新日時',
  'updated_by': '更新者',
  'grade': '等級',
  'monthly_min': '月額下限',
  'monthly_max': '月額上限',
  'standard_monthly': '標準報酬月額',
  'date': '日付',
  'type': '種別',
  'reason': '理由',
  'details_json': '詳細(JSON)',
  'details_summary': '内容',
  'reason_type': '理由区分',
  'planned_start': '予定開始時刻',
  'planned_end': '予定終了時刻',
  'actual_start': '実績開始時刻',
  'actual_end': '実績終了時刻',
  'planned_break_min': '予定休憩(分)',
  'actual_break_min': '実績休憩(分)',
  'overtime_min': '残業(分)',
  'submitted_at': '提出日時',
  'reviewed_at': '審査日時',
  'reviewed_by': '審査者',
  'rejection_reason': '却下理由',
  'year_month': '対象年月',
  'field': 'フィールド',
  'old_value': '旧値',
  'new_value': '新値',
  'edited_at': '編集日時',
  'edited_by': '編集者',
  'editor_role': '編集者種別',
  'target_year_month': '対象年月',
  'days_json': '希望日(JSON)',
  'days_summary': '日付別状況',
  'clock_in': '出勤',
  'clock_out': '退勤',
  'clock_out_type': '退勤区分',
  'break_minutes': '休憩分',
  'break_minutes_is_manual': '休憩手動',
  'work_minutes': '実労働分',
  'late_minutes': '遅刻分',
  'early_leave_minutes': '早退分',
  'is_holiday': '休日',
  'source': '入力方法',
  'base_salary': '基本給',
  'total_work_hours': '総労働時間',
  'overtime_hours': '残業時間',
  'night_hours': '深夜時間',
  'holiday_hours': '休日労働時間',
  'overtime_pay': '残業手当',
  'night_pay': '深夜手当',
  'holiday_pay': '休日手当',
  'incentive': 'インセンティブ',
  'gross_pay': '総支給',
  'late_deduction': '遅刻控除',
  'early_leave_deduction': '早退控除',
  'health_insurance': '健康保険料',
  'nursing_insurance': '介護保険料',
  'pension': '厚生年金',
  'employment_insurance': '雇用保険料',
  'income_tax': '所得税',
  'resident_tax': '住民税',
  'total_deduction': '控除合計',
  'net_pay': '差引支給額',
  'item_name': '項目',
  'amount': '金額',
};

// 日本語 → 英語の逆引き（実行時に1回だけ構築）
const REVERSE_HEADER_LABELS = (function () {
  const out = {};
  for (const k in HEADER_LABELS) {
    if (Object.prototype.hasOwnProperty.call(HEADER_LABELS, k)) {
      out[HEADER_LABELS[k]] = k;
    }
  }
  return out;
})();

// 列に格納される選択値 (enum) の英語キー ↔ 日本語ラベル。
// シート上は日本語で表示し、コード上は従来通り英語キーで比較する。
// sheetToObjects が読込時に日本語→英語へ正規化し、setCellByColumnName_/
// localizeEnumValue_ が書込時に英語→日本語へ変換する。
const ENUM_LABEL_MAP = {
  // 申請種別 (application.type / shift diff kind)
  'late_arrival': '遅刻',
  'early_leave': '早退',
  'overtime': '残業',
  'absence': '欠勤',
  'extra_work': 'シフト外勤務',
  'shift_change': '時刻変更',
  'break_deviation': '休憩相違',
  // 申請 / 有給 / 希望休のステータス
  'pending': '審査待ち',
  // 月次提出のステータス（『審査待ち』とは別概念のため区別）
  'submitted': '承認待ち',
  'draft': '下書き',
  // 共通の承認結果
  'approved': '承認',
  'rejected': '却下',
  'cancelled': '取消',
  // 勤怠の入力経路
  'punch': '打刻',
  'manual': '手動入力',
  // 退勤区分
  'normal': '通常',
  'forgot': '打刻忘れ',
  // 編集者種別
  'staff': 'スタッフ',
  'admin': '管理者',
  // スタッフ在籍状況
  'active': '在籍',
  'inactive': '退職',
  // 遅刻/早退の理由区分
  'company': '会社都合',
  'personal': '個人都合',
};

const REVERSE_ENUM_LABEL_MAP = (function () {
  const out = {};
  for (const k in ENUM_LABEL_MAP) {
    if (Object.prototype.hasOwnProperty.call(ENUM_LABEL_MAP, k)) {
      out[ENUM_LABEL_MAP[k]] = k;
    }
  }
  return out;
})();

// enum 値として localize/normalize 対象とする列キーの集合（英語キーで指定）
const ENUM_COLUMNS = {
  'type': true,
  'status': true,
  'source': true,
  'clock_out_type': true,
  'editor_role': true,
  'reason_type': true,
};

// 英語キー → 日本語ラベル。未登録キーはそのまま返す（user 入力テキスト等を破壊しないため）。
function localizeEnumValue_(value) {
  if (typeof value !== 'string') return value;
  return ENUM_LABEL_MAP[value] || value;
}

// セル値（日本語ラベル想定）から英語キーに正規化する。
// columnName が enum カラムでない、または値が未登録の場合は as-is で返す。
function normalizeEnumValueFromCell_(columnName, value) {
  if (!ENUM_COLUMNS[columnName]) return value;
  if (typeof value !== 'string') return value;
  return REVERSE_ENUM_LABEL_MAP[value] || value;
}

// 英語 headers 配列 → 日本語 labels 配列。
// 既知の英語キーのみ翻訳、未登録のものはそのまま通す。
function localizeHeaders_(headers) {
  if (!headers) return [];
  return headers.map(function (h) {
    if (typeof h !== 'string') return h;
    return HEADER_LABELS[h] || h;
  });
}

// 与えた headers 行 (英語/日本語混在許容) から、英語キー or 日本語キー どちらでも
// 該当する列の 0-indexed インデックスを返す。見つからなければ -1。
function findHeaderIndex_(headers, key) {
  if (!headers || !headers.length || !key) return -1;
  // 直接ヒット
  const direct = headers.indexOf(key);
  if (direct !== -1) return direct;
  // key が英語 → 日本語ラベルでも探す
  const ja = HEADER_LABELS[key];
  if (ja) {
    const i = headers.indexOf(ja);
    if (i !== -1) return i;
  }
  // key が日本語 → 英語キーでも探す
  const en = REVERSE_HEADER_LABELS[key];
  if (en) {
    const i = headers.indexOf(en);
    if (i !== -1) return i;
  }
  return -1;
}

// 月次シート名（年・月から組み立てる）
function shiftSheetName(year, month) {
  return 'シフト_' + year + String(month).padStart(2, '0');
}
function attendanceSheetName_(year, month) {
  return '勤怠_' + year + String(month).padStart(2, '0');
}
function salarySheetName_(year, month) {
  return '給与_' + year + String(month).padStart(2, '0');
}
function taxSheetName_(year, month) {
  return '税額_' + year + String(month).padStart(2, '0');
}
function incentiveSheetName_(year, month) {
  return '歩合_' + year + String(month).padStart(2, '0');
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
    },
    {
      name: SHEETS.SHIFT_REQUESTS,
      headers: ['id', 'staff_id', 'staff_name', 'target_year_month', 'days_json', 'remarks', 'submitted_at']
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
      const labels = localizeHeaders_(sheetInfo.headers);
      sheet.getRange(1, 1, 1, labels.length).setValues([labels]);
      Logger.log('Added headers to: ' + sheetInfo.name);
    }
  }

  // Add default insurance rates if none exist
  const insuranceSheet = ss.getSheetByName(SHEETS.INSURANCE_RATES);
  if (insuranceSheet) {
    const insuranceData = insuranceSheet.getDataRange().getValues();
    if (insuranceData.length <= 1) {
      const today = Utilities.formatDate(new Date(), scriptTimeZone_(), 'yyyy-MM-dd');
      insuranceSheet.appendRow([today, 4.905, 0.80, 9.15, 0.60, new Date().toISOString(), 'System']);
      Logger.log('Added default insurance rates');
    }
  }

  // Add default standard remuneration grade table (健康保険 全50等級) if none exist
  // 出典: 健康保険(協会けんぽ)標準報酬月額表。報酬月額レンジは「下限以上〜上限以下」。
  // 上限 = 次等級下限 - 1（getStandardRemuneration_ が両端を含む比較を行うため重複回避）。
  // ※保険料率(%)は本表に含めない（INSURANCE_RATES シートで管理）。
  // ※厚生年金の標準報酬月額上限は 650,000(報酬月額635,000以上)。本表は健保50等級ベースの共通表のため、
  //   報酬月額が約63.5万円超のスタッフは厚生年金がわずかに過大計算になり得る点に留意。
  //   なお2027年9月以降、厚生年金の上限は段階的に引き上げ予定（要・最新法令確認）。
  const stdRemSheet = ss.getSheetByName(SHEETS.STANDARD_REMUNERATION);
  if (stdRemSheet) {
    const stdRemData = stdRemSheet.getDataRange().getValues();
    if (stdRemData.length <= 1) {
      // [grade, monthly_min, monthly_max, standard_monthly]
      const STANDARD_REMUNERATION_SEED = [
        [1, 0, 62999, 58000],
        [2, 63000, 72999, 68000],
        [3, 73000, 82999, 78000],
        [4, 83000, 92999, 88000],
        [5, 93000, 100999, 98000],
        [6, 101000, 106999, 104000],
        [7, 107000, 113999, 110000],
        [8, 114000, 121999, 118000],
        [9, 122000, 129999, 126000],
        [10, 130000, 137999, 134000],
        [11, 138000, 145999, 142000],
        [12, 146000, 154999, 150000],
        [13, 155000, 164999, 160000],
        [14, 165000, 174999, 170000],
        [15, 175000, 184999, 180000],
        [16, 185000, 194999, 190000],
        [17, 195000, 209999, 200000],
        [18, 210000, 229999, 220000],
        [19, 230000, 249999, 240000],
        [20, 250000, 269999, 260000],
        [21, 270000, 289999, 280000],
        [22, 290000, 309999, 300000],
        [23, 310000, 329999, 320000],
        [24, 330000, 349999, 340000],
        [25, 350000, 369999, 360000],
        [26, 370000, 394999, 380000],
        [27, 395000, 424999, 410000],
        [28, 425000, 454999, 440000],
        [29, 455000, 484999, 470000],
        [30, 485000, 514999, 500000],
        [31, 515000, 544999, 530000],
        [32, 545000, 574999, 560000],
        [33, 575000, 604999, 590000],
        [34, 605000, 634999, 620000],
        [35, 635000, 664999, 650000],
        [36, 665000, 694999, 680000],
        [37, 695000, 729999, 710000],
        [38, 730000, 769999, 750000],
        [39, 770000, 809999, 790000],
        [40, 810000, 854999, 830000],
        [41, 855000, 904999, 880000],
        [42, 905000, 954999, 930000],
        [43, 955000, 1004999, 980000],
        [44, 1005000, 1054999, 1030000],
        [45, 1055000, 1114999, 1090000],
        [46, 1115000, 1174999, 1150000],
        [47, 1175000, 1234999, 1210000],
        [48, 1235000, 1294999, 1270000],
        [49, 1295000, 1354999, 1330000],
        [50, 1355000, 99999999, 1390000],
      ];
      stdRemSheet.getRange(stdRemSheet.getLastRow() + 1, 1, STANDARD_REMUNERATION_SEED.length, 4)
        .setValues(STANDARD_REMUNERATION_SEED);
      Logger.log('Added default standard remuneration table (' + STANDARD_REMUNERATION_SEED.length + ' grades)');
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

  const today = Utilities.formatDate(new Date(), scriptTimeZone_(), 'yyyy-MM-dd');
  const salt = generateSalt();
  const hash = hashPassword('test1234', salt);
  sheet.appendRow([
    'S000001',
    'test@example.com',
    hash,
    salt,
    'テストスタッフ',
    250000, 15000, today, 10, localizeEnumValue_('active'), '1990-01-01'
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
// 英語キーで呼ばれた場合でも、日本語ラベルが書かれているシートで正しく解決する。
function getColumnIndex_(headers, columnName) {
  const idx = findHeaderIndex_(headers, columnName);
  return idx === -1 ? -1 : idx + 1;
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
    // enum 列なら日本語ラベルに変換してから書き込む
    const finalValue = ENUM_COLUMNS[columnName] ? localizeEnumValue_(value) : value;
    sheet.getRange(rowIndex, col).setValue(finalValue);
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
      'id', 'staff_id', 'staff_name', 'date', 'type', 'reason',
      'reason_type', 'planned_start', 'planned_end', 'actual_start', 'actual_end',
      'planned_break_min', 'actual_break_min', 'overtime_min',
      'status', 'submitted_at', 'reviewed_at', 'reviewed_by',
      'rejection_reason'
    ],
    [SHEETS.SUBMISSIONS]: [
      'staff_id', 'staff_name', 'year_month', 'status', 'submitted_at',
      'reviewed_at', 'reviewed_by', 'remarks', 'rejection_reason'
    ],
    [SHEETS.ATTENDANCE_HISTORY]: [
      'date', 'staff_id', 'field', 'old_value', 'new_value', 'edited_at',
      'edited_by', 'editor_role', 'reason'
    ],
    [SHEETS.SHIFT_REQUESTS]: [
      'id', 'staff_id', 'staff_name', 'target_year_month', 'date',
      'status', 'rejection_reason', 'reviewed_at', 'reviewed_by',
      'submitted_at', 'remarks'
    ],
  };

  if (headers[sheetName]) {
    if (sheet.getMaxColumns() < headers[sheetName].length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), headers[sheetName].length - sheet.getMaxColumns());
    }
    const labels = localizeHeaders_(headers[sheetName]);
    sheet.getRange(1, 1, 1, labels.length).setValues([labels]);
  }
}

// 後方互換: 既存の英名シートが残っているケース用に try-fallback で取得
// columnFormats: { 英語キー: 'HH:mm' 等 } を渡すと、新規作成時のみ列全体に書式設定を適用する
function getOrCreateMonthlySheet_(year, month, primaryName, legacyName, headers, columnFormats) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(primaryName);
  if (!sheet && legacyName) {
    sheet = ss.getSheetByName(legacyName);
    if (sheet) {
      try { sheet.setName(primaryName); } catch (e) { Logger.log('rename failed: ' + e.message); }
    }
  }
  if (!sheet) {
    sheet = ss.insertSheet(primaryName);
    if (headers && headers.length) {
      if (sheet.getMaxColumns() < headers.length) {
        try { sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns()); } catch (e) {}
      }
      const labels = localizeHeaders_(headers);
      sheet.getRange(1, 1, 1, labels.length).setValues([labels]);
    }
    if (columnFormats && headers && headers.length) {
      applyMonthlyColumnFormats_(sheet, headers, columnFormats);
    }
  } else if (columnFormats) {
    // 既存シートにも書式が無ければ適用（idempotent）
    applyMonthlyColumnFormats_(sheet, null, columnFormats);
  }
  return sheet;
}

// 列ごとの数値フォーマットを適用するヘルパ。headers が null の場合はシートの1行目から解決する。
function applyMonthlyColumnFormats_(sheet, headersOrNull, columnFormats) {
  if (!sheet || !columnFormats) return;
  const lastCol = sheet.getLastColumn();
  if (!lastCol) return;
  const headers = headersOrNull && headersOrNull.length
    ? headersOrNull
    : sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const maxRows = Math.max(sheet.getMaxRows(), 1);
  Object.keys(columnFormats).forEach(function (key) {
    const idx = findHeaderIndex_(headers, key);
    if (idx === -1) return;
    try {
      sheet.getRange(2, idx + 1, Math.max(maxRows - 1, 1), 1).setNumberFormat(columnFormats[key]);
    } catch (e) {
      Logger.log('setNumberFormat failed for ' + key + ': ' + (e && e.message));
    }
  });
}

// 指定キーの列に「チェックボックス」データ検証を適用する。FALSE/TRUE が
// シート上で ☐/☑ として可読に表示される。
function applyCheckboxValidation_(sheet, columnKeys) {
  if (!sheet || !columnKeys || columnKeys.length === 0) return;
  const lastCol = sheet.getLastColumn();
  if (!lastCol) return;
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const maxRows = Math.max(sheet.getMaxRows(), 1);
  const rule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  columnKeys.forEach(function (key) {
    const idx = findHeaderIndex_(headers, key);
    if (idx === -1) return;
    try {
      sheet.getRange(2, idx + 1, Math.max(maxRows - 1, 1), 1).setDataValidation(rule);
    } catch (e) {
      Logger.log('setDataValidation(checkbox) failed for ' + key + ': ' + (e && e.message));
    }
  });
}

// Get attendance sheet for a specific month
function getAttendanceSheet(year, month) {
  const mm = String(month).padStart(2, '0');
  const sheet = getOrCreateMonthlySheet_(year, month, attendanceSheetName_(year, month), 'attendance_' + year + mm, [
    'date', 'staff_id', 'name', 'clock_in', 'clock_out', 'clock_out_type',
    'break_minutes', 'break_minutes_is_manual', 'work_minutes',
    'late_minutes', 'early_leave_minutes',
    'is_holiday', 'remarks', 'source'
  ], {
    'date': 'yyyy-mm-dd',
    'clock_in': 'HH:mm',
    'clock_out': 'HH:mm',
  });
  // Boolean 列はチェックボックス表示にする（社労士提出時の可読性のため）
  applyCheckboxValidation_(sheet, ['is_holiday', 'break_minutes_is_manual']);
  return sheet;
}

// Get salary sheet for a specific month
function getSalarySheet(year, month) {
  const mm = String(month).padStart(2, '0');
  return getOrCreateMonthlySheet_(year, month, salarySheetName_(year, month), 'salary_' + year + mm, [
    'staff_id', 'name', 'base_salary', 'total_work_hours', 'overtime_hours',
    'night_hours', 'holiday_hours', 'overtime_pay', 'night_pay', 'holiday_pay',
    'transportation', 'incentive', 'gross_pay', 'late_deduction',
    'early_leave_deduction', 'health_insurance', 'nursing_insurance',
    'pension', 'employment_insurance', 'income_tax', 'resident_tax',
    'total_deduction', 'net_pay'
  ]);
}

// Get tax manual sheet for a specific month
function getTaxSheet(year, month) {
  const mm = String(month).padStart(2, '0');
  return getOrCreateMonthlySheet_(year, month, taxSheetName_(year, month), 'tax_manual_' + year + mm, [
    'staff_id', 'name', 'income_tax', 'resident_tax', 'updated_at'
  ]);
}

// Get incentive sheet for a specific month
function getIncentiveSheet(year, month) {
  const mm = String(month).padStart(2, '0');
  return getOrCreateMonthlySheet_(year, month, incentiveSheetName_(year, month), 'incentive_' + year + mm, [
    'staff_id', 'name', 'item_name', 'amount', 'remarks'
  ]);
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
        // 日本語ラベルが書かれている場合は英語キーに正規化（既存コードが英語キーでアクセスするため）
        const en = (typeof header === 'string') ? REVERSE_HEADER_LABELS[header] : null;
        const key = en || header;
        // enum セルの日本語表示も英語キーへ正規化（status/type/source/clock_out_type/editor_role）
        obj[key] = normalizeEnumValueFromCell_(key, row[index]);
      }
    });
    return obj;
  });
}

// Find row index by column value (英語キー / 日本語ラベル どちらでも検索可能)
function findRowIndex(sheet, column, value) {
  if (!sheet) return -1;
  const data = sheet.getDataRange().getValues();
  if (!data || data.length === 0) return -1;
  const headers = data[0] || [];
  const colIndex = findHeaderIndex_(headers, column);

  if (colIndex === -1) return -1;

  // 列が enum の場合、セルが日本語の可能性があるので英語キーへ正規化して比較
  for (let i = 1; i < data.length; i++) {
    const cellNormalized = normalizeEnumValueFromCell_(column, data[i][colIndex]);
    if (cellNormalized === value || data[i][colIndex] === value) {
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
      case 'submissions/clock-gate':
        result = handleGetClockGate(params);
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

      // Shift requests (希望休 申請)
      case 'shift-requests/submit':
        result = handleSubmitShiftRequest(body);
        break;
      case 'shift-requests/list':
        result = handleListShiftRequests(params);
        break;
      case 'shift-requests/review-day':
        result = handleReviewShiftRequestDay(body);
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
  const today = Utilities.formatDate(new Date(), scriptTimeZone_(), 'yyyy-MM-dd');

  // ヘッダー: staff_id, email, password_hash, password_salt, name,
  //          monthly_salary, transportation, hire_date, paid_leave_balance, status, birth_date
  staffSheet.appendRow([
    staffId, email, hash, salt, name,
    0, 0, today, 0, localizeEnumValue_('active'), ''
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
  const dateStr = Utilities.formatDate(now, scriptTimeZone_(), 'yyyy-MM-dd');
  const yearMonth = year + '-' + String(month).padStart(2, '0');

  // 月次提出ステータスチェック (submitted/approved の月は打刻不可)
  const submissionStatus = getSubmissionStatus_(staffId, yearMonth);
  if (submissionStatus === 'submitted' || submissionStatus === 'approved') {
    return { success: false, error: 'この月は提出済みのため打刻できません' };
  }

  // 【撤去】前月出勤簿の未提出による打刻ブロックは廃止した。
  // 以前は「前月分が未提出（draft）かつ毎月4日以降」または「差戻し(rejected)」のとき
  // 打刻を拒否していたが、業務上「提出しないと打刻できない」運用を無くす要望により撤去。
  // 提出のリマインド自体は computeClockGate_ の alertActive（非ブロックの通知）で継続する。

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

  // Date オブジェクトとして書き込み、シート側で HH:mm 形式に表示させる。
  // toISOString() の UTC-Z 文字列はスプレッドシート上で読みづらいため。
  const timeValue = now;

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
      localizeEnumValue_('punch')  // source
    ];

    if (type === 'clock_in') {
      newRow[3] = timeValue;
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
      sheet.getRange(rowIndex, 4).setValue(timeValue);
    } else if (type === 'clock_out') {
      const existingClockIn = sheet.getRange(rowIndex, 4).getValue();
      if (!existingClockIn) {
        return { success: false, error: '出勤打刻が記録されていません' };
      }
      const existingClockOut = sheet.getRange(rowIndex, 5).getValue();
      if (existingClockOut) {
        return { success: false, error: '本日は既に退勤打刻されています' };
      }
      sheet.getRange(rowIndex, 5).setValue(timeValue);
      sheet.getRange(rowIndex, 6).setValue(localizeEnumValue_('normal'));

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

  // 出勤簿シートを軽量に再生成（失敗しても打刻成功は維持）
  try {
    const ym = Utilities.formatDate(now, scriptTimeZone_(), 'yyyy-MM');
    rebuildAttendanceLogSheet_(staffId, ym);
  } catch (e) { Logger.log('rebuildAttendanceLogSheet failed: ' + (e && e.message)); }

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
  const dateStr = Utilities.formatDate(now, scriptTimeZone_(), 'yyyy-MM-dd');

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
// スクリプトの実効タイムゾーン。Session.getScriptTimeZone() が空を返す環境への防御。
function scriptTimeZone_() {
  try {
    const tz = Session.getScriptTimeZone();
    if (tz && typeof tz === 'string' && tz.length > 0) return tz;
  } catch (e) { /* fall through */ }
  return 'Asia/Tokyo';
}

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
    if (isNaN(value.getTime())) return '';
    return Utilities.formatDate(value, scriptTimeZone_(), 'yyyy-MM-dd');
  }
  return String(value);
}

// "YYYY-MM" 形式に正規化。Google Sheets は "2026-05" 等の文字列を自動的に
// Date オブジェクトに変換してしまうことがあるため、比較前に必ずこれを通す。
// month が 1-12 範囲外なら空文字を返す（不正値のシート書込を防ぐ）。
function formatYearMonthValue_(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    return Utilities.formatDate(value, scriptTimeZone_(), 'yyyy-MM');
  }
  const s = String(value).trim();
  const validate = function (yyyy, mm) {
    const m = parseInt(mm, 10);
    if (!(m >= 1 && m <= 12)) return '';
    return yyyy + '-' + String(m).padStart(2, '0');
  };
  // "YYYY-MM" / "YYYY-M" 形式
  const m1 = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m1) return validate(m1[1], m1[2]);
  // "YYYY-MM-DD" 形式（先頭7文字を取って正規化）
  const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m2) return validate(m2[1], m2[2]);
  // "YYYY/MM" or "YYYY/MM/DD"
  const m3 = s.match(/^(\d{4})\/(\d{1,2})/);
  if (m3) return validate(m3[1], m3[2]);
  return '';
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
    hireDate || '', paidLeaveBalance || 0, localizeEnumValue_('active'), birthDate || ''
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
    requestId, staffId, staff.name, now, leaveDate, localizeEnumValue_('pending'), '', ''
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

  // 当該月の承認済み申請を取得し、遅刻・早退の「会社都合」分を控除対象から外す
  const applicationsSheet = getOrCreateSheet(SHEETS.APPLICATIONS);
  const monthApplications = sheetToObjects(applicationsSheet).filter(function (a) {
    return a.status === 'approved' && formatDateOnly_(a.date).startsWith(year + '-' + String(mNum).padStart(2, '0'));
  });

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

    // 勤怠を「通常日 / 法定休日」に分けて集計し、深夜時間（22:00-05:00）も日別に合算する。
    // 法定休日労働の労働時間は通常時間に含めず、別途 holidayPay として 135% で精算する。
    let regularWorkMinutes = 0;
    let holidayWorkMinutes = 0;
    let nightWorkMinutes = 0;
    staffAttendance.forEach(function (a) {
      const wm = safeNumber_(a.work_minutes, 0);
      const isHoliday = (a.is_holiday === true || a.is_holiday === 'TRUE');
      if (isHoliday) holidayWorkMinutes += wm; else regularWorkMinutes += wm;
      // 打刻時刻から 22:00-05:00 帯の重なり分（分）を加算
      const ci = formatTimeOnly_(a.clock_in);
      const co = formatTimeOnly_(a.clock_out);
      if (ci && co) nightWorkMinutes += nightWorkMinutesForRow_(ci, co);
    });
    const regularHours = regularWorkMinutes / 60;
    const holidayHours = holidayWorkMinutes / 60;
    const nightHours = nightWorkMinutes / 60;
    const totalWorkHours = regularHours + holidayHours;

    // 残業: 通常日のうち月所定（週44h×52/12 ≈ 190.67h）を超えた分
    const monthlyWorkingHours = (WEEKLY_HOURS * 52) / 12;
    const overtimeHours = Math.max(0, regularHours - monthlyWorkingHours);

    // 会社都合の遅刻・早退申請（承認済み）がある日を控除対象から除外する
    // 新スキーマでは reason_type 列、旧スキーマでは details_json.reasonType を参照（後方互換）
    const companyLateDates = {};
    const companyEarlyDates = {};
    monthApplications.forEach(function (a) {
      if (a.staff_id !== staff.staff_id) return;
      const fromJson = safeJsonParse_(a.details_json) || {};
      const reasonType = a.reason_type || fromJson.reasonType || '';
      if (reasonType !== 'company') return;
      const dateKey = formatDateOnly_(a.date);
      if (a.type === 'late_arrival') companyLateDates[dateKey] = true;
      else if (a.type === 'early_leave') companyEarlyDates[dateKey] = true;
    });

    // Late and early leave
    const lateMinutes = staffAttendance.reduce(function (sum, a) {
      const dateKey = formatDateOnly_(a.date);
      if (companyLateDates[dateKey]) return sum; // 会社都合は控除しない
      return sum + safeNumber_(a.late_minutes, 0);
    }, 0);
    const earlyLeaveMinutes = staffAttendance.reduce(function (sum, a) {
      const dateKey = formatDateOnly_(a.date);
      if (companyEarlyDates[dateKey]) return sum; // 会社都合は控除しない
      return sum + safeNumber_(a.early_leave_minutes, 0);
    }, 0);

    // Calculate pay (monthlyWorkingHours は固定値なので 0 除算なし、ただし monthlySalary=0 で hourlyRate=0)
    const hourlyRate = monthlyWorkingHours > 0 ? monthlySalary / monthlyWorkingHours : 0;
    const minuteRate = hourlyRate / 60;

    // 割増手当（CLAUDE.md のビジネスルールに従う）:
    //   残業 = 通常日の所定超 × 時給 × 125%（基本＋25% premium）
    //   深夜 = 22:00-05:00 帯の労働 × 時給 × 25%（premium のみ。月給に含まれる base 部分には加算しない）
    //   休日 = 法定休日労働 × 時給 × 135%（基本＋35% premium。通常時間とは別計上）
    const overtimePay = Math.floor(overtimeHours * hourlyRate * 1.25);
    const nightPay = Math.floor(nightHours * hourlyRate * 0.25);
    const holidayPay = Math.floor(holidayHours * hourlyRate * 1.35);

    const incentiveTotal = staffIncentives.reduce((sum, i) => sum + safeNumber_(i.amount, 0), 0);

    const grossPay = monthlySalary + overtimePay + nightPay + holidayPay +
                     transportation + incentiveTotal;

    // Deductions
    const lateDeduction = Math.floor(lateMinutes * minuteRate);
    const earlyLeaveDeduction = Math.floor(earlyLeaveMinutes * minuteRate);

    // 社会保険料: 健康・厚生年金・介護保険は「標準報酬月額」ベースで計算
    //   - STANDARD_REMUNERATION テーブルから monthlySalary+transportation に対応する 等級を引く
    //   - テーブル未設定の場合は (monthlySalary + transportation) を fallback として使う
    // 雇用保険は実際の総支給額ベースが法定（変更なし）
    const asOfMonthStart = new Date(yNum, mNum - 1, 1);
    const standardBase = getStandardRemuneration_(monthlySalary + transportation) || (monthlySalary + transportation);
    const healthRate = safeNumber_(rates.healthInsuranceRate, 0);
    const nursingRate = safeNumber_(rates.nursingInsuranceRate, 0);
    const pensionRate = safeNumber_(rates.pensionRate, 0);
    const empInsRate = safeNumber_(rates.employmentInsuranceRate, 0);
    const healthInsurance = Math.floor(standardBase * healthRate / 100);
    const nursingInsurance = isNursingInsuranceTarget(staff.birth_date, asOfMonthStart) ?
                            Math.floor(standardBase * nursingRate / 100) : 0;
    const pension = Math.floor(standardBase * pensionRate / 100);
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
      nightHours: Math.round(nightHours * 100) / 100,
      holidayHours: Math.round(holidayHours * 100) / 100,
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
      localizeEnumValue_('manual')
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
  const colIndex = findHeaderIndex_(headers, columnName);

  if (colIndex === -1) {
    return { success: false, error: '不正なフィールド名です: ' + field };
  }

  // Capture old value for history
  const oldValue = sheet.getRange(rowIndex, colIndex + 1).getValue();

  // Apply update（enum 列なら日本語ラベルに変換してから書き込む）
  const finalValue = ENUM_COLUMNS[columnName] ? localizeEnumValue_(value) : value;
  sheet.getRange(rowIndex, colIndex + 1).setValue(finalValue);

  // Mark break as manually overridden if user changed break_minutes
  if (columnName === 'break_minutes') {
    const manualCol = findHeaderIndex_(headers, 'break_minutes_is_manual');
    if (manualCol !== -1) sheet.getRange(rowIndex, manualCol + 1).setValue(true);
  }

  // Source becomes 'manual' on edit
  const sourceCol = findHeaderIndex_(headers, 'source');
  if (sourceCol !== -1) sheet.getRange(rowIndex, sourceCol + 1).setValue(localizeEnumValue_('manual'));

  // Recompute work_minutes if a time field changed
  if (columnName === 'clock_in' || columnName === 'clock_out' || columnName === 'break_minutes') {
    const ciCol = findHeaderIndex_(headers, 'clock_in');
    const coCol = findHeaderIndex_(headers, 'clock_out');
    const brCol = findHeaderIndex_(headers, 'break_minutes');
    const wmCol = findHeaderIndex_(headers, 'work_minutes');
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

  // 出勤簿シートを再構築（失敗しても更新成功は維持）
  try { rebuildAttendanceLogSheet_(staffId, yearMonth); } catch (e) { Logger.log('rebuildAttendanceLogSheet failed (single update): ' + (e && e.message)); }

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

    // HH:MM → Date オブジェクトに変換し、シートに保存（HH:mm 形式で表示される）
    const clockInVal = clockIn && /^\d{1,2}:\d{2}$/.test(clockIn) ? new Date(date + 'T' + clockIn.padStart(5, '0') + ':00') : '';
    const clockOutVal = clockOut && /^\d{1,2}:\d{2}$/.test(clockOut) ? new Date(date + 'T' + clockOut.padStart(5, '0') + ':00') : '';
    const hasClockOut = clockOutVal instanceof Date && !isNaN(clockOutVal.getTime());

    let rowIndex = dateToRowIndex[date];
    if (!rowIndex) {
      // 新規行
      // ヘッダー: date, staff_id, name, clock_in, clock_out, clock_out_type,
      //          break_minutes, break_minutes_is_manual, work_minutes,
      //          late_minutes, early_leave_minutes, is_holiday, remarks, source
      sheet.appendRow([
        date, staffId, staff.name,
        clockInVal, clockOutVal, hasClockOut ? localizeEnumValue_('normal') : '',
        breakMinutes, breakMinutesIsManual,
        workMinutes, 0, 0,
        isHoliday, remarks,
        localizeEnumValue_('manual')
      ]);
      rowIndex = sheet.getLastRow();
      dateToRowIndex[date] = rowIndex;
    } else {
      // 既存行を更新（カラム名指定で安全に書き込み）
      setCellByColumnName_(sheet, rowIndex, headers, 'clock_in', clockInVal);
      setCellByColumnName_(sheet, rowIndex, headers, 'clock_out', clockOutVal);
      if (hasClockOut) setCellByColumnName_(sheet, rowIndex, headers, 'clock_out_type', 'normal');
      setCellByColumnName_(sheet, rowIndex, headers, 'break_minutes', breakMinutes);
      setCellByColumnName_(sheet, rowIndex, headers, 'break_minutes_is_manual', breakMinutesIsManual);
      setCellByColumnName_(sheet, rowIndex, headers, 'work_minutes', workMinutes);
      setCellByColumnName_(sheet, rowIndex, headers, 'is_holiday', isHoliday);
      setCellByColumnName_(sheet, rowIndex, headers, 'remarks', remarks);
      setCellByColumnName_(sheet, rowIndex, headers, 'source', 'manual');
    }
    savedCount++;
  }

  // 出勤簿シートを再構築（失敗しても更新成功は維持）
  try {
    const ym = year + '-' + String(month).padStart(2, '0');
    rebuildAttendanceLogSheet_(staffId, ym);
  } catch (e) { Logger.log('rebuildAttendanceLogSheet failed (admin update): ' + (e && e.message)); }

  return { success: true, data: { saved: savedCount } };
}

function appendAttendanceHistory_(date, staffId, field, oldValue, newValue, editorId, editorRole, reason) {
  const sheet = getOrCreateSheet(SHEETS.ATTENDANCE_HISTORY);
  // フィールド名 (clock_in 等) は日本語ラベルへ変換して保存
  const fieldLabel = (typeof field === 'string' && HEADER_LABELS[field]) ? HEADER_LABELS[field] : field;
  sheet.appendRow([
    date, staffId, fieldLabel,
    oldValue == null ? '' : String(oldValue),
    newValue == null ? '' : String(newValue),
    new Date().toISOString(),
    editorId || '',
    localizeEnumValue_(editorRole || 'staff'),
    reason || ''
  ]);
}

// Helper function to check nursing insurance eligibility
// asOf: 判定基準日（未指定の場合は今日）。給与計算では「対象月の初日」を渡すことで、
// 月内の計算タイミングや実行日に依存せず安定した判定結果を得る。
function isNursingInsuranceTarget(birthDate, asOf) {
  if (!birthDate) return false;

  const birth = toDateOrNull_(birthDate);
  if (!birth) return false;
  const ref = (asOf instanceof Date && !isNaN(asOf.getTime())) ? asOf : new Date();

  let age = ref.getFullYear() - birth.getFullYear();
  const monthDiff = ref.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && ref.getDate() < birth.getDate())) {
    age--;
  }

  return age >= 40 && age < 65;
}

/**
 * 月額（月給+交通費 等）から標準報酬月額テーブル（STANDARD_REMUNERATION シート）を引き、
 * 該当する 等級の standard_monthly を返す。
 * テーブルが空 / 一致するレンジが無い場合は null を返す（呼び出し側で fallback）。
 */
function getStandardRemuneration_(monthlyAmount) {
  const sheet = getOrCreateSheet(SHEETS.STANDARD_REMUNERATION);
  const data = sheetToObjects(sheet);
  if (!data || data.length === 0) return null;
  const amt = safeNumber_(monthlyAmount, 0);
  // 範囲一致を優先
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const min = safeNumber_(row.monthly_min, 0);
    const max = safeNumber_(row.monthly_max, 0);
    const std = safeNumber_(row.standard_monthly, 0);
    if (amt >= min && amt <= max && std > 0) return std;
  }
  // 範囲外（上限超 / 下限未満）の場合は最も近い等級を返す
  let bestStd = null;
  let bestDist = Infinity;
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const std = safeNumber_(row.standard_monthly, 0);
    if (std <= 0) continue;
    const dist = Math.abs(std - amt);
    if (dist < bestDist) { bestDist = dist; bestStd = std; }
  }
  return bestStd;
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
  // 新名 (シフト_YYYYMM) を優先。無ければ旧名 (shift_YYYYMM) もフォールバックで参照する。
  const name = shiftSheetName(year, month);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    const legacy = 'shift_' + year + String(month).padStart(2, '0');
    sheet = ss.getSheetByName(legacy);
  }
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
    return Utilities.formatDate(value, scriptTimeZone_(), 'yyyy-MM-dd');
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
  const data = sheet.getDataRange().getValues();
  const sheetHeaders = (data && data[0]) ? data[0] : [];

  // 重複チェック: 同一スタッフ × 同一日 × 同一種別 の申請が
  // すでに pending / approved で存在する場合は受け付けない（DoS / 二重 email 防止）
  if (sheetHeaders.length > 0 && data.length > 1) {
    const sIdx = findHeaderIndex_(sheetHeaders, 'staff_id');
    const dIdx = findHeaderIndex_(sheetHeaders, 'date');
    const tIdx = findHeaderIndex_(sheetHeaders, 'type');
    const stIdx = findHeaderIndex_(sheetHeaders, 'status');
    if (sIdx !== -1 && dIdx !== -1 && tIdx !== -1 && stIdx !== -1) {
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][sIdx]) !== String(staffId)) continue;
        if (formatDateOnly_(data[i][dIdx]) !== formatDateOnly_(date)) continue;
        const rawT = data[i][tIdx];
        const rowType = (typeof rawT === 'string') ? (REVERSE_ENUM_LABEL_MAP[rawT] || rawT) : rawT;
        if (rowType !== type) continue;
        const rawS = data[i][stIdx];
        const rowStatus = (typeof rawS === 'string') ? (REVERSE_ENUM_LABEL_MAP[rawS] || rawS) : rawS;
        if (rowStatus === 'pending') {
          return { success: false, error: '同じ申請がすでに承認待ちで存在します。承認/却下されるまでお待ちください。' };
        }
        if (rowStatus === 'approved') {
          return { success: false, error: '同じ申請がすでに承認されています。' };
        }
        // rejected の場合は再申請を許可する（pending 化扱いで新規行を作る）
      }
    }
  }

  const id = 'AP' + Date.now() + Math.random().toString(36).slice(2, 6);
  const now = new Date().toISOString();
  const detailsObj = details || {};
  const colCount = Math.max(sheetHeaders.length, 13);
  const newRow = new Array(colCount).fill('');
  const setByKey = function (key, v) {
    const i = findHeaderIndex_(sheetHeaders, key);
    if (i !== -1 && i < newRow.length) newRow[i] = v;
  };
  setByKey('id', id);
  setByKey('staff_id', staffId);
  setByKey('staff_name', staff.name);
  setByKey('date', date);
  setByKey('type', localizeEnumValue_(type));
  setByKey('reason', reason);
  // details の各フィールドを列ごとに展開（旧 details_json は廃止）
  setByKey('reason_type', detailsObj.reasonType ? localizeEnumValue_(detailsObj.reasonType) : '');
  setByKey('planned_start', detailsObj.plannedStart || '');
  setByKey('planned_end', detailsObj.plannedEnd || '');
  setByKey('actual_start', detailsObj.actualStart || '');
  setByKey('actual_end', detailsObj.actualEnd || '');
  setByKey('planned_break_min', (detailsObj.plannedBreak !== undefined && detailsObj.plannedBreak !== null) ? Number(detailsObj.plannedBreak) : '');
  setByKey('actual_break_min', (detailsObj.actualBreak !== undefined && detailsObj.actualBreak !== null) ? Number(detailsObj.actualBreak) : '');
  setByKey('overtime_min', (detailsObj.overtimeMinutes !== undefined && detailsObj.overtimeMinutes !== null) ? Number(detailsObj.overtimeMinutes) : '');
  setByKey('status', localizeEnumValue_('pending'));
  setByKey('submitted_at', now);
  sheet.appendRow(newRow);
  // 次回 list/読込で確実に新行が見えるよう Spreadsheet 書込キャッシュを強制フラッシュ
  try { SpreadsheetApp.flush(); } catch (e) { /* ignore */ }

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
    data: filtered.map(function (r) {
      // 列展開された値から従来の details オブジェクトを再構成（API 互換維持）
      // 旧 details_json が残っている行（migration 前）はそちらも併用
      const fromJson = safeJsonParse_(r.details_json) || {};
      const details = {};
      if (fromJson.plannedStart || r.planned_start) details.plannedStart = r.planned_start || fromJson.plannedStart;
      if (fromJson.plannedEnd || r.planned_end) details.plannedEnd = r.planned_end || fromJson.plannedEnd;
      if (fromJson.actualStart || r.actual_start) details.actualStart = r.actual_start || fromJson.actualStart;
      if (fromJson.actualEnd || r.actual_end) details.actualEnd = r.actual_end || fromJson.actualEnd;
      if (r.planned_break_min !== '' && r.planned_break_min !== undefined && r.planned_break_min !== null) {
        details.plannedBreak = Number(r.planned_break_min);
      } else if (fromJson.plannedBreak !== undefined) {
        details.plannedBreak = fromJson.plannedBreak;
      }
      if (r.actual_break_min !== '' && r.actual_break_min !== undefined && r.actual_break_min !== null) {
        details.actualBreak = Number(r.actual_break_min);
      } else if (fromJson.actualBreak !== undefined) {
        details.actualBreak = fromJson.actualBreak;
      }
      if (r.overtime_min !== '' && r.overtime_min !== undefined && r.overtime_min !== null) {
        details.overtimeMinutes = Number(r.overtime_min);
      } else if (fromJson.overtimeMinutes !== undefined) {
        details.overtimeMinutes = fromJson.overtimeMinutes;
      }
      const reasonTypeRaw = r.reason_type || fromJson.reasonType || '';
      if (reasonTypeRaw === 'company' || reasonTypeRaw === 'personal') details.reasonType = reasonTypeRaw;
      return {
        id: r.id,
        staffId: r.staff_id,
        staffName: r.staff_name,
        date: formatDateOnly_(r.date),
        type: r.type,
        reason: r.reason,
        details: details,
        status: r.status,
        submittedAt: toIsoString_(r.submitted_at),
        reviewedAt: toIsoString_(r.reviewed_at),
        reviewedBy: r.reviewed_by,
        rejectionReason: r.rejection_reason
      };
    })
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

// 月次提出ステータス優先度（新しい状態ほど大きい数値）。
// approve/reject 済み(reviewed) > 提出済み(submitted) > 下書き(draft)。
const SUBMISSION_STATUS_ORDER = { approved: 4, rejected: 3, submitted: 2, draft: 1 };

// 指定スタッフ×年月に一致する月次提出行のうち「最も確からしい1行」を返す（無ければ null）。
//
// 重要: 同一 (staffId, yearMonth) に複数行が存在しうる（過去の Date 比較バグ等で生まれた重複）。
// 単純な find() で先頭行を返すと、古い draft 行が新しい submitted 行より前にあった場合に
// 「提出済みなのに draft と判定 → 打刻ゲートで誤ブロック」が起きる。
// handleListSubmissions と同じ優先順位（reviewed_at → submitted_at → status 優先度）で
// 重複を解決し、常に正しい最新のステータスを返す。
// staff_id は数値・文字列が混在しうるため String 化して比較する。
function getBestSubmissionRecord_(staffId, yearMonth) {
  const sheet = getOrCreateSheet(SHEETS.SUBMISSIONS);
  const data = sheetToObjects(sheet);
  const targetYm = formatYearMonthValue_(yearMonth);
  const sid = String(staffId);

  let best = null;
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (String(r.staff_id) !== sid) continue;
    if (formatYearMonthValue_(r.year_month) !== targetYm) continue;
    if (!best) { best = r; continue; }

    const newReviewed = toIsoString_(r.reviewed_at) || '';
    const oldReviewed = toIsoString_(best.reviewed_at) || '';
    if (newReviewed !== oldReviewed) {
      if (newReviewed > oldReviewed) best = r;
      continue;
    }
    const newSubmitted = toIsoString_(r.submitted_at) || '';
    const oldSubmitted = toIsoString_(best.submitted_at) || '';
    if (newSubmitted !== oldSubmitted) {
      if (newSubmitted > oldSubmitted) best = r;
      continue;
    }
    const newRank = SUBMISSION_STATUS_ORDER[r.status] || 0;
    const oldRank = SUBMISSION_STATUS_ORDER[best.status] || 0;
    if (newRank > oldRank) best = r;
  }
  return best;
}

// 指定スタッフ×年月の月次提出ステータスを返す（無ければ 'draft'）。重複行は dedupe 済み。
function getSubmissionStatus_(staffId, yearMonth) {
  const best = getBestSubmissionRecord_(staffId, yearMonth);
  return best ? best.status : 'draft';
}

// "YYYY-MM" の前月を "YYYY-MM" で返す。
function previousYearMonth_(yearMonth) {
  const m = String(yearMonth || '').match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return '';
  let y = parseInt(m[1], 10);
  let mo = parseInt(m[2], 10) - 1;
  if (mo < 1) { mo = 12; y -= 1; }
  return y + '-' + String(mo).padStart(2, '0');
}

// 指定スタッフが対象月（YYYY-MM）に 1 件でも出勤打刻のある勤怠を持つか。
// 出勤実績が無い月（新入社・休職など）は「提出すべきものが無い」とみなすための判定。
function hasAttendanceInMonth_(staffId, yearMonth) {
  const m = String(yearMonth || '').match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return false;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  // getAttendanceSheet は存在しなければ空シートを新規作成してしまう副作用がある。
  // ゲート判定では「過去月の実績有無を確認するだけ」なので、既存シートの存在チェックに留める。
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(attendanceSheetName_(year, month));
  if (!sheet) return false;
  const rows = sheetToObjects(sheet);
  return rows.some(function (r) {
    return r.staff_id === staffId && r.clock_in !== '' && r.clock_in != null;
  });
}

/**
 * 打刻ゲート / 提出期限アラートの状態を算出する。
 * - 毎月 1〜7 日: 前月分 出勤簿の提出期限アラートを表示（alertActive）
 * - 毎月 4 日以降: 前月分が未提出（draft）かつ前月に出勤実績あり → 打刻ブロック（clockBlocked）
 * - 差戻し（rejected）の場合: 日付に関係なく常に打刻ブロック（再提出を促す）
 * - 提出済み（submitted/approved）の場合: ブロック解除
 * now を省略すると現在時刻を使う。
 */
function computeClockGate_(staffId, now) {
  const d = (now && isValidDate_(now)) ? now : new Date();
  const dayOfMonth = parseInt(Utilities.formatDate(d, scriptTimeZone_(), 'd'), 10);
  const curYm = Utilities.formatDate(d, scriptTimeZone_(), 'yyyy-MM');
  const prevYm = previousYearMonth_(curYm);
  const deadlineDate = curYm + '-' + String(MONTHLY_SUBMISSION_DEADLINE_DAY).padStart(2, '0');

  let prevStatus = 'draft';
  let hasPrevAttendance = false;
  if (staffId && prevYm) {
    prevStatus = getSubmissionStatus_(staffId, prevYm);
    hasPrevAttendance = hasAttendanceInMonth_(staffId, prevYm);
  }
  const prevSubmitted = (prevStatus === 'submitted' || prevStatus === 'approved');
  const alertActive = dayOfMonth >= 1 && dayOfMonth <= MONTHLY_SUBMISSION_DEADLINE_DAY && !prevSubmitted && hasPrevAttendance;
  // 【撤去】未提出による打刻ブロックは廃止。clockBlocked は常に false を返す。
  // 提出のリマインドは alertActive（非ブロックの通知）のみで行う。
  const clockBlocked = false;

  return {
    today: Utilities.formatDate(d, scriptTimeZone_(), 'yyyy-MM-dd'),
    dayOfMonth: dayOfMonth,
    currentYearMonth: curYm,
    prevYearMonth: prevYm,
    prevStatus: prevStatus,
    hasPrevAttendance: hasPrevAttendance,
    deadlineDay: MONTHLY_SUBMISSION_DEADLINE_DAY,
    blockDay: MONTHLY_SUBMISSION_BLOCK_DAY,
    deadlineDate: deadlineDate,
    alertActive: alertActive,
    clockBlocked: clockBlocked,
  };
}

// API: 打刻ゲート / 提出アラートの状態を返す。params: { staffId }
function handleGetClockGate(params) {
  const staffId = params && params.staffId ? String(params.staffId) : '';
  if (!staffId) return { success: false, error: 'スタッフIDが指定されていません' };
  return { success: true, data: computeClockGate_(staffId, new Date()) };
}

function handleGetSubmissionStatus(params) {
  const { staffId, yearMonth } = params;
  if (!staffId || !yearMonth) return { success: false, error: '必須パラメータが指定されていません' };
  // 重複行があっても最新の確定ステータスを返す（getSubmissionStatus_ と同じ dedupe ロジック）
  const rec = getBestSubmissionRecord_(staffId, yearMonth);
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
 * 月次提出。提出ゲートチェック: 当月に「審査待ち(pending)」の申請が残っていないこと。
 * 却下(rejected)・取消(cancelled)は解決済みの状態なので提出をブロックしない。
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

  // ゲート: 当月に「審査待ち(pending)」の申請が残っていないか。
  // ★以前は status !== 'approved' で判定しており、却下(rejected)・取消(cancelled)も
  //   ブロック対象に含めていた。却下された申請は二度と 'approved' にならないため、
  //   一度差戻し（申請却下）されると「未承認の申請があります」で提出が永久に不可になる
  //   デッドロックが発生していた。審査待ちのみをブロック対象にする。
  const apps = sheetToObjects(getOrCreateSheet(SHEETS.APPLICATIONS))
    .filter(a => a.staff_id === staffId && formatDateOnly_(a.date).startsWith(yearMonth));
  const blocked = apps.filter(a => a.status === 'pending');
  if (blocked.length > 0) {
    return {
      success: false,
      error: '審査待ちの申請が' + blocked.length + '件あります。管理者の承認後に再度提出してください。'
    };
  }

  const sheet = getOrCreateSheet(SHEETS.SUBMISSIONS);
  // 過去の重複行があっても全てに同じ更新を適用してデデュープ整合を保つ
  const rowIndices = findAllSubmissionRows_(sheet, staffId, yearMonth);
  const now = new Date().toISOString();

  if (rowIndices.length === 0) {
    sheet.appendRow([staffId, staff.name, yearMonth, localizeEnumValue_('submitted'), now, '', '', remarks || '', '']);
  } else {
    const headers = getHeaderRow_(sheet);
    rowIndices.forEach(function (rowIndex) {
      setCellByColumnName_(sheet, rowIndex, headers, 'status', 'submitted');
      setCellByColumnName_(sheet, rowIndex, headers, 'submitted_at', now);
      setCellByColumnName_(sheet, rowIndex, headers, 'remarks', remarks || '');
      setCellByColumnName_(sheet, rowIndex, headers, 'rejection_reason', '');
    });
  }
  // 直後の list/読込で確実に新行が見えるよう Spreadsheet 書込キャッシュを強制フラッシュ
  try { SpreadsheetApp.flush(); } catch (e) { /* ignore */ }

  try { notifyAdminsMonthlySubmitted_(staff, yearMonth); }
  catch (e) { Logger.log('notifyAdminsMonthlySubmitted_ failed: ' + (e && e.message)); }

  return { success: true };
}

function findSubmissionRowIndex_(sheet, staffId, yearMonth) {
  if (!sheet) return -1;
  const data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return -1;
  const headers = data[0] || [];
  const sIdx = findHeaderIndex_(headers, 'staff_id');
  const ymIdx = findHeaderIndex_(headers, 'year_month');
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
  const sIdx = findHeaderIndex_(headers, 'staff_id');
  const ymIdx = findHeaderIndex_(headers, 'year_month');
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
  const STATUS_ORDER = SUBMISSION_STATUS_ORDER;
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
  const emails = sheetToObjects(sheet).map(function (a) { return a.email; }).filter(function (e) { return !!e; });
  if (emails.length === 0) Logger.log('[WARN] 管理者メールアドレスが 1 件も登録されていません。通知が届きません。');
  return emails;
}

function safeSendEmail_(to, subject, body) {
  if (!to) return false;
  try {
    // 残量チェック（MailApp は 1 日 100 通の上限あり）
    const remaining = MailApp.getRemainingDailyQuota();
    if (typeof remaining === 'number' && remaining <= 0) {
      Logger.log('[WARN] メール送信枠超過のため送信スキップ to=' + to);
      return false;
    }
  } catch (e) { /* quota 取得失敗は無視して送信を試みる */ }
  try {
    // noReply: true は Google Workspace 契約のドメインでのみ有効。個人アカウントでは無視される。
    MailApp.sendEmail({ to: to, subject: subject, body: body, noReply: true });
    return true;
  } catch (e) {
    // noReply 等のオプションで失敗するケースのため、フォールバックで再送
    try {
      MailApp.sendEmail(to, subject, body);
      return true;
    } catch (e2) {
      Logger.log('[WARN] Mail send failed to=' + to + ' err=' + (e2 && e2.message ? e2.message : e2));
      return false;
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
// 月初の提出期限リマインドメール（出勤簿・希望休）
// ============================================================

/**
 * 在籍スタッフ全員に、その月の提出期限を案内するメールを送る。
 *  - 出勤簿: 前月分を当月 7 日までに提出
 *  - 希望休: 翌々月分を当月 7 日までに提出
 * 毎月 1 日のトリガーから呼ばれる想定だが、メニューから手動実行も可能。
 * 戻り値: { sent: number, skipped: number }
 */
function sendMonthlyDeadlineReminders_() {
  const now = new Date();
  const curYm = Utilities.formatDate(now, scriptTimeZone_(), 'yyyy-MM');
  const ymMatch = curYm.match(/^(\d{4})-(\d{2})$/);
  const curYear = parseInt(ymMatch[1], 10);
  const curMonth = parseInt(ymMatch[2], 10);

  const prevYm = previousYearMonth_(curYm); // 出勤簿の対象（前月）
  // 希望休の対象（翌々月）: shiftRequestDeadline_(対象月) が当月 7 日になる対象月
  let nnY = curYear;
  let nnM = curMonth + 2;
  while (nnM > 12) { nnM -= 12; nnY += 1; }
  const shiftTargetYm = nnY + '-' + String(nnM).padStart(2, '0');

  const deadlineDay = MONTHLY_SUBMISSION_DEADLINE_DAY;
  const attendanceDeadline = curYm + '-' + String(deadlineDay).padStart(2, '0');
  const shiftDeadline = shiftRequestDeadline_(shiftTargetYm); // = 当月 7 日

  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staffList = sheetToObjects(staffSheet).filter(function (s) {
    return s.status !== 'inactive' && !!s.email;
  });

  const subject = '【提出期限のお知らせ】出勤簿・希望休（' + curMonth + '月）';
  let sent = 0;
  let skipped = 0;
  staffList.forEach(function (staff) {
    const body = staff.name + 'さん\n\n'
      + 'いつもお疲れさまです。\n今月の提出期限をお知らせします。\n\n'
      + '■ 出勤簿（' + prevYm + ' 分）\n'
      + '　提出期限: ' + attendanceDeadline + ' まで\n'
      + '　※ ' + MONTHLY_SUBMISSION_BLOCK_DAY + ' 日までにご提出いただけますと、引き続きスムーズに打刻をご利用いただけます。\n\n'
      + '■ 希望休（' + shiftTargetYm + ' 分）\n'
      + '　提出期限: ' + shiftDeadline + ' まで\n\n'
      + 'お時間あるときに、アプリからご提出いただけますと幸いです。';
    const ok = safeSendEmail_(staff.email, subject, body);
    if (ok) sent++; else skipped++;
  });

  Logger.log('sendMonthlyDeadlineReminders_: sent=' + sent + ' skipped=' + skipped);
  return { sent: sent, skipped: skipped };
}

/**
 * 毎月 1 日 8 時台に sendMonthlyDeadlineReminders_ を実行する
 * 時刻ベーストリガーを登録する（重複登録は防止）。
 */
function installMonthlyReminderTrigger_() {
  const handler = 'monthlyDeadlineReminderTrigger';
  const existing = ScriptApp.getProjectTriggers();
  for (let i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(existing[i]); // 重複を避けるため一旦削除して作り直す
    }
  }
  ScriptApp.newTrigger(handler)
    .timeBased()
    .onMonthDay(1)
    .atHour(8)
    .create();
  return true;
}

// トリガーから呼ばれるエントリポイント
function monthlyDeadlineReminderTrigger() {
  try {
    sendMonthlyDeadlineReminders_();
  } catch (e) {
    Logger.log('monthlyDeadlineReminderTrigger failed: ' + (e && e.message ? e.message : e));
  }
}

// メニュー: 月初リマインドトリガーを登録
function menuInstallMonthlyReminder() {
  const ui = SpreadsheetApp.getUi();
  try {
    installMonthlyReminderTrigger_();
    ui.alert('提出期限リマインド設定',
      '毎月 1 日 朝 8 時台に、在籍スタッフ全員へ出勤簿・希望休の提出期限メールを送る設定を登録しました。',
      ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('設定に失敗しました', String(e && e.message ? e.message : e), ui.ButtonSet.OK);
  }
}

// メニュー: 今すぐ提出期限リマインドメールを送る（テスト/手動用）
function menuSendDeadlineRemindersNow() {
  const ui = SpreadsheetApp.getUi();
  try {
    const res = sendMonthlyDeadlineReminders_();
    ui.alert('リマインドメール送信完了',
      '送信: ' + res.sent + ' 件 / スキップ: ' + res.skipped + ' 件',
      ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('送信に失敗しました', String(e && e.message ? e.message : e), ui.ButtonSet.OK);
  }
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
    .addItem('コードのバージョンを確認', 'menuShowCodeVersion')
    .addItem('翌月のシフト雛形を作成', 'menuGenerateNextMonthShift')
    .addItem('出勤簿を再生成', 'menuRebuildAttendanceLogs')
    .addItem('シート構造を最新化（出勤簿再生成・JSON 解体・日本語化）', 'menuMigrateSheetNames')
    .addSeparator()
    .addItem('① 勤怠IDズレを点検（変更なし）', 'menuPreviewAttendanceReassign')
    .addItem('② 勤怠IDズレを修正（ぽめ→松村）', 'menuRunAttendanceReassign')
    .addSeparator()
    .addItem('提出期限リマインドを毎月1日に自動送信する設定', 'menuInstallMonthlyReminder')
    .addItem('提出期限リマインドを今すぐ送信', 'menuSendDeadlineRemindersNow')
    .addSeparator()
    .addItem('テストスタッフ追加', 'addTestStaff')
    .addItem('テスト管理者追加', 'addTestAdmin')
    .addItem('システム初期化', 'setupSystem')
    .addToUi();
}

// ============================================================
// 一度きりのデータ修正:
// テスト用アカウント「ぽめ(S105946)」名義で誤登録された松村さんの勤怠を、
// 正しい「松村 百恵(S599635)」に付け替える。
// ぽめはオーナーのテスト用でぽめ自身の勤怠は存在しない（オーナー確認済み）。
// 手順: ①点検(menuPreviewAttendanceReassign, 変更なし) → ②修正(menuRunAttendanceReassign)
// ============================================================
var MISFILE_FROM_STAFF_ID = 'S105946'; // ぽめ（テスト用）
var MISFILE_TO_STAFF_ID = 'S599635';   // 松村 百恵

function menuPreviewAttendanceReassign() {
  const ui = SpreadsheetApp.getUi();
  try {
    const r = reassignMisfiledAttendance_(true);
    ui.alert('① 勤怠IDズレ 点検（変更なし）', r.report, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('点検に失敗しました', String(e && e.message ? e.message : e), ui.ButtonSet.OK);
  }
}

function menuRunAttendanceReassign() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    '② 勤怠IDズレ 修正の実行',
    'ぽめ(' + MISFILE_FROM_STAFF_ID + ') 名義の勤怠を 松村 百恵(' + MISFILE_TO_STAFF_ID + ') に付け替えます。\n' +
    '・変更前の内容は「勤怠ID修正ログ」シートにバックアップします\n' +
    '・松村さんの出勤簿を再生成します\n' +
    '・松村側に既に同じ日付がある場合は上書きせずスキップします\n\n' +
    '実行してよろしいですか？',
    ui.ButtonSet.OK_CANCEL);
  if (confirm !== ui.Button.OK) return;
  try {
    const r = reassignMisfiledAttendance_(false);
    ui.alert('② 勤怠IDズレ 修正 完了', r.report, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('修正に失敗しました', String(e && e.message ? e.message : e), ui.ButtonSet.OK);
  }
}

/**
 * 誤登録勤怠を付け替える中核処理。
 * @param {boolean} dryRun true なら一切書き込まず、対象件数のレポートだけ返す。
 */
function reassignMisfiledAttendance_(dryRun) {
  const ss = getSpreadsheet();
  const master = sheetToObjects(getOrCreateSheet(SHEETS.STAFF_MASTER));
  const toStaff = master.find(function (s) { return String(s.staff_id) === MISFILE_TO_STAFF_ID; });
  if (!toStaff) throw new Error('付け替え先スタッフ(' + MISFILE_TO_STAFF_ID + ')がマスターに見つかりません');
  const toName = toStaff.name;

  const sheets = ss.getSheets().filter(function (sh) { return /^勤怠_\d{6}$/.test(sh.getName()); });
  const perMonth = {};      // 'YYYYMM' -> 件数
  const conflicts = [];     // 'YYYYMM YYYY-MM-DD'
  const affected = {};      // 'YYYYMM' -> true
  const backup = [];        // ログ行
  const nowIso = new Date().toISOString();
  let moved = 0;

  sheets.forEach(function (sh) {
    const data = sh.getDataRange().getValues();
    if (!data || data.length < 2) return;
    const headers = data[0];
    const sIdx = findHeaderIndex_(headers, 'staff_id');
    const nIdx = findHeaderIndex_(headers, 'name');
    const dIdx = findHeaderIndex_(headers, 'date');
    if (sIdx === -1 || dIdx === -1) return;
    const ymRaw = sh.getName().replace('勤怠_', '');

    // 既に付け替え先(松村)が持っている日付集合（衝突検知）
    const toDates = {};
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][sIdx]) === MISFILE_TO_STAFF_ID) {
        const dk = formatDateOnly_(data[i][dIdx]);
        if (dk) toDates[dk] = true;
      }
    }

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][sIdx]) !== MISFILE_FROM_STAFF_ID) continue;
      const dateStr = formatDateOnly_(data[i][dIdx]);
      if (toDates[dateStr]) { conflicts.push(ymRaw + ' ' + dateStr); continue; }
      perMonth[ymRaw] = (perMonth[ymRaw] || 0) + 1;
      affected[ymRaw] = true;
      moved++;
      backup.push([nowIso, sh.getName(), dateStr, MISFILE_FROM_STAFF_ID,
        (nIdx !== -1 ? data[i][nIdx] : ''), MISFILE_TO_STAFF_ID, toName]);
      if (!dryRun) {
        const rowIndex = i + 1;
        sh.getRange(rowIndex, sIdx + 1).setValue(MISFILE_TO_STAFF_ID);
        if (nIdx !== -1) sh.getRange(rowIndex, nIdx + 1).setValue(toName);
      }
    }
  });

  if (!dryRun) {
    if (backup.length > 0) {
      const log = getOrCreateSheet('勤怠ID修正ログ');
      if (log.getLastRow() === 0) {
        log.appendRow(['実行日時', 'シート', '日付', '旧staff_id', '旧名義', '新staff_id', '新名義']);
      }
      log.getRange(log.getLastRow() + 1, 1, backup.length, 7).setValues(backup);
    }
    // 影響月の松村の出勤簿を再生成（YYYYMM -> YYYY-MM）
    Object.keys(affected).forEach(function (ymRaw) {
      const ym = ymRaw.slice(0, 4) + '-' + ymRaw.slice(4);
      try { rebuildAttendanceLogSheet_(MISFILE_TO_STAFF_ID, ym); }
      catch (e) { Logger.log('rebuild failed ' + ym + ': ' + (e && e.message)); }
    });
    try { SpreadsheetApp.flush(); } catch (e) { /* ignore */ }
  }

  const monthsStr = Object.keys(perMonth).sort().map(function (k) { return k + '(' + perMonth[k] + '件)'; }).join(', ') || 'なし';
  let report = (dryRun ? '【点検のみ・データは変更していません】\n\n' : '【修正を実行しました】\n\n')
    + 'ぽめ(' + MISFILE_FROM_STAFF_ID + ') → 松村 百恵(' + MISFILE_TO_STAFF_ID + ')\n'
    + '対象合計: ' + moved + ' 件\n'
    + '対象月: ' + monthsStr + '\n';
  if (conflicts.length > 0) {
    report += '\n⚠️ 松村側に既に同じ日付があるためスキップ（要手動確認）: ' + conflicts.length + ' 件\n  ' + conflicts.join(', ') + '\n';
  }
  if (dryRun) {
    report += '\nこの内容でよければ「② 勤怠IDズレを修正」を実行してください。';
  } else {
    report += '\n出勤簿を再生成しました。該当月の給与は「給与計算」を再実行して更新してください。\n変更前の値は「勤怠ID修正ログ」シートに保存済みです。';
  }
  return { report: report, moved: moved, conflicts: conflicts, months: Object.keys(perMonth) };
}

/**
 * メニュー: いま Apps Script に反映されているコードのバージョンを表示する。
 * このダイアログに最新版（CODE_VERSION）が出れば、コードは正しく反映済み。
 * メニュー項目自体が出てこない場合は、コードを貼り付けて保存→ページ再読込が必要。
 */
function menuShowCodeVersion() {
  SpreadsheetApp.getUi().alert(
    'コードのバージョン',
    '現在反映されているコード: ' + CODE_VERSION +
    '\n\nこの表示が出ていれば、最新コードは正しく保存されています。' +
    '\n「出勤簿を再生成」を実行すると、総労働時間などが [h]:mm 表示（24h を超えても正しく）になります。',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * メニュー: 出勤簿シートだけを再生成する（シート構造変更や移行は行わない軽量版）。
 * 全スタッフ × 全 勤怠_YYYYMM の組み合わせで再構築する。
 */
function menuRebuildAttendanceLogs() {
  const ui = SpreadsheetApp.getUi();
  try {
    const sheets = rebuildAllAttendanceLogs_();
    ui.alert('出勤簿を再生成しました', sheets.length + ' 枚のシートを生成/更新しました。\n（元の 勤怠_YYYYMM シートは非表示化されています）', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('再生成に失敗しました', String(e && e.message ? e.message : e), ui.ButtonSet.OK);
  }
}

/**
 * 旧英名シートを日本語名にリネームする移行ヘルパ。
 *  - 固定シート: スタッフマスター / 管理者 / 有給休暇 / 保険料率 / 標準報酬月額 /
 *               勤怠申請 / 月次提出 / 編集履歴 / 希望休申請
 *  - 月次シート: 勤怠_YYYYMM / 給与_YYYYMM / 税額_YYYYMM / 歩合_YYYYMM / シフト_YYYYMM
 *
 * すでに日本語名のシートが存在する場合はリネームしない（重複を作らない）。
 * Idempotent なので何度呼んでも安全。
 */
function migrateSheetNames() {
  const ss = getSpreadsheet();
  const renamed = [];

  // 固定シート
  Object.keys(LEGACY_SHEET_NAME_MAP).forEach(function (oldName) {
    const newName = LEGACY_SHEET_NAME_MAP[oldName];
    const oldSheet = ss.getSheetByName(oldName);
    const newSheet = ss.getSheetByName(newName);
    if (oldSheet && !newSheet) {
      try {
        oldSheet.setName(newName);
        renamed.push(oldName + ' → ' + newName);
      } catch (e) {
        Logger.log('rename failed: ' + oldName + ' → ' + newName + ' / ' + e.message);
      }
    }
  });

  // 月次シート（プレフィックスのマッピング）
  const monthlyPrefix = [
    ['attendance_', '勤怠_'],
    ['salary_', '給与_'],
    ['tax_manual_', '税額_'],
    ['incentive_', '歩合_'],
    ['shift_', 'シフト_'],
  ];
  const allSheets = ss.getSheets();
  for (let i = 0; i < allSheets.length; i++) {
    const s = allSheets[i];
    const name = s.getName();
    for (let j = 0; j < monthlyPrefix.length; j++) {
      const oldP = monthlyPrefix[j][0];
      const newP = monthlyPrefix[j][1];
      if (name.indexOf(oldP) === 0) {
        const suffix = name.slice(oldP.length);
        if (/^\d{6}$/.test(suffix)) {
          const newName = newP + suffix;
          if (!ss.getSheetByName(newName)) {
            try {
              s.setName(newName);
              renamed.push(name + ' → ' + newName);
            } catch (e) {
              Logger.log('monthly rename failed: ' + name + ' / ' + e.message);
            }
          }
          break;
        }
      }
    }
  }

  // 全シートのヘッダー行も日本語化（idempotent）
  const headerMigrated = [];
  const allAfterRename = ss.getSheets();
  for (let i = 0; i < allAfterRename.length; i++) {
    const s = allAfterRename[i];
    if (migrateHeaderRow_(s)) {
      headerMigrated.push(s.getName());
    }
  }

  // 希望休申請シートを行ベース形式に変換（1 行 = 1 日）。idempotent。
  const shiftRequestRebuilt = ensureShiftRequestsRowBased_(ss.getSheetByName(SHEETS.SHIFT_REQUESTS));
  // 勤怠申請シートの details_json を個別列へ展開。idempotent。
  const applicationsFlattened = ensureApplicationsFlatColumns_();
  // 編集履歴の field 列を日本語に
  const historyLocalized = localizeAttendanceHistoryFields_();
  const enumLocalized = localizeExistingEnumValues_();
  // 勤怠シートの boolean 列をチェックボックス表示に変換
  const checkboxApplied = applyAttendanceCheckboxes_();
  // 出勤簿（1 スタッフ×1 月）ビューシートを再構築し、元の月次シートを非表示化
  const attendanceLogs = rebuildAllAttendanceLogs_();

  return {
    success: true,
    renamed: renamed,
    headerMigrated: headerMigrated,
    shiftRequestRebuilt: shiftRequestRebuilt,
    applicationsFlattened: applicationsFlattened,
    historyLocalized: historyLocalized,
    checkboxApplied: checkboxApplied,
    enumLocalized: enumLocalized,
    attendanceLogs: attendanceLogs,
  };
}

/**
 * 勤怠申請シートを「details_json 1 列」から「予定開始/予定終了/...」の
 * 個別列に展開する移行ヘルパ。idempotent。
 * - details_json / details_summary 列が残っていれば削除
 * - 必要な新スキーマ列を追加
 * - 既存行の JSON を解体して各列へ書き戻し
 */
function ensureApplicationsFlatColumns_() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.APPLICATIONS);
  if (!sheet) return { converted: false, rowsConverted: 0 };
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return { converted: false, rowsConverted: 0 };
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const djIdx = findHeaderIndex_(headers, 'details_json');
  const dsIdx = findHeaderIndex_(headers, 'details_summary');
  // 既に新スキーマ（details_json 列なし）の場合は何もしない
  if (djIdx === -1 && dsIdx === -1) return { converted: false, rowsConverted: 0 };

  // 旧データを読み込み（行→オブジェクト）
  const lastRow = sheet.getLastRow();
  const oldRows = (lastRow >= 2) ? sheet.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
  const idIdx = findHeaderIndex_(headers, 'id');
  const sIdx = findHeaderIndex_(headers, 'staff_id');
  const snIdx = findHeaderIndex_(headers, 'staff_name');
  const dIdx = findHeaderIndex_(headers, 'date');
  const tIdx = findHeaderIndex_(headers, 'type');
  const rIdx = findHeaderIndex_(headers, 'reason');
  const stIdx = findHeaderIndex_(headers, 'status');
  const subIdx = findHeaderIndex_(headers, 'submitted_at');
  const ratIdx = findHeaderIndex_(headers, 'reviewed_at');
  const rbyIdx = findHeaderIndex_(headers, 'reviewed_by');
  const rjIdx = findHeaderIndex_(headers, 'rejection_reason');

  const newSchema = [
    'id', 'staff_id', 'staff_name', 'date', 'type', 'reason',
    'reason_type', 'planned_start', 'planned_end', 'actual_start', 'actual_end',
    'planned_break_min', 'actual_break_min', 'overtime_min',
    'status', 'submitted_at', 'reviewed_at', 'reviewed_by', 'rejection_reason'
  ];

  const records = oldRows.map(function (row) {
    const details = safeJsonParse_(row[djIdx]) || {};
    return {
      id: idIdx !== -1 ? row[idIdx] : '',
      staff_id: sIdx !== -1 ? row[sIdx] : '',
      staff_name: snIdx !== -1 ? row[snIdx] : '',
      date: dIdx !== -1 ? formatDateOnly_(row[dIdx]) : '',
      type: tIdx !== -1 ? row[tIdx] : '',
      reason: rIdx !== -1 ? row[rIdx] : '',
      reason_type: details.reasonType ? localizeEnumValue_(details.reasonType) : '',
      planned_start: details.plannedStart || '',
      planned_end: details.plannedEnd || '',
      actual_start: details.actualStart || '',
      actual_end: details.actualEnd || '',
      planned_break_min: (details.plannedBreak !== undefined && details.plannedBreak !== null) ? Number(details.plannedBreak) : '',
      actual_break_min: (details.actualBreak !== undefined && details.actualBreak !== null) ? Number(details.actualBreak) : '',
      overtime_min: (details.overtimeMinutes !== undefined && details.overtimeMinutes !== null) ? Number(details.overtimeMinutes) : '',
      status: stIdx !== -1 ? row[stIdx] : '',
      submitted_at: subIdx !== -1 ? row[subIdx] : '',
      reviewed_at: ratIdx !== -1 ? row[ratIdx] : '',
      reviewed_by: rbyIdx !== -1 ? row[rbyIdx] : '',
      rejection_reason: rjIdx !== -1 ? row[rjIdx] : '',
    };
  });

  // 書き込み用の全データ（ヘッダー + データ）をメモリ上で完全に組み立てる。
  // ここまでで例外が出れば「クリアする前に」止まるため、シート内容は無傷で保たれる。
  const headersRow = localizeHeaders_(newSchema);
  const valuesRows = records.map(function (r) {
    return newSchema.map(function (key) {
      if (ENUM_COLUMNS[key]) return localizeEnumValue_(r[key]);
      return r[key] != null ? r[key] : '';
    });
  });

  // 列数を先に確保
  if (sheet.getMaxColumns() < newSchema.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), newSchema.length - sheet.getMaxColumns());
  }
  // クリア → 書込（できるだけ短時間で）
  sheet.getRange(1, 1, Math.max(1, lastRow), Math.max(lastCol, newSchema.length)).clearContent();
  const allRows = [headersRow].concat(valuesRows);
  sheet.getRange(1, 1, allRows.length, newSchema.length).setValues(allRows);
  return { converted: true, rowsConverted: records.length };
}

/**
 * 編集履歴シートの「フィールド」列に英語キー (clock_in 等) が残っていれば
 * 日本語ラベルに置き換える。idempotent。
 */
function localizeAttendanceHistoryFields_() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.ATTENDANCE_HISTORY);
  if (!sheet) return { converted: 0 };
  const lastCol = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  if (lastCol < 1 || lastRow < 2) return { converted: 0 };
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const fIdx = findHeaderIndex_(headers, 'field');
  if (fIdx === -1) return { converted: 0 };
  const range = sheet.getRange(2, fIdx + 1, lastRow - 1, 1);
  const values = range.getValues();
  let converted = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i][0];
    if (typeof v !== 'string' || !v) continue;
    const ja = HEADER_LABELS[v];
    if (ja && v !== ja) {
      values[i][0] = ja;
      converted++;
    }
  }
  if (converted > 0) range.setValues(values);
  return { converted: converted };
}

// =====================================================================
// 出勤簿（per-staff × per-month）ビューシート
// =====================================================================
// 1 スタッフ × 1 月で 1 枚のシートを生成し、画像の様式で日次の勤怠を表示する。
// データソースは既存の月次 勤怠_YYYYMM シート（変更しない）。
// シート名: 出勤簿_<氏名>_<YYYY-MM>
// =====================================================================

function attendanceLogSheetName_(name, yearMonth) {
  const safe = String(name || '').replace(/[\/\\?*\[\]:]/g, '_');
  return '出勤簿_' + safe + '_' + yearMonth;
}

function formatMinutesAsHHMM_(mins) {
  if (mins == null || mins === '' || isNaN(Number(mins))) return '0:00';
  const total = Math.max(0, Math.round(Number(mins)));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h + ':' + String(m).padStart(2, '0');
}

function nightWorkMinutesForRow_(clockIn, clockOut) {
  // 22:00-05:00 を深夜帯として、与えられた打刻時刻範囲のうち深夜帯と重なる分数を返す。
  if (!clockIn || !clockOut) return 0;
  // Date 型なら formatTimeOnly_ で 'HH:mm' 文字列に正規化（String(Date) は '[object Date]' になり失敗するため）
  const ci = (clockIn instanceof Date) ? formatTimeOnly_(clockIn) : String(clockIn);
  const co = (clockOut instanceof Date) ? formatTimeOnly_(clockOut) : String(clockOut);
  const ts = ci.match(/^(\d{1,2}):(\d{2})/);
  const te = co.match(/^(\d{1,2}):(\d{2})/);
  if (!ts || !te) return 0;
  const startMin = Number(ts[1]) * 60 + Number(ts[2]);
  let endMin = Number(te[1]) * 60 + Number(te[2]);
  if (endMin < startMin) endMin += 24 * 60;
  // 深夜帯: 0:00-5:00, 22:00-29:00 (= 翌 5:00)
  const ranges = [[0, 5 * 60], [22 * 60, 29 * 60]];
  let nightMin = 0;
  for (let i = 0; i < ranges.length; i++) {
    const ovStart = Math.max(startMin, ranges[i][0]);
    const ovEnd = Math.min(endMin, ranges[i][1]);
    if (ovEnd > ovStart) nightMin += ovEnd - ovStart;
  }
  return nightMin;
}

/**
 * 出勤簿シートを 1 枚（staffId × yearMonth）再構築する。
 * 既存シートがあれば中身をクリアして書き直す。
 */
function rebuildAttendanceLogSheet_(staffId, yearMonth) {
  if (!staffId || !yearMonth) return null;
  const m = String(yearMonth).match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!(month >= 1 && month <= 12)) return null;

  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staff = sheetToObjects(staffSheet).find(function (s) { return s.staff_id === staffId; });
  if (!staff) return null;

  // ──── Phase 1: 読込 & メモリ上で全データを構築（書き込み前に完成させる）────
  const srcSheet = getAttendanceSheet(year, month);
  const rows = sheetToObjects(srcSheet).filter(function (r) { return r.staff_id === staffId; });
  const byDate = {};
  rows.forEach(function (r) {
    const dk = formatDateOnly_(r.date);
    if (dk) byDate[dk] = r;
  });

  const workDaysInMonth = getStandardWorkDaysForMonth_(year, month);
  const standardPerDayMin = 480; // 1 日 8h = 480 分
  const standardMonthMin = standardPerDayMin * workDaysInMonth;
  // 「176:00」など 24h を超える所要時間を文字列で setValues すると、Sheets が時刻型に勝手に
  // 変換して 24h でロールオーバーした「8:00」として表示されてしまう。
  // → 値は数値（= 分 / 1440 = 「1日 = 1.0」スケール）で書き込み、セル書式を [h]:mm にして
  // 24h を超える時間も正しく表示するように統一する。
  function minutesToDayFraction_(mins) {
    const n = Number(mins);
    return isNaN(n) ? 0 : n / 1440; // 1440 = 60 * 24
  }

  const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
  const daysInMonth = new Date(year, month, 0).getDate();
  const COL_TOTAL = 12;
  const HEADER_ROWS = 3; // メタ + グループ見出し + サブ見出し
  const DATA_START = HEADER_ROWS + 1; // 4

  // 日次データを配列に組み立て + 行属性を別配列で保持
  const dataValues = [];
  const rowFlags = []; // { wkday, hasWork }
  let workDays = 0;
  let totalAmMin = 0, totalPmMin = 0, totalStandardMin = 0, totalOvertimeMin = 0, totalNightMin = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = year + '-' + String(month).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const wkday = new Date(year, month - 1, d).getDay();
    const r = byDate[date];
    const clockIn = r && r.clock_in ? formatTimeOnly_(r.clock_in) : '';
    const clockOut = r && r.clock_out ? formatTimeOnly_(r.clock_out) : '';
    const breakMin = safeNumber_(r && r.break_minutes, 0);
    const workMin = safeNumber_(r && r.work_minutes, 0);

    // 午前/午後 分割（休憩開始 = 出勤 + 4h パターン）
    let amIn = '', amOut = '', pmIn = '', pmOut = '';
    let amMin = 0, pmMin = 0;
    if (clockIn && clockOut) {
      const ciMin = parseHHMMToMinutes_(clockIn);
      let coMin = parseHHMMToMinutes_(clockOut);
      if (coMin < ciMin) coMin += 24 * 60;
      amIn = clockIn;
      const totalMin = coMin - ciMin;
      const breakStart = ciMin + 4 * 60;
      const breakEnd = breakStart + breakMin;
      if (breakMin > 0 && totalMin > 4 * 60 && breakEnd < coMin) {
        amOut = formatMinutesToHHMM_(breakStart);
        pmIn = formatMinutesToHHMM_(breakEnd);
        pmOut = clockOut;
        amMin = 4 * 60;
        pmMin = coMin - breakEnd;
      } else {
        amOut = clockOut;
        amMin = Math.max(0, totalMin);
        pmIn = '';
        pmOut = '';
        pmMin = 0;
      }
    }

    const hasWork = workMin > 0;
    let standardForDay = 0;
    let overtimeForDay = 0;
    if (hasWork) {
      standardForDay = Math.min(workMin, standardPerDayMin);
      overtimeForDay = Math.max(0, workMin - standardPerDayMin);
      workDays++;
      totalAmMin += amMin;
      totalPmMin += pmMin;
      totalStandardMin += standardForDay;
      totalOvertimeMin += overtimeForDay;
    }
    const nightMin = nightWorkMinutesForRow_(clockIn, clockOut);
    if (nightMin > 0) totalNightMin += nightMin;

    // 所要時間（時間量）は数値（日数換算）として書き込み、
    // 時刻（出勤/退勤など壁時計時刻）は文字列のまま保持する。
    dataValues.push([
      month + '/' + d, WEEKDAYS[wkday],
      amIn, amOut, hasWork ? minutesToDayFraction_(amMin) : 0,
      pmIn, pmOut, hasWork ? minutesToDayFraction_(pmMin) : 0,
      hasWork ? minutesToDayFraction_(workMin) : 0,
      hasWork ? minutesToDayFraction_(standardForDay) : 0,
      minutesToDayFraction_(overtimeForDay),
      minutesToDayFraction_(nightMin),
    ]);
    rowFlags.push({ wkday: wkday, hasWork: hasWork });
  }

  const sumRow = DATA_START + dataValues.length;
  const totalRows = sumRow; // 集計行を含む最終行

  // ──── Phase 2: シート取得 / クリア / 書込（一括 setValues で原子性を高める）────
  const ss = getSpreadsheet();
  const sheetName = attendanceLogSheetName_(staff.name, yearMonth);
  let sheet = ss.getSheetByName(sheetName);
  const isNew = !sheet;
  if (isNew) sheet = ss.insertSheet(sheetName);

  try {
    // 既存セル/書式/Merge を完全リセット。
    // 重要: 旧コードが文字列 "208:00" 等を書いた際に Sheets が自動付与した期間書式
    //       （[h]:mm:ss など）がセルに残ると、後から setNumberFormat('[h]:mm') をかけても
    //       上書きされず 24h ロールオーバー表示（67:44→19:44）が直らないことがある。
    //       clearContents だけでなく clearFormats も明示的に呼んで残留書式を確実に消す。
    if (!isNew) {
      try { sheet.getRange(1, 1, Math.max(1, sheet.getMaxRows()), Math.max(1, sheet.getMaxColumns())).breakApart(); } catch (e) { /* ignore */ }
      try { sheet.clearContents(); } catch (e) { /* ignore */ }
      try { sheet.clearFormats(); } catch (e) { /* ignore */ }
      sheet.clear();
    }
    if (sheet.getMaxColumns() < COL_TOTAL) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), COL_TOTAL - sheet.getMaxColumns());
    }

    // 行 1: メタ（所定労働時間は数値で書き込み、[h]:mm 表示する）
    const metaRow = ['年', year, '月', month, '氏名', staff.name, '所定労働時間', minutesToDayFraction_(standardMonthMin), '', '', '', ''];
    // 行 2: グループ見出し
    const groupHeader = ['', '', '勤怠時間入力', '', '', '', '', '', '総労働時間', '所定労働時間', '残業時間', '深夜時間'];
    // 行 3: サブ見出し
    const subHeader = ['日付', '曜日', '午前', '', '', '午後', '', '', '', '', '', ''];
    // 行 sumRow: 集計行
    // 「総労働時間」合計は workMin の総和（= totalStandardMin + totalOvertimeMin）。
    // 旧コードは totalAmMin + totalPmMin を使っていたが、出勤/退勤時刻が空のまま work_minutes だけ
    // 入った日があると 0 扱いされ、日次行の総労働時間と合わなくなるため。
    const sumLabels = ['合計', workDays + '日',
      '', '', minutesToDayFraction_(totalAmMin),
      '', '', minutesToDayFraction_(totalPmMin),
      minutesToDayFraction_(totalStandardMin + totalOvertimeMin),
      minutesToDayFraction_(totalStandardMin),
      minutesToDayFraction_(totalOvertimeMin),
      minutesToDayFraction_(totalNightMin)];

    const allValues = [metaRow, groupHeader, subHeader]
      .concat(dataValues).concat([sumLabels]);

    // ── 数値書式 ──
    // 時間量セル（24h を超え得る所要時間）は [h]:mm でフォーマット、それ以外は文字列扱い。
    // 「176:00」のような文字列を直接 setValues すると Sheets が時刻型に自動変換して
    // 24h でロールオーバー（→ "8:00" 等）してしまうため、値は数値（= 分/1440）で書き込み、
    // セル書式で [h]:mm 表示させる方式に統一した。
    const FMT_HHMM = '[h]:mm';
    const FMT_TEXT = '@';
    // 1-indexed の "所要時間列"（午前-時間, 午後-時間, 総労働時間, 所定労働時間, 残業時間, 深夜時間）
    const DURATION_COLS_DATA = [5, 8, 9, 10, 11, 12];
    const DURATION_COLS_SUM = [5, 8, 9, 10, 11, 12];
    function makeFormatRow_(durationCols) {
      const r = new Array(COL_TOTAL).fill(FMT_TEXT);
      durationCols.forEach(function (c) { r[c - 1] = FMT_HHMM; });
      return r;
    }
    const formats = [];
    // メタ行: H 列（所定労働時間）のみ [h]:mm
    formats.push(makeFormatRow_([8]));
    // ヘッダー 2 行はすべて文字列
    formats.push(new Array(COL_TOTAL).fill(FMT_TEXT));
    formats.push(new Array(COL_TOTAL).fill(FMT_TEXT));
    // 日次データ行: 所要時間列のみ [h]:mm
    for (let i = 0; i < dataValues.length; i++) {
      formats.push(makeFormatRow_(DURATION_COLS_DATA));
    }
    // 集計行
    formats.push(makeFormatRow_(DURATION_COLS_SUM));

    // 書式を先に確定 → 値を書き込み（順序を逆にすると Sheets の自動型推論が先行する）
    sheet.getRange(1, 1, allValues.length, COL_TOTAL).setNumberFormats(formats);
    sheet.getRange(1, 1, allValues.length, COL_TOTAL).setValues(allValues);
    // 二重防御: setValues 後にも所要時間列へ [h]:mm を再適用する。
    // 既存シートの書式残留や Sheets の自動再推論で h:mm（24h ロールオーバー）に
    // 戻ってしまうケースを確実に防ぐ。各 1 列ぶんを縦に [h]:mm で固定。
    DURATION_COLS_DATA.forEach(function (c) {
      sheet.getRange(1, c, allValues.length, 1).setNumberFormat(FMT_HHMM);
    });

    // ── 書式 ──
    // メタ行: ラベル太字
    sheet.getRange(1, 1).setFontWeight('bold');
    sheet.getRange(1, 3).setFontWeight('bold');
    sheet.getRange(1, 5).setFontWeight('bold');
    sheet.getRange(1, 7).setFontWeight('bold');
    sheet.getRange(1, 1, 1, COL_TOTAL).setBackground('#fef7e0');

    // ヘッダー 2 行
    sheet.getRange(2, 1, 2, COL_TOTAL)
      .setFontWeight('bold').setHorizontalAlignment('center').setBackground('#e8f0fe').setVerticalAlignment('middle');
    // merge
    try { sheet.getRange(2, 3, 1, 6).merge(); } catch (e) { /* ignore */ }
    try { sheet.getRange(3, 3, 1, 3).merge(); } catch (e) { /* ignore */ }
    try { sheet.getRange(3, 6, 1, 3).merge(); } catch (e) { /* ignore */ }
    // 「総労働時間/所定/残業/深夜」のラベルは 2 行ぶん縦結合した方が読みやすい
    for (let c = 9; c <= 12; c++) {
      try { sheet.getRange(2, c, 2, 1).merge(); } catch (e) { /* ignore */ }
    }
    // 「日付」「曜日」のラベルも 2 行縦結合
    try { sheet.getRange(2, 1, 2, 1).merge(); } catch (e) { /* ignore */ }
    try { sheet.getRange(2, 2, 2, 1).merge(); } catch (e) { /* ignore */ }

    // データ行のアラインメント
    // ※ 数値書式は上の setNumberFormats で 1 回にまとめて適用済みなので
    //   ここで '@' をかけ直さない（所要時間列の [h]:mm を上書きしてしまうため）
    if (dataValues.length > 0) {
      const dataRange = sheet.getRange(DATA_START, 1, dataValues.length, COL_TOTAL);
      dataRange.setHorizontalAlignment('center').setVerticalAlignment('middle');
    }

    // 集計行（数値書式は setNumberFormats で適用済み）
    sheet.getRange(sumRow, 1, 1, COL_TOTAL)
      .setFontWeight('bold').setBackground('#fff7e6').setHorizontalAlignment('center');

    // 「出勤無し」行のみ文字色をグレーに（土日色付けは行わない）
    if (rowFlags.length > 0) {
      const fgRows = [];
      for (let i = 0; i < rowFlags.length; i++) {
        const fg = rowFlags[i].hasWork ? null : '#bbbbbb';
        const fgRow = [];
        for (let c = 0; c < COL_TOTAL; c++) fgRow.push(fg);
        fgRows.push(fgRow);
      }
      const dataRange = sheet.getRange(DATA_START, 1, rowFlags.length, COL_TOTAL);
      try { dataRange.setFontColors(fgRows); } catch (e) { /* ignore */ }
    }

    // 枠線
    sheet.getRange(2, 1, totalRows - 1, COL_TOTAL)
      .setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);

    // 列幅
    // メタ行で staff.name が表示される col 6 を広めに確保
    sheet.setColumnWidth(1, 56);
    sheet.setColumnWidth(2, 42);
    sheet.setColumnWidth(3, 70); sheet.setColumnWidth(4, 70); sheet.setColumnWidth(5, 60);
    sheet.setColumnWidth(6, 110); sheet.setColumnWidth(7, 70); sheet.setColumnWidth(8, 60);
    sheet.setColumnWidth(9, 80); sheet.setColumnWidth(10, 90); sheet.setColumnWidth(11, 80); sheet.setColumnWidth(12, 80);
    // メタ行のセルは折返し有効化（長い氏名・所定労働時間でも収まるように）
    try { sheet.getRange(1, 1, 1, COL_TOTAL).setWrap(true); } catch (e) { /* ignore */ }

    // 行高
    try {
      sheet.setRowHeight(1, 28);
      sheet.setRowHeight(2, 26);
      sheet.setRowHeight(3, 26);
      sheet.setRowHeight(sumRow, 28);
    } catch (e) { /* ignore */ }

    // ヘッダー 3 行を固定
    try { sheet.setFrozenRows(HEADER_ROWS); } catch (e) { /* ignore */ }
    // 日付・曜日列を固定
    try { sheet.setFrozenColumns(2); } catch (e) { /* ignore */ }

    // タブ色（出勤簿シートと元データを視覚的に区別）
    try { sheet.setTabColor('#4285f4'); } catch (e) { /* ignore */ }

    // ── 最終防御: 所要時間列の [h]:mm を「最後に」もう一度確定 ──
    // 上の装飾処理（merge / border 等）で書式が触られても、ここで必ず [h]:mm に戻す。
    // これが当関数で所要時間列に対する最後の書式操作になるよう、return 直前に置く。
    DURATION_COLS_DATA.forEach(function (c) {
      sheet.getRange(1, c, allValues.length, 1).setNumberFormat(FMT_HHMM);
    });
    SpreadsheetApp.flush();

  } catch (e) {
    // 書込中に致命エラーが出てもユーザーには「失敗を明示」して中間状態を残さないようログに残す
    Logger.log('rebuildAttendanceLogSheet_ failed for ' + staffId + '/' + yearMonth + ': ' + (e && e.message ? e.message : e));
    throw e;
  }

  return sheet;
}

function parseHHMMToMinutes_(hhmm) {
  if (!hhmm) return 0;
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

function formatMinutesToHHMM_(mins) {
  if (mins == null || isNaN(Number(mins))) return '';
  let total = Math.round(Number(mins));
  // 翌日跨ぎは 24h を超えうるので mod する
  total = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(total / 60);
  const mi = total % 60;
  return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
}

// 月の所定労働分数（週 44 時間 × 月の所定労働日数 / 5.5 日基準）
// 美容業特例 (週 44h) を 1 日 8h × 5.5 日と按分し、所定日数 × 8h 換算で返す。
function getStandardWorkMinutesForMonth_(year, month) {
  const workDays = getStandardWorkDaysForMonth_(year, month);
  // 1 日所定 = 44h ÷ 5.5d = 8h = 480 分
  return Math.round((44 * 60 / 5.5) * workDays);
}

// 月の所定労働日数（簡易: 月の日数 - 法定休日相当としてざっくり 4 を引く）
function getStandardWorkDaysForMonth_(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  // 日曜のみ休む想定で week × 1
  let workDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const w = new Date(year, month - 1, d).getDay();
    if (w !== 0) workDays++;
  }
  return workDays;
}

function formatTimeOnly_(v) {
  if (!v) return '';
  if (v instanceof Date) {
    // スクリプトのタイムゾーン (既定 Asia/Tokyo) で 'HH:mm' を取得する。
    // 単純な v.getHours() は実行環境次第で UTC ベースになり時刻がズレる。
    try { return Utilities.formatDate(v, scriptTimeZone_(), 'HH:mm'); } catch (e) { /* fall through */ }
  }
  const m = String(v).match(/(\d{1,2}):(\d{2})/);
  return m ? (String(Number(m[1])).padStart(2, '0') + ':' + m[2]) : String(v);
}

/**
 * 全スタッフ × 既存の勤怠_YYYYMM シートに対応する 出勤簿シートを再構築する。
 * 戻り値: 作成/更新したシート名の配列
 * 同時実行ガード: LockService で他のプロセスと衝突しないよう保護
 */
function rebuildAllAttendanceLogs_() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30 * 1000); // 最大 30 秒待つ
  } catch (e) {
    Logger.log('rebuildAllAttendanceLogs_ lock timeout: ' + (e && e.message));
    return [];
  }
  try {
    const ss = getSpreadsheet();
    const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
    const staffList = sheetToObjects(staffSheet);
    const monthlySheetRe = /^勤怠_(\d{4})(\d{2})$/;
    const sheets = ss.getSheets();
    const monthsFound = [];
    sheets.forEach(function (s) {
      const m = s.getName().match(monthlySheetRe);
      if (m) monthsFound.push({ year: Number(m[1]), month: Number(m[2]) });
    });
    const built = [];
    const failed = [];
    staffList.forEach(function (staff) {
      monthsFound.forEach(function (ym) {
        const yearMonth = ym.year + '-' + String(ym.month).padStart(2, '0');
        try {
          const out = rebuildAttendanceLogSheet_(staff.staff_id, yearMonth);
          if (out) built.push(out.getName());
        } catch (e) {
          failed.push(staff.staff_id + '/' + yearMonth);
          Logger.log('rebuildAttendanceLog failed for ' + staff.staff_id + '/' + yearMonth + ': ' + (e && e.message));
        }
      });
    });
    // 元データの 勤怠_YYYYMM シートを非表示にする
    sheets.forEach(function (s) {
      if (monthlySheetRe.test(s.getName())) {
        try { s.hideSheet(); } catch (e) { /* ignore */ }
      }
    });
    if (failed.length > 0) Logger.log('rebuildAllAttendanceLogs_ partial failures: ' + failed.join(', '));
    return built;
  } finally {
    try { lock.releaseLock(); } catch (e) { /* ignore */ }
  }
}

/**
 * 既存の勤怠_YYYYMM シートの boolean 列をチェックボックス表示に変換する。
 * 戻り値: 適用したシート名の配列
 */
function applyAttendanceCheckboxes_() {
  const ss = getSpreadsheet();
  const sheets = ss.getSheets();
  const applied = [];
  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    const name = sheet.getName();
    if (!/^勤怠_\d{6}$/.test(name) && !/^attendance_\d{6}$/.test(name)) continue;
    applyCheckboxValidation_(sheet, ['is_holiday', 'break_minutes_is_manual']);
    applied.push(name);
  }
  return applied;
}

/**
 * 既存シートの enum 列に英語が残っていれば日本語ラベルに置き換える。idempotent。
 * 戻り値: { sheetName: rowCount, ... } 更新が発生したシートのみ含む。
 */
function localizeExistingEnumValues_() {
  const ss = getSpreadsheet();
  const sheets = ss.getSheets();
  const updated = {};
  for (let s = 0; s < sheets.length; s++) {
    const sheet = sheets[s];
    const lastCol = sheet.getLastColumn();
    const lastRow = sheet.getLastRow();
    if (lastCol < 1 || lastRow < 2) continue;
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    // 各 enum 列について置換
    Object.keys(ENUM_COLUMNS).forEach(function (key) {
      const idx = findHeaderIndex_(headers, key);
      if (idx === -1) return;
      const col = idx + 1;
      const values = sheet.getRange(2, col, lastRow - 1, 1).getValues();
      let changed = 0;
      for (let i = 0; i < values.length; i++) {
        const v = values[i][0];
        if (typeof v !== 'string' || !v) continue;
        if (ENUM_LABEL_MAP[v]) {
          values[i][0] = ENUM_LABEL_MAP[v];
          changed++;
        }
      }
      if (changed > 0) {
        sheet.getRange(2, col, values.length, 1).setValues(values);
        const name = sheet.getName();
        updated[name] = (updated[name] || 0) + changed;
      }
    });
  }
  return updated;
}

/**
 * 1行目のヘッダー値を日本語ラベルに置き換える。idempotent。
 * 既に日本語または未登録の値はそのまま残す。
 */
function migrateHeaderRow_(sheet) {
  if (!sheet) return false;
  const lastCol = sheet.getLastColumn();
  if (!lastCol || lastCol < 1) return false;
  let row;
  try {
    row = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  } catch (e) {
    return false;
  }
  let changed = false;
  const updated = row.map(function (v) {
    if (typeof v !== 'string') return v;
    const ja = HEADER_LABELS[v];
    if (ja && ja !== v) {
      changed = true;
      return ja;
    }
    return v;
  });
  if (changed) {
    try {
      sheet.getRange(1, 1, 1, updated.length).setValues([updated]);
    } catch (e) {
      Logger.log('migrateHeaderRow_ setValues failed: ' + (e && e.message));
      return false;
    }
  }
  return changed;
}

function menuMigrateSheetNames() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.alert(
    'シート名を日本語に移行',
    '英語名で作成された既存シート（staff_master, attendance_YYYYMM 等）を日本語名にリネームし、\n各シートのカラムヘッダーも日本語ラベルに置き換えます。\n\n実行しますか？',
    ui.ButtonSet.YES_NO
  );
  if (res !== ui.Button.YES) return;
  const result = migrateSheetNames();
  const lines = [];
  if (result.renamed && result.renamed.length > 0) {
    lines.push('【シート名の変更】');
    lines.push.apply(lines, result.renamed);
  }
  if (result.headerMigrated && result.headerMigrated.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('【ヘッダー行の日本語化】');
    lines.push.apply(lines, result.headerMigrated);
  }
  if (result.shiftRequestRebuilt && result.shiftRequestRebuilt.converted) {
    if (lines.length > 0) lines.push('');
    lines.push('【希望休申請シート】');
    lines.push('JSON 形式 → 1 行 1 日の行ベースに変換: ' + result.shiftRequestRebuilt.rowsCreated + '行を生成');
  }
  if (result.applicationsFlattened && result.applicationsFlattened.converted) {
    if (lines.length > 0) lines.push('');
    lines.push('【勤怠申請シート】');
    lines.push('詳細(JSON) → 個別列に展開: ' + result.applicationsFlattened.rowsConverted + '行を変換');
  }
  if (result.historyLocalized && result.historyLocalized.converted > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('【編集履歴シート】');
    lines.push('フィールド名 (clock_in 等) を日本語化: ' + result.historyLocalized.converted + '行');
  }
  if (result.attendanceLogs && result.attendanceLogs.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('【出勤簿シート】');
    lines.push('1 スタッフ×1 月の出勤簿を ' + result.attendanceLogs.length + ' 枚生成（元の 勤怠_YYYYMM は非表示化）');
  }
  if (result.enumLocalized) {
    const sheetsUpdated = Object.keys(result.enumLocalized);
    if (sheetsUpdated.length > 0) {
      if (lines.length > 0) lines.push('');
      lines.push('【選択値（種別/ステータス等）を日本語に変換】');
      sheetsUpdated.forEach(function (n) {
        lines.push('  ' + n + ': ' + result.enumLocalized[n] + '件');
      });
    }
  }
  if (result.checkboxApplied && result.checkboxApplied.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('【勤怠シートの Boolean 列をチェックボックス表示に】');
    result.checkboxApplied.forEach(function (n) { lines.push('  ' + n); });
  }
  if (lines.length > 0) {
    ui.alert('移行完了', lines.join('\n'), ui.ButtonSet.OK);
  } else {
    ui.alert('移行不要', '対象の旧名/旧ヘッダーはありませんでした。', ui.ButtonSet.OK);
  }
}

function menuGenerateNextMonthShift() {
  const result = generateShiftTemplate();
  SpreadsheetApp.getUi().alert(result.success ? '作成: ' + result.sheetName : '失敗: ' + (result.message || ''));
}

// ============================================================
// Shift request (希望シフト申請) handlers
// ============================================================

/**
 * 対象月の提出期限 (YYYY-MM-DD) を返す。対象月の2ヶ月前の7日。
 * 例: '2026-07' → '2026-05-07'
 */
function shiftRequestDeadline_(targetYearMonth) {
  const m = String(targetYearMonth || '').match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return '';
  const y = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  let dY = y;
  let dM = month - 2;
  while (dM < 1) {
    dM += 12;
    dY -= 1;
  }
  return dY + '-' + String(dM).padStart(2, '0') + '-07';
}

/**
 * 今日（ローカルタイムゾーン）が `targetYearMonth` の期限以前か。
 */
function isShiftRequestOpen_(targetYearMonth) {
  const deadline = shiftRequestDeadline_(targetYearMonth);
  if (!deadline) return false;
  const today = Utilities.formatDate(new Date(), scriptTimeZone_(), 'yyyy-MM-dd');
  return today <= deadline;
}

/**
 * 旧形式 ([{date, kind, startTime, endTime}]) → 新形式 ([{date, status}]) に変換。
 * - kind === 'off' のみ status='pending' で取り込み
 * - 新形式（status を持つ要素）はそのまま返す
 */
function normalizeOffDays_(parsed) {
  if (!Array.isArray(parsed)) return [];
  const result = [];
  for (let i = 0; i < parsed.length; i++) {
    const d = parsed[i];
    if (!d || !d.date) continue;
    if (typeof d.status === 'string') {
      // 新形式
      result.push({
        date: String(d.date),
        status: d.status,
        reviewedAt: d.reviewedAt || undefined,
        reviewedBy: d.reviewedBy || undefined,
        rejectionReason: d.rejectionReason || undefined,
      });
    } else if (d.kind === 'off') {
      // 旧形式の off → pending として取り込む
      result.push({ date: String(d.date), status: 'pending' });
    }
    // kind='none'/'time' は破棄
  }
  return result;
}


/**
 * スタッフが希望休を提出。同一 (staff_id × target_year_month) は行ベースでマージ。
 * 各「希望日」は 1 行ずつ保存される。
 *
 * body: { staffId, targetYearMonth, offDays: [{date, status?}], remarks? }
 */
function handleSubmitShiftRequest(body) {
  const staffId = body && body.staffId ? String(body.staffId) : '';
  const targetYearMonth = body && body.targetYearMonth ? String(body.targetYearMonth) : '';
  const incoming = body && Array.isArray(body.offDays) ? body.offDays : (body && Array.isArray(body.days) ? body.days : null);
  const remarks = body && body.remarks ? String(body.remarks) : '';

  if (!staffId || !targetYearMonth || !incoming) {
    return { success: false, error: '必須項目が入力されていません' };
  }
  if (!/^\d{4}-\d{1,2}$/.test(targetYearMonth)) {
    return { success: false, error: '対象月の形式が不正です（YYYY-MM）' };
  }
  // 不正値での DoS / タイムアウト対策（1 ヶ月の希望休は最大 31 日）
  if (incoming.length > 31) {
    return { success: false, error: '希望休の日数が多すぎます（最大 31 日）' };
  }
  // 月の範囲チェック
  const ymMatch = targetYearMonth.match(/^(\d{4})-(\d{1,2})$/);
  if (ymMatch) {
    const mm = parseInt(ymMatch[2], 10);
    if (!(mm >= 1 && mm <= 12)) {
      return { success: false, error: '対象月の月番号が不正です' };
    }
  }
  if (!isShiftRequestOpen_(targetYearMonth)) {
    const deadline = shiftRequestDeadline_(targetYearMonth);
    return { success: false, error: '提出期限を過ぎています（期限: ' + deadline + '）' };
  }

  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staff = sheetToObjects(staffSheet).find(s => s.staff_id === staffId);
  if (!staff) return { success: false, error: 'スタッフが見つかりません' };

  const sheet = getOrCreateSheet(SHEETS.SHIFT_REQUESTS);
  ensureShiftRequestsRowBased_(sheet);
  const data = sheet.getDataRange().getValues();
  const headers = (data && data[0]) ? data[0] : [];

  // 既存行のうち、同一 (staff_id, target_year_month) のものを収集
  const sIdx = findHeaderIndex_(headers, 'staff_id');
  const ymIdx = findHeaderIndex_(headers, 'target_year_month');
  const dIdx = findHeaderIndex_(headers, 'date');
  const stIdx = findHeaderIndex_(headers, 'status');
  if (sIdx === -1 || ymIdx === -1 || dIdx === -1 || stIdx === -1) {
    return { success: false, error: '希望休申請シートの構造が不正です。setupSystem() を実行してください' };
  }

  // 既存日 → 行情報
  const existingByDate = {};
  for (let i = 1; i < data.length; i++) {
    const rowYm = formatYearMonthValue_(data[i][ymIdx]);
    if (data[i][sIdx] !== staffId || rowYm !== targetYearMonth) continue;
    const dateKey = formatDateOnly_(data[i][dIdx]);
    if (!dateKey) continue;
    const rawStatus = data[i][stIdx];
    const enStatus = REVERSE_ENUM_LABEL_MAP[rawStatus] || rawStatus;
    existingByDate[dateKey] = { rowIndex: i + 1, status: enStatus };
  }

  // 受信側を希望休のみに正規化（kind='off' or status を持つ要素のみ採用）
  const incomingOff = normalizeOffDays_(incoming);
  const newDateSet = {};
  for (let k = 0; k < incomingOff.length; k++) newDateSet[incomingOff[k].date] = true;

  // 削除対象（pending かつ新セットに無い）の行 index を集める（後で逆順削除）
  const toDelete = [];
  Object.keys(existingByDate).forEach(function (dateKey) {
    const e = existingByDate[dateKey];
    if (e.status === 'approved') return; // 保持
    if (e.status === 'rejected') return; // 保持（再申請で個別に再活性化）
    if (!newDateSet[dateKey]) {
      // pending かつ新セットに無い → 取り下げ
      toDelete.push(e.rowIndex);
    }
  });

  // 既存 rejected で新セットに含まれる日 → pending に戻す（reviewedAt/By/理由をクリア）
  const now = new Date().toISOString();
  Object.keys(existingByDate).forEach(function (dateKey) {
    const e = existingByDate[dateKey];
    if (e.status !== 'rejected' || !newDateSet[dateKey]) return;
    setCellByColumnName_(sheet, e.rowIndex, headers, 'status', 'pending');
    setCellByColumnName_(sheet, e.rowIndex, headers, 'rejection_reason', '');
    setCellByColumnName_(sheet, e.rowIndex, headers, 'reviewed_at', '');
    setCellByColumnName_(sheet, e.rowIndex, headers, 'reviewed_by', '');
    setCellByColumnName_(sheet, e.rowIndex, headers, 'submitted_at', now);
    setCellByColumnName_(sheet, e.rowIndex, headers, 'remarks', remarks);
  });

  // 既存 pending かつ新セットにある日 → 備考のみ更新（status はそのまま）
  Object.keys(existingByDate).forEach(function (dateKey) {
    const e = existingByDate[dateKey];
    if (e.status !== 'pending' || !newDateSet[dateKey]) return;
    setCellByColumnName_(sheet, e.rowIndex, headers, 'remarks', remarks);
    setCellByColumnName_(sheet, e.rowIndex, headers, 'submitted_at', now);
  });

  // 新規日（既存に無い日）を行追加
  const dataHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colCount = Math.max(dataHeaders.length, 11);
  for (let k = 0; k < incomingOff.length; k++) {
    const d = incomingOff[k];
    if (existingByDate[d.date]) continue;
    const newRow = new Array(colCount).fill('');
    const rowId = 'SR' + Date.now() + Math.random().toString(36).slice(2, 6);
    const setByKey = function (key, v) {
      const i = findHeaderIndex_(dataHeaders, key);
      if (i === -1 || i >= newRow.length) return;
      newRow[i] = ENUM_COLUMNS[key] ? localizeEnumValue_(v) : v;
    };
    setByKey('id', rowId);
    setByKey('staff_id', staffId);
    setByKey('staff_name', staff.name);
    setByKey('target_year_month', targetYearMonth);
    setByKey('date', d.date);
    setByKey('status', 'pending');
    setByKey('rejection_reason', '');
    setByKey('reviewed_at', '');
    setByKey('reviewed_by', '');
    setByKey('submitted_at', now);
    setByKey('remarks', remarks);
    sheet.appendRow(newRow);
  }

  // 取り下げ行を逆順で削除（行 index がズレないように）
  toDelete.sort(function (a, b) { return b - a; });
  toDelete.forEach(function (rowIndex) {
    try { sheet.deleteRow(rowIndex); } catch (e) { Logger.log('deleteRow failed: ' + (e && e.message)); }
  });

  // 管理者へメール通知（pending 件数のみ伝える）
  try {
    const admins = getAdminEmails_();
    if (admins.length > 0) {
      const pendingCount = countShiftRequestPendingDays_(staffId, targetYearMonth);
      const subject = '【希望休 申請】' + staff.name + ' から ' + targetYearMonth + ' 分の希望が届きました';
      const bodyText = staff.name + 'さんから ' + targetYearMonth + ' 分の希望休が提出されました。\n\n'
        + '未承認の希望休: ' + pendingCount + '日\n'
        + (remarks ? '\n備考: ' + remarks + '\n' : '')
        + '\n管理画面で承認/却下を行ってください。';
      admins.forEach(function (email) { safeSendEmail_(email, subject, bodyText); });
    }
  } catch (e) {
    Logger.log('notify shift request failed: ' + (e && e.message));
  }

  return { success: true, data: { id: 'SR-' + staffId + '-' + targetYearMonth } };
}

// (staff × month) の pending 件数を数える
function countShiftRequestPendingDays_(staffId, targetYearMonth) {
  const sheet = getOrCreateSheet(SHEETS.SHIFT_REQUESTS);
  const rows = sheetToObjects(sheet);
  return rows.filter(function (r) {
    return r.staff_id === staffId
      && formatYearMonthValue_(r.target_year_month) === targetYearMonth
      && r.status === 'pending';
  }).length;
}

/**
 * 希望休 申請の一覧を返す。
 * 内部の行ベース格納を (staff × month) でグループ化して、従来の
 * { id, staffId, ..., offDays: [...] } 形式で返す（API 互換）。
 * params: { staffId?, targetYearMonth? }
 */
function handleListShiftRequests(params) {
  const sheet = getOrCreateSheet(SHEETS.SHIFT_REQUESTS);
  ensureShiftRequestsRowBased_(sheet);
  const data = sheetToObjects(sheet);
  const { staffId, targetYearMonth } = params || {};
  let filtered = data;
  if (staffId) filtered = filtered.filter(function (r) { return r.staff_id === staffId; });
  if (targetYearMonth) {
    const target = formatYearMonthValue_(targetYearMonth);
    filtered = filtered.filter(function (r) { return formatYearMonthValue_(r.target_year_month) === target; });
  }

  // (staff × month) でグループ化
  const groups = {};
  filtered.forEach(function (r) {
    const ym = formatYearMonthValue_(r.target_year_month);
    const key = r.staff_id + '|' + ym;
    if (!groups[key]) {
      groups[key] = {
        id: 'SR-' + r.staff_id + '-' + ym,
        staffId: r.staff_id,
        staffName: r.staff_name || '',
        targetYearMonth: ym,
        offDays: [],
        remarks: '',
        submittedAt: '',
      };
    }
    const dateKey = formatDateOnly_(r.date);
    if (!dateKey) return;
    groups[key].offDays.push({
      date: dateKey,
      status: r.status || 'pending',
      reviewedAt: toIsoString_(r.reviewed_at) || undefined,
      reviewedBy: r.reviewed_by || undefined,
      rejectionReason: r.rejection_reason || undefined,
    });
    if (r.remarks && !groups[key].remarks) groups[key].remarks = r.remarks;
    const submitted = toIsoString_(r.submitted_at);
    if (submitted && submitted > (groups[key].submittedAt || '')) {
      groups[key].submittedAt = submitted;
    }
  });

  // 日付昇順にソート
  Object.keys(groups).forEach(function (k) {
    groups[k].offDays.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  });

  return { success: true, data: Object.keys(groups).map(function (k) { return groups[k]; }) };
}

/**
 * 管理者が希望休の1日を承認/却下する。
 * body: { id?, staffId?, targetYearMonth?, date, status, rejectionReason?, reviewedBy? }
 * id は 'SR-<staffId>-<yearMonth>' 形式（後方互換）。staffId/targetYearMonth を
 * 明示指定するパスを優先。
 */
function handleReviewShiftRequestDay(body) {
  let staffId = body && body.staffId ? String(body.staffId) : '';
  let targetYearMonth = body && body.targetYearMonth ? String(body.targetYearMonth) : '';
  const date = body && body.date ? String(body.date) : '';
  const status = body && body.status ? String(body.status) : '';
  const rejectionReason = body && body.rejectionReason ? String(body.rejectionReason) : '';
  const reviewedBy = body && body.reviewedBy ? String(body.reviewedBy) : '';

  if ((!staffId || !targetYearMonth) && body && body.id) {
    // 後方互換: id = 'SR-<staffId>-<yearMonth>' を分解
    const m = String(body.id).match(/^SR-(.+?)-(\d{4}-\d{1,2})$/);
    if (m) {
      staffId = staffId || m[1];
      targetYearMonth = targetYearMonth || m[2];
    }
  }

  if (!staffId || !targetYearMonth || !date || (status !== 'approved' && status !== 'rejected')) {
    return { success: false, error: '必須項目が不正です' };
  }
  if (status === 'rejected' && !rejectionReason) {
    return { success: false, error: '却下理由は必須です' };
  }

  const sheet = getOrCreateSheet(SHEETS.SHIFT_REQUESTS);
  ensureShiftRequestsRowBased_(sheet);
  const data = sheet.getDataRange().getValues();
  const headers = (data && data[0]) ? data[0] : [];
  const sIdx = findHeaderIndex_(headers, 'staff_id');
  const ymIdx = findHeaderIndex_(headers, 'target_year_month');
  const dIdx = findHeaderIndex_(headers, 'date');
  if (sIdx === -1 || ymIdx === -1 || dIdx === -1) {
    return { success: false, error: '希望休申請シートの構造が不正です' };
  }
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][sIdx] !== staffId) continue;
    if (formatYearMonthValue_(data[i][ymIdx]) !== targetYearMonth) continue;
    if (formatDateOnly_(data[i][dIdx]) !== date) continue;
    rowIndex = i + 1;
    break;
  }
  if (rowIndex === -1) return { success: false, error: '対象日が見つかりません' };

  setCellByColumnName_(sheet, rowIndex, headers, 'status', status);
  setCellByColumnName_(sheet, rowIndex, headers, 'reviewed_at', new Date().toISOString());
  setCellByColumnName_(sheet, rowIndex, headers, 'reviewed_by', reviewedBy);
  setCellByColumnName_(sheet, rowIndex, headers, 'rejection_reason', status === 'rejected' ? rejectionReason : '');

  // スタッフへメール通知
  try {
    const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
    const staff = sheetToObjects(staffSheet).find(function (s) { return s.staff_id === staffId; });
    if (staff && staff.email) {
      const verb = status === 'approved' ? '承認' : '却下';
      const subject = '【希望休】' + date + ' の希望が ' + verb + ' されました';
      let bodyText = staff.name + 'さん\n\n' + date + ' の希望休が ' + verb + ' されました。\n';
      if (status === 'rejected') bodyText += '\n却下理由: ' + rejectionReason + '\n';
      safeSendEmail_(staff.email, subject, bodyText);
    }
  } catch (e) {
    Logger.log('notify review shift day failed: ' + (e && e.message));
  }

  return { success: true };
}

/**
 * 旧 (JSON) 形式のままになっている 希望休申請 シートを、新しい行ベース形式に
 * 変換する。1 行に複数日を JSON で持っていた行を、1 日 = 1 行に展開する。
 * idempotent: 既に行ベースなら何もしない。
 * 戻り値: { converted: bool, rowsCreated: number }
 */
function ensureShiftRequestsRowBased_(sheet) {
  if (!sheet) return { converted: false, rowsCreated: 0 };
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return { converted: false, rowsCreated: 0 };
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const djIdx = findHeaderIndex_(headers, 'days_json');
  // days_json 列が無ければ既に新形式
  if (djIdx === -1) return { converted: false, rowsCreated: 0 };

  const lastRow = sheet.getLastRow();
  let oldRows = [];
  if (lastRow >= 2) {
    oldRows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  }
  const sIdx = findHeaderIndex_(headers, 'staff_id');
  const snIdx = findHeaderIndex_(headers, 'staff_name');
  const ymIdx = findHeaderIndex_(headers, 'target_year_month');
  const rmIdx = findHeaderIndex_(headers, 'remarks');
  const subIdx = findHeaderIndex_(headers, 'submitted_at');

  // 各既存行を 1 日 = 1 行へ展開
  const newRecords = [];
  oldRows.forEach(function (row) {
    const days = normalizeOffDays_(safeJsonParse_(row[djIdx]));
    if (!days || days.length === 0) return;
    const staffId = sIdx !== -1 ? String(row[sIdx] || '') : '';
    const staffName = snIdx !== -1 ? String(row[snIdx] || '') : '';
    const ym = ymIdx !== -1 ? formatYearMonthValue_(row[ymIdx]) : '';
    const remarks = rmIdx !== -1 ? String(row[rmIdx] || '') : '';
    const submittedAt = subIdx !== -1 ? toIsoString_(row[subIdx]) : '';
    days.forEach(function (d) {
      newRecords.push({
        id: 'SR' + Date.now() + Math.random().toString(36).slice(2, 6),
        staff_id: staffId,
        staff_name: staffName,
        target_year_month: ym,
        date: d.date,
        status: d.status || 'pending',
        rejection_reason: d.rejectionReason || '',
        reviewed_at: d.reviewedAt || '',
        reviewed_by: d.reviewedBy || '',
        submitted_at: submittedAt,
        remarks: remarks,
      });
    });
  });

  // 新スキーマ
  const newSchema = ['id', 'staff_id', 'staff_name', 'target_year_month', 'date',
    'status', 'rejection_reason', 'reviewed_at', 'reviewed_by', 'submitted_at', 'remarks'];
  const newLabels = localizeHeaders_(newSchema);

  // 書込全データをメモリで構築（ここまでで失敗すれば既存シートは無傷）
  const valuesRows = newRecords.map(function (r) {
    return newSchema.map(function (key) {
      if (ENUM_COLUMNS[key]) return localizeEnumValue_(r[key]);
      return r[key] != null ? r[key] : '';
    });
  });

  // 列数を先に確保
  if (sheet.getMaxColumns() < newSchema.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), newSchema.length - sheet.getMaxColumns());
  }
  // 全行を一気にクリア → ヘッダー + データを 1 回の setValues で確定
  sheet.getRange(1, 1, Math.max(1, lastRow), Math.max(lastCol, newSchema.length)).clearContent();
  const allRows = [newLabels].concat(valuesRows);
  sheet.getRange(1, 1, allRows.length, newSchema.length).setValues(allRows);

  return { converted: true, rowsCreated: newRecords.length };
}
