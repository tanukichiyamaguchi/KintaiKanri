import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Save,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  Loader2,
  CalendarDays,
  Clock as ClockIcon,
  Timer,
  TrendingUp,
  Info,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { bulkAttendanceApi, staffApi } from '../../api';
import type { BulkAttendanceRow } from '../../types';
import { Header, Loading, Modal } from '../../components/common';
import { formatLocalDate } from '../../utils/calculations';

/**
 * 労働時間に応じた法定休憩時間を自動計算
 * - 6時間超: 45分
 * - 8時間超: 60分
 * - 6時間以下: 0分
 */
function calcAutoBreak(workMinutesBeforeBreak: number): number {
  if (workMinutesBeforeBreak > 8 * 60) return 60;
  if (workMinutesBeforeBreak > 6 * 60) return 45;
  return 0;
}

/**
 * 出勤〜退勤の総時間（分）を計算
 */
function calcGrossMinutes(clockIn: string, clockOut: string): number {
  if (!clockIn || !clockOut) return 0;
  const [inH, inM] = clockIn.split(':').map(Number);
  const [outH, outM] = clockOut.split(':').map(Number);
  return (outH * 60 + outM) - (inH * 60 + inM);
}

/** 1日8時間（480分）を超えた分が残業 */
const DAILY_STANDARD_MINUTES = 8 * 60;

export function BulkAttendanceEntry() {
  const navigate = useNavigate();
  const { staff, isAuthenticated, isAdmin } = useAuth();

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [rows, setRows] = useState<BulkAttendanceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Admin mode: staff selector
  const [staffList, setStaffList] = useState<{ staffId: string; name: string }[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');

  const currentStaffId = isAdmin ? selectedStaffId : staff?.staffId;

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  // Load staff list for admin
  useEffect(() => {
    if (!isAdmin) return;
    async function loadStaff() {
      const res = await staffApi.getList();
      if (res.success && res.data) {
        const active = res.data.filter(s => s.status === 'active');
        setStaffList(active);
        if (active.length > 0 && !selectedStaffId) {
          setSelectedStaffId(active[0].staffId);
        }
      }
    }
    loadStaff();
  }, [isAdmin, selectedStaffId]);

  // Generate empty rows for all days of the month
  const allDays = useMemo(() => {
    const days: string[] = [];
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    for (let i = 1; i <= lastDay; i++) {
      const date = new Date(selectedYear, selectedMonth - 1, i);
      days.push(formatLocalDate(date));
    }
    return days;
  }, [selectedYear, selectedMonth]);

  // Load existing data
  useEffect(() => {
    if (!currentStaffId) return;

    async function loadData() {
      setIsLoading(true);
      try {
        const response = await bulkAttendanceApi.get(currentStaffId!, selectedYear, selectedMonth);
        const existingRecords = response.success && response.data ? response.data : [];

        const newRows: BulkAttendanceRow[] = allDays.map(date => {
          const existing = existingRecords.find(r => r.date === date);
          const dateObj = new Date(date);
          const isHoliday = dateObj.getDay() === 0 || dateObj.getDay() === 6;

          if (existing && existing.clockIn && existing.clockOut) {
            const clockIn = existing.clockIn.includes('T')
              ? existing.clockIn.split('T')[1].slice(0, 5)
              : existing.clockIn;
            const clockOut = existing.clockOut.includes('T')
              ? existing.clockOut.split('T')[1].slice(0, 5)
              : existing.clockOut;

            const grossMinutes = calcGrossMinutes(clockIn, clockOut);
            const breakMinutes = existing.breakMinutes || calcAutoBreak(grossMinutes);
            const workMinutes = Math.max(0, grossMinutes - breakMinutes);
            const overtimeMinutes = Math.max(0, workMinutes - DAILY_STANDARD_MINUTES);

            return {
              date, clockIn, clockOut, breakMinutes, workMinutes,
              isHoliday, overtimeMinutes, overtimeReason: '', remarks: existing.remarks || '',
            };
          }

          return {
            date, clockIn: '', clockOut: '', breakMinutes: 0, workMinutes: 0,
            isHoliday, overtimeMinutes: 0, overtimeReason: '', remarks: '',
          };
        });

        setRows(newRows);
        setHasUnsavedChanges(false);
      } catch {
        setMessage({ type: 'error', text: '勤怠データの取得に失敗しました' });
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [currentStaffId, selectedYear, selectedMonth, allDays]);

  // Update a row and auto-recalculate
  const updateRow = useCallback((index: number, field: keyof BulkAttendanceRow, value: string | number | boolean) => {
    setRows(prev => {
      const newRows = [...prev];
      const row = { ...newRows[index] };

      if (field === 'clockIn' || field === 'clockOut') {
        (row as Record<string, unknown>)[field] = value;
        const grossMinutes = calcGrossMinutes(
          field === 'clockIn' ? (value as string) : row.clockIn,
          field === 'clockOut' ? (value as string) : row.clockOut
        );
        if (grossMinutes > 0) {
          const autoBreak = calcAutoBreak(grossMinutes);
          row.breakMinutes = autoBreak;
          row.workMinutes = Math.max(0, grossMinutes - autoBreak);
          row.overtimeMinutes = Math.max(0, row.workMinutes - DAILY_STANDARD_MINUTES);
        } else {
          row.breakMinutes = 0;
          row.workMinutes = 0;
          row.overtimeMinutes = 0;
        }
      } else if (field === 'breakMinutes') {
        row.breakMinutes = Number(value);
        const grossMinutes = calcGrossMinutes(row.clockIn, row.clockOut);
        row.workMinutes = Math.max(0, grossMinutes - row.breakMinutes);
        row.overtimeMinutes = Math.max(0, row.workMinutes - DAILY_STANDARD_MINUTES);
      } else {
        (row as Record<string, unknown>)[field] = value;
      }

      newRows[index] = row;
      return newRows;
    });
    setHasUnsavedChanges(true);
  }, []);

  // Validate before save
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    rows.forEach(row => {
      if (row.overtimeMinutes > 0 && !row.overtimeReason.trim()) {
        const dateObj = new Date(row.date);
        errors.push(`${dateObj.getMonth() + 1}/${dateObj.getDate()} - 残業理由が未入力です`);
      }
    });
    return errors;
  }, [rows]);

  const overtimeRowCount = rows.filter(r => r.overtimeMinutes > 0).length;
  const filledRowCount = rows.filter(r => r.clockIn && r.clockOut).length;
  const totalWorkMinutes = rows.reduce((sum, r) => sum + r.workMinutes, 0);
  const totalOvertimeMinutes = rows.reduce((sum, r) => sum + r.overtimeMinutes, 0);
  const progressPercent = allDays.length > 0 ? Math.round((filledRowCount / allDays.length) * 100) : 0;

  // Save handler
  const handleSave = async () => {
    if (!currentStaffId) return;
    if (validationErrors.length > 0) {
      setMessage({ type: 'error', text: '残業がある日の残業理由を入力してください' });
      return;
    }

    setShowConfirmModal(false);
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await bulkAttendanceApi.save(currentStaffId, selectedYear, selectedMonth, rows);
      if (response.success) {
        setMessage({
          type: 'success',
          text: `${selectedYear}年${selectedMonth}月の勤怠を保存しました（${response.data?.saved || 0}件）`,
        });
        setHasUnsavedChanges(false);
      } else {
        setMessage({ type: 'error', text: response.error || '保存に失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: '保存に失敗しました' });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePreviousMonth = () => {
    if (selectedMonth === 1) {
      setSelectedYear(selectedYear - 1);
      setSelectedMonth(12);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedYear(selectedYear + 1);
      setSelectedMonth(1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    return `${date.getDate()}（${weekdays[date.getDay()]}）`;
  };

  const getDayClass = (dateStr: string): string => {
    const date = new Date(dateStr);
    if (date.getDay() === 0) return 'text-red-500 font-semibold';
    if (date.getDay() === 6) return 'text-blue-500 font-semibold';
    return 'text-secondary-800';
  };

  const formatMinutes = (minutes: number): string => {
    if (minutes <= 0) return '-';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}:${String(m).padStart(2, '0')}`;
  };

  const backLink = isAdmin ? '/admin/attendance' : '/mypage';
  const backLabel = isAdmin ? '勤怠管理へ戻る' : 'マイページへ戻る';

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-secondary-100">
      <Header title="勤怠一括入力" />

      <main className="max-w-7xl mx-auto p-4 sm:p-6">
        {/* Back Link */}
        <Link
          to={backLink}
          className="inline-flex items-center gap-1.5 text-secondary-500 hover:text-primary-600 transition-colors mb-5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">{backLabel}</span>
        </Link>

        {/* Message */}
        {message && (
          <div
            className={`flex items-center gap-3 px-5 py-4 rounded-xl mb-5 border ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <p className="text-sm font-medium">{message.text}</p>
          </div>
        )}

        {/* Summary Cards */}
        {!isLoading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
            {/* 入力進捗 */}
            <div className="card card-gold relative overflow-hidden p-4 sm:p-5">
              <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-primary-200/20 to-transparent rounded-full" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
                    <CalendarDays className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-xs font-medium text-secondary-500">入力進捗</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-secondary-800">{filledRowCount}</span>
                  <span className="text-sm text-secondary-400">/ {allDays.length}日</span>
                </div>
                {/* Progress bar */}
                <div className="mt-2 h-1.5 bg-secondary-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary-400 to-primary-600 rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>

            {/* 総労働時間 */}
            <div className="card p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                  <ClockIcon className="w-4 h-4 text-white" />
                </div>
                <span className="text-xs font-medium text-secondary-500">総労働時間</span>
              </div>
              <p className="text-2xl font-bold text-secondary-800">{formatMinutes(totalWorkMinutes)}</p>
            </div>

            {/* 残業日数 */}
            <div className={`card p-4 sm:p-5 ${overtimeRowCount > 0 ? 'border-amber-200 bg-amber-50/30' : ''}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  overtimeRowCount > 0
                    ? 'bg-gradient-to-br from-amber-400 to-amber-600'
                    : 'bg-gradient-to-br from-secondary-300 to-secondary-400'
                }`}>
                  <Timer className="w-4 h-4 text-white" />
                </div>
                <span className="text-xs font-medium text-secondary-500">残業日数</span>
              </div>
              <p className={`text-2xl font-bold ${overtimeRowCount > 0 ? 'text-amber-600' : 'text-secondary-800'}`}>
                {overtimeRowCount}<span className="text-sm ml-0.5">日</span>
              </p>
            </div>

            {/* 総残業時間 */}
            <div className={`card p-4 sm:p-5 ${totalOvertimeMinutes > 0 ? 'border-amber-200 bg-amber-50/30' : ''}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  totalOvertimeMinutes > 0
                    ? 'bg-gradient-to-br from-orange-400 to-orange-600'
                    : 'bg-gradient-to-br from-secondary-300 to-secondary-400'
                }`}>
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <span className="text-xs font-medium text-secondary-500">総残業時間</span>
              </div>
              <p className={`text-2xl font-bold ${totalOvertimeMinutes > 0 ? 'text-orange-600' : 'text-secondary-800'}`}>
                {formatMinutes(totalOvertimeMinutes)}
              </p>
            </div>
          </div>
        )}

        {/* Controls Bar */}
        <div className="card card-gold gold-border mb-5 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-4">
            {/* Admin: Staff Selector */}
            {isAdmin && (
              <div className="flex-1 min-w-[200px]">
                <label className="label">スタッフ</label>
                <select
                  value={selectedStaffId}
                  onChange={e => setSelectedStaffId(e.target.value)}
                  className="input"
                >
                  {staffList.map(s => (
                    <option key={s.staffId} value={s.staffId}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Month Selector */}
            <div className="flex items-center gap-1">
              <button
                onClick={handlePreviousMonth}
                className="p-2.5 rounded-xl hover:bg-primary-50 transition-colors border border-transparent hover:border-primary-200"
              >
                <ChevronLeft className="w-5 h-5 text-secondary-600" />
              </button>
              <span className="text-lg font-bold min-w-[140px] text-center text-secondary-800">
                {selectedYear}年{selectedMonth}月
              </span>
              <button
                onClick={handleNextMonth}
                className="p-2.5 rounded-xl hover:bg-primary-50 transition-colors border border-transparent hover:border-primary-200"
              >
                <ChevronRight className="w-5 h-5 text-secondary-600" />
              </button>
            </div>

            {/* Save Button */}
            <div className="ml-auto flex items-center gap-3">
              {hasUnsavedChanges && (
                <span className="text-sm text-amber-600 flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  未保存
                </span>
              )}
              <button
                onClick={() => setShowConfirmModal(true)}
                disabled={isSaving || !hasUnsavedChanges || !currentStaffId}
                className="btn btn-primary flex items-center gap-2"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                一括保存
              </button>
            </div>
          </div>
        </div>

        {/* Guide - collapsible feel */}
        <div className="bg-primary-50/50 border border-primary-200/50 rounded-2xl px-5 py-3.5 mb-5">
          <div className="flex items-start gap-3 text-sm">
            <div className="w-6 h-6 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Info className="w-3.5 h-3.5 text-primary-600" />
            </div>
            <div className="text-secondary-600 space-y-1">
              <p>出退勤を入力すると<strong className="text-secondary-700">休憩時間が自動計算</strong>されます（6h超→45分 / 8h超→60分）。休憩は手動変更可。</p>
              <p>1日8時間超の勤務は<strong className="text-amber-600">残業</strong>として表示され、<strong className="text-amber-600">理由の入力が必須</strong>です。</p>
            </div>
          </div>
        </div>

        {/* Spreadsheet Table */}
        <div className="card overflow-hidden p-0">
          {isLoading ? (
            <div className="p-10">
              <Loading message="読み込み中..." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px]">
                <thead>
                  <tr className="bg-gradient-to-r from-secondary-800 to-secondary-900 text-white">
                    <th className="px-3 py-3 text-left text-xs font-semibold tracking-wider w-20">日付</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold tracking-wider w-[108px]">出勤</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold tracking-wider w-[108px]">退勤</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold tracking-wider w-20">
                      休憩<span className="font-normal opacity-70">（分）</span>
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-semibold tracking-wider w-20">実働</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold tracking-wider w-20">残業</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold tracking-wider">
                      残業理由<span className="font-normal opacity-70 ml-1">※残業時 必須</span>
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold tracking-wider w-[120px]">備考</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const dateObj = new Date(row.date);
                    const isSunday = dateObj.getDay() === 0;
                    const isSaturday = dateObj.getDay() === 6;
                    const isWeekend = isSunday || isSaturday;
                    const hasOvertime = row.overtimeMinutes > 0;
                    const missingReason = hasOvertime && !row.overtimeReason.trim();
                    const hasFilled = row.clockIn && row.clockOut;

                    return (
                      <tr
                        key={row.date}
                        className={`
                          border-b border-secondary-100 last:border-0
                          transition-colors duration-150
                          ${missingReason ? 'bg-red-50/60' : hasOvertime ? 'bg-amber-50/40' : isWeekend ? 'bg-secondary-50/60' : 'bg-white'}
                          ${hasFilled ? '' : 'opacity-80'}
                          hover:bg-primary-50/30
                        `}
                      >
                        {/* 日付 */}
                        <td className={`px-3 py-2 text-sm whitespace-nowrap ${getDayClass(row.date)}`}>
                          {isSunday && <span className="inline-block w-1 h-1 rounded-full bg-red-400 mr-1 mb-0.5" />}
                          {formatDate(row.date)}
                        </td>

                        {/* 出勤 */}
                        <td className="px-2 py-1.5">
                          <input
                            type="time"
                            value={row.clockIn}
                            onChange={e => updateRow(index, 'clockIn', e.target.value)}
                            className="w-full py-1.5 px-2.5 text-sm border border-secondary-200 rounded-lg
                              focus:border-primary-400 focus:ring-2 focus:ring-primary-200 focus:outline-none
                              hover:border-secondary-300 transition-all bg-white"
                          />
                        </td>

                        {/* 退勤 */}
                        <td className="px-2 py-1.5">
                          <input
                            type="time"
                            value={row.clockOut}
                            onChange={e => updateRow(index, 'clockOut', e.target.value)}
                            className="w-full py-1.5 px-2.5 text-sm border border-secondary-200 rounded-lg
                              focus:border-primary-400 focus:ring-2 focus:ring-primary-200 focus:outline-none
                              hover:border-secondary-300 transition-all bg-white"
                          />
                        </td>

                        {/* 休憩（分） */}
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            min={0}
                            max={480}
                            value={row.breakMinutes || ''}
                            onChange={e => updateRow(index, 'breakMinutes', e.target.value)}
                            disabled={!row.clockIn || !row.clockOut}
                            className="w-full py-1.5 px-2 text-sm text-center border border-secondary-200 rounded-lg
                              focus:border-primary-400 focus:ring-2 focus:ring-primary-200 focus:outline-none
                              hover:border-secondary-300 transition-all bg-white
                              disabled:bg-secondary-50 disabled:text-secondary-300 disabled:border-secondary-100"
                            placeholder="-"
                          />
                        </td>

                        {/* 実働 */}
                        <td className="px-3 py-1.5 text-center">
                          <span className={`text-sm font-mono ${hasFilled ? 'font-semibold text-secondary-800' : 'text-secondary-300'}`}>
                            {formatMinutes(row.workMinutes)}
                          </span>
                        </td>

                        {/* 残業 */}
                        <td className="px-3 py-1.5 text-center">
                          {hasOvertime ? (
                            <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="w-3 h-3" />
                              {formatMinutes(row.overtimeMinutes)}
                            </span>
                          ) : (
                            <span className="text-sm text-secondary-300">-</span>
                          )}
                        </td>

                        {/* 残業理由 */}
                        <td className="px-2 py-1.5">
                          {hasOvertime ? (
                            <input
                              type="text"
                              value={row.overtimeReason}
                              onChange={e => updateRow(index, 'overtimeReason', e.target.value)}
                              className={`w-full py-1.5 px-2.5 text-sm border rounded-lg focus:outline-none transition-all ${
                                missingReason
                                  ? 'border-red-400 bg-red-50 focus:ring-2 focus:ring-red-200 placeholder:text-red-300'
                                  : 'border-secondary-200 bg-white focus:border-primary-400 focus:ring-2 focus:ring-primary-200'
                              }`}
                              placeholder={missingReason ? '必須: 残業理由を入力' : '残業理由'}
                            />
                          ) : (
                            <span className="text-secondary-200 text-sm px-2">-</span>
                          )}
                        </td>

                        {/* 備考 */}
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={row.remarks}
                            onChange={e => updateRow(index, 'remarks', e.target.value)}
                            className="w-full py-1.5 px-2.5 text-sm border border-secondary-200 rounded-lg
                              focus:border-primary-400 focus:ring-2 focus:ring-primary-200 focus:outline-none
                              hover:border-secondary-300 transition-all bg-white"
                            placeholder=""
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Validation Errors */}
        {!isLoading && validationErrors.length > 0 && (
          <div className="mt-4 p-5 bg-red-50 border border-red-200 rounded-2xl">
            <p className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-2">
              <AlertCircle className="w-4.5 h-4.5" />
              保存前に以下を修正してください
            </p>
            <ul className="space-y-1.5">
              {validationErrors.map((err, i) => (
                <li key={i} className="text-sm text-red-600 pl-7 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                  {err}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Bottom save button */}
        {!isLoading && (
          <div className="flex justify-end mt-5 mb-10">
            <button
              onClick={() => setShowConfirmModal(true)}
              disabled={isSaving || !hasUnsavedChanges || !currentStaffId}
              className="btn btn-primary btn-large flex items-center gap-2.5 px-10"
            >
              {isSaving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Save className="w-5 h-5" />
              )}
              一括保存
            </button>
          </div>
        )}
      </main>

      {/* Confirm Save Modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="勤怠データの保存"
        size="md"
      >
        <div className="space-y-5 py-2">
          <p className="text-secondary-600">
            <strong className="text-secondary-800">{selectedYear}年{selectedMonth}月</strong>の勤怠データを保存します。
          </p>

          <div className="bg-secondary-50 rounded-xl p-5 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-secondary-500 flex items-center gap-2">
                <CalendarDays className="w-4 h-4" />入力済み日数
              </span>
              <span className="font-bold text-secondary-800">{filledRowCount}日</span>
            </div>
            <div className="h-px bg-secondary-200" />
            <div className="flex justify-between items-center">
              <span className="text-sm text-secondary-500 flex items-center gap-2">
                <ClockIcon className="w-4 h-4" />総労働時間
              </span>
              <span className="font-bold text-secondary-800">{formatMinutes(totalWorkMinutes)}</span>
            </div>
            {overtimeRowCount > 0 && (
              <>
                <div className="h-px bg-secondary-200" />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-amber-600 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />残業申請
                  </span>
                  <span className="font-bold text-amber-600">{overtimeRowCount}件</span>
                </div>
              </>
            )}
          </div>

          {overtimeRowCount > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
              <p className="text-sm text-amber-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                残業のある<strong>{overtimeRowCount}日</strong>分の残業申請が同時に提出されます
              </p>
            </div>
          )}

          {validationErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4">
              <p className="text-sm text-red-700 font-medium">残業理由が未入力の日があります。保存できません。</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setShowConfirmModal(false)}
              className="btn btn-secondary flex-1"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={validationErrors.length > 0 || isSaving}
              className="btn btn-primary flex-1"
            >
              保存する
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
