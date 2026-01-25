/**
 * PDF Generator for Salary Slips
 * Generates Japanese salary slip PDFs using Google Docs
 */

/**
 * Generate a salary slip PDF for a specific staff member
 * @param {string} staffId - Staff ID
 * @param {number} year - Year
 * @param {number} month - Month
 * @returns {Blob} PDF blob
 */
function generateSalaryPdf(staffId, year, month) {
  // Get salary data
  const salarySheet = getSalarySheet(year, month);
  const salaryData = sheetToObjects(salarySheet);
  const salary = salaryData.find(s => s.staff_id === staffId);

  if (!salary) {
    throw new Error('Salary record not found');
  }

  // Get staff details
  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staffData = sheetToObjects(staffSheet);
  const staff = staffData.find(s => s.staff_id === staffId);

  if (!staff) {
    throw new Error('Staff not found');
  }

  // Get attendance summary
  const attendanceSheet = getAttendanceSheet(year, month);
  const attendanceData = sheetToObjects(attendanceSheet).filter(a => a.staff_id === staffId);

  const workDays = attendanceData.filter(a => a.work_minutes > 0).length;
  const totalLateMinutes = attendanceData.reduce((sum, a) => sum + (a.late_minutes || 0), 0);
  const totalEarlyLeaveMinutes = attendanceData.reduce((sum, a) => sum + (a.early_leave_minutes || 0), 0);

  // Create HTML content for the PDF
  const html = createSalarySlipHtml(salary, staff, {
    year,
    month,
    workDays,
    totalWorkHours: salary.total_work_hours,
    overtimeHours: salary.overtime_hours,
    nightHours: salary.night_hours || 0,
    holidayHours: salary.holiday_hours || 0,
    lateMinutes: totalLateMinutes,
    earlyLeaveMinutes: totalEarlyLeaveMinutes,
    paidLeaveDays: 0 // Would need to calculate from paid leave records
  });

  // Create a temporary Google Doc
  const tempDoc = DocumentApp.create(`給与明細_${staff.name}_${year}年${month}月分`);
  const body = tempDoc.getBody();

  // Parse and add content to the doc
  body.setText(createSalarySlipText(salary, staff, {
    year,
    month,
    workDays,
    totalWorkHours: salary.total_work_hours,
    overtimeHours: salary.overtime_hours,
    nightHours: salary.night_hours || 0,
    holidayHours: salary.holiday_hours || 0,
    lateMinutes: totalLateMinutes,
    earlyLeaveMinutes: totalEarlyLeaveMinutes,
    paidLeaveDays: 0
  }));

  tempDoc.saveAndClose();

  // Convert to PDF
  const pdfBlob = DriveApp.getFileById(tempDoc.getId()).getAs('application/pdf');
  pdfBlob.setName(`給与明細_${staff.name}_${year}年${month}月分.pdf`);

  // Delete the temporary doc
  DriveApp.getFileById(tempDoc.getId()).setTrashed(true);

  return pdfBlob;
}

/**
 * Create plain text content for salary slip
 */
function createSalarySlipText(salary, staff, summary) {
  const formatCurrency = (amount) => `¥${(amount || 0).toLocaleString('ja-JP')}`;
  const formatHoursMinutes = (hours) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}時間${m}分`;
  };

  const lastDay = new Date(summary.year, summary.month, 0).getDate();
  const paymentDate = `${summary.year}年${summary.month + 1}月25日`;
  const today = new Date();
  const issueDate = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy年MM月dd日');

  return `
================================================================================
                           給 与 明 細 書
================================================================================

                                          KATEstageLASH
支給対象期間：${summary.year}年${summary.month}月1日 〜 ${summary.year}年${summary.month}月${lastDay}日
支 払 日：${paymentDate}

氏名：${staff.name} 様

--------------------------------------------------------------------------------
【勤怠情報】
--------------------------------------------------------------------------------
  出勤日数        ：    ${String(summary.workDays).padStart(2, ' ')} 日
  総労働時間      ：   ${formatHoursMinutes(summary.totalWorkHours).padStart(10, ' ')}
  残業時間        ：   ${formatHoursMinutes(summary.overtimeHours).padStart(10, ' ')}
  深夜労働時間    ：   ${formatHoursMinutes(summary.nightHours).padStart(10, ' ')}
  休日出勤時間    ：   ${formatHoursMinutes(summary.holidayHours).padStart(10, ' ')}
  遅刻時間        ：    ${String(summary.lateMinutes).padStart(4, ' ')} 分
  早退時間        ：    ${String(summary.earlyLeaveMinutes).padStart(4, ' ')} 分
  有給取得日数    ：     ${summary.paidLeaveDays} 日

--------------------------------------------------------------------------------
【支給】                                              【控除】
--------------------------------------------------------------------------------
  基本給          ：${formatCurrency(salary.base_salary).padStart(12, ' ')}     健康保険料      ：${formatCurrency(salary.health_insurance).padStart(10, ' ')}
  残業手当        ：${formatCurrency(salary.overtime_pay).padStart(12, ' ')}     介護保険料      ：${formatCurrency(salary.nursing_insurance).padStart(10, ' ')}
  深夜手当        ：${formatCurrency(salary.night_pay).padStart(12, ' ')}     厚生年金保険料  ：${formatCurrency(salary.pension).padStart(10, ' ')}
  休日出勤手当    ：${formatCurrency(salary.holiday_pay).padStart(12, ' ')}     雇用保険料      ：${formatCurrency(salary.employment_insurance).padStart(10, ' ')}
  交通費          ：${formatCurrency(salary.transportation).padStart(12, ' ')}     所得税          ：${formatCurrency(salary.income_tax).padStart(10, ' ')}
  インセンティブ  ：${formatCurrency(salary.incentive).padStart(12, ' ')}     住民税          ：${formatCurrency(salary.resident_tax).padStart(10, ' ')}
                                    遅刻控除        ：${formatCurrency(salary.late_deduction).padStart(10, ' ')}
                                    早退控除        ：${formatCurrency(salary.early_leave_deduction).padStart(10, ' ')}
  --------------------------------   --------------------------------
  支給合計        ：${formatCurrency(salary.gross_pay).padStart(12, ' ')}     控除合計        ：${formatCurrency(salary.total_deduction).padStart(10, ' ')}

================================================================================
                     差 引 支 給 額 ：  ${formatCurrency(salary.net_pay).padStart(12, ' ')}
================================================================================

                                                発行日：${issueDate}
                                                KATEstageLASH
`.trim();
}

/**
 * Create HTML content for salary slip (alternative approach)
 */
function createSalarySlipHtml(salary, staff, summary) {
  const formatCurrency = (amount) => `¥${(amount || 0).toLocaleString('ja-JP')}`;

  return `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'Hiragino Sans', 'Yu Gothic', 'Meiryo', sans-serif;
      font-size: 12px;
      line-height: 1.5;
      padding: 20mm;
    }
    h1 {
      text-align: center;
      border-top: 2px solid #000;
      border-bottom: 2px solid #000;
      padding: 10px 0;
      margin-bottom: 20px;
    }
    .header {
      text-align: right;
      margin-bottom: 20px;
    }
    .info {
      margin-bottom: 20px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th, td {
      padding: 8px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    .amount {
      text-align: right;
    }
    .total {
      font-weight: bold;
      font-size: 14px;
      text-align: center;
      border: 2px solid #000;
      padding: 15px;
      margin-top: 20px;
    }
    .footer {
      text-align: right;
      margin-top: 30px;
    }
  </style>
</head>
<body>
  <h1>給 与 明 細 書</h1>

  <div class="header">
    <p>KATEstageLASH</p>
    <p>支給対象期間：${summary.year}年${summary.month}月1日 〜 ${summary.year}年${summary.month}月末日</p>
    <p>支払日：${summary.year}年${summary.month + 1}月25日</p>
  </div>

  <div class="info">
    <p><strong>氏名：${staff.name} 様</strong></p>
  </div>

  <h3>【勤怠情報】</h3>
  <table>
    <tr><td>出勤日数</td><td class="amount">${summary.workDays} 日</td></tr>
    <tr><td>総労働時間</td><td class="amount">${Math.floor(summary.totalWorkHours)} 時間 ${Math.round((summary.totalWorkHours % 1) * 60)} 分</td></tr>
    <tr><td>残業時間</td><td class="amount">${Math.floor(summary.overtimeHours)} 時間 ${Math.round((summary.overtimeHours % 1) * 60)} 分</td></tr>
  </table>

  <div style="display: flex; gap: 20px;">
    <div style="flex: 1;">
      <h3>【支給】</h3>
      <table>
        <tr><td>基本給</td><td class="amount">${formatCurrency(salary.base_salary)}</td></tr>
        <tr><td>残業手当</td><td class="amount">${formatCurrency(salary.overtime_pay)}</td></tr>
        <tr><td>深夜手当</td><td class="amount">${formatCurrency(salary.night_pay)}</td></tr>
        <tr><td>休日出勤手当</td><td class="amount">${formatCurrency(salary.holiday_pay)}</td></tr>
        <tr><td>交通費</td><td class="amount">${formatCurrency(salary.transportation)}</td></tr>
        <tr><td>インセンティブ</td><td class="amount">${formatCurrency(salary.incentive)}</td></tr>
        <tr><th>支給合計</th><th class="amount">${formatCurrency(salary.gross_pay)}</th></tr>
      </table>
    </div>

    <div style="flex: 1;">
      <h3>【控除】</h3>
      <table>
        <tr><td>健康保険料</td><td class="amount">${formatCurrency(salary.health_insurance)}</td></tr>
        <tr><td>介護保険料</td><td class="amount">${formatCurrency(salary.nursing_insurance)}</td></tr>
        <tr><td>厚生年金保険料</td><td class="amount">${formatCurrency(salary.pension)}</td></tr>
        <tr><td>雇用保険料</td><td class="amount">${formatCurrency(salary.employment_insurance)}</td></tr>
        <tr><td>所得税</td><td class="amount">${formatCurrency(salary.income_tax)}</td></tr>
        <tr><td>住民税</td><td class="amount">${formatCurrency(salary.resident_tax)}</td></tr>
        <tr><td>遅刻控除</td><td class="amount">${formatCurrency(salary.late_deduction)}</td></tr>
        <tr><td>早退控除</td><td class="amount">${formatCurrency(salary.early_leave_deduction)}</td></tr>
        <tr><th>控除合計</th><th class="amount">${formatCurrency(salary.total_deduction)}</th></tr>
      </table>
    </div>
  </div>

  <div class="total">
    差引支給額：${formatCurrency(salary.net_pay)}
  </div>

  <div class="footer">
    <p>発行日：${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy年MM月dd日')}</p>
    <p>KATEstageLASH</p>
  </div>
</body>
</html>
  `;
}

/**
 * Handle salary PDF request
 */
function handleSalaryPdfRequest(params) {
  const { staffId, year, month } = params;

  if (!staffId || !year || !month) {
    return { success: false, error: 'Missing required parameters' };
  }

  try {
    const pdfBlob = generateSalaryPdf(staffId, parseInt(year), parseInt(month));

    return {
      success: true,
      data: {
        name: pdfBlob.getName(),
        contentType: pdfBlob.getContentType(),
        bytes: Utilities.base64Encode(pdfBlob.getBytes())
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Generate all salary PDFs for a month and return as ZIP
 */
function generateAllSalaryPdfs(year, month) {
  const staffSheet = getOrCreateSheet(SHEETS.STAFF_MASTER);
  const staffData = sheetToObjects(staffSheet).filter(s => s.status === 'active');

  const blobs = [];

  for (const staff of staffData) {
    try {
      const pdfBlob = generateSalaryPdf(staff.staff_id, year, month);
      blobs.push(pdfBlob);
    } catch (e) {
      Logger.log(`Error generating PDF for ${staff.name}: ${e.message}`);
    }
  }

  // Create ZIP
  const zipBlob = Utilities.zip(blobs, `給与明細_${year}年${month}月分.zip`);

  return zipBlob;
}
