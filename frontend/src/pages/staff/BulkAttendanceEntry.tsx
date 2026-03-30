import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Save,
  AlertCircle,
  CheckCircle,
  Clock,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { attendanceApi } from '../../api';
import type { AttendanceRecord, BulkAttendanceEntry as BulkEntry } from '../../types';
import { Header, Loading, Modal } from '../../components/common';
import { formatLocalDate } from '../../utils/calculations';

// 労働基準法に基づく自動休憩時間計算
function calculateAutoBreakMinutes(workMinutesBeforeBreak: number): number {
  if (workMinutesBeforeBreak > 480) return 60; // 8時間超 → 60分
  if (workMinutesBeforeBreak > 360) return 45; // 6時間超 → 45分
  return 0;
}

// 所定労働時間(8時間)を超えた分を残業とみなす
const STANDARD_WORK_MINUTES = 480;

function getDaysInMonth(year: number, month: number): string[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const days: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    days.push(formatLocalDate(date));
  }
  return days;
}

function getDayOfWeek(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
}

function isSunday(dateStr: string): boolean {
  return new Date(dateStr + 'T00:00:00').getDay() === 0;
}

function isSaturday(dateStr: string): boolean {
  return new Date(dateStr + 'T00:00:00').getDay() === 6;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function computeWorkMinutes(clockIn: string, clockOut: string, breakMinutes: number): number {
  if (!clockIn || !clockOut) return 0;
  const [inH, inM] = clockIn.split(':').map(Number);
  const [outH, outM] = clockOut.split(':').map(Number);
  const total = (outH * 60 + outM) - (inH * 60 + inM) - breakMinutes;
  return Math.max(0, total);
}

function computeGrossMinutes(clockIn: string, clockOut: string): number {
  if (!clockIn || !clockOut) return 0;
  const [inH, inM] = clockIn.split(':').map(Number);
  const [outH, outM] = clockOut.split(':').map(Number);
  return Math.max(0, (outH * 60 + outM) - (inH * 60 + inM));
}

export function BulkAttendanceEntry() {
  const navigate = useNavigate();
  const { staff, isAuthenticated } = useAuth();

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [entries, setEntries] = useState<Record<string, BulkEntry>>({});
  const [existingRecords, setExistingRecords] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Overtime request modal
  const [overtimeModal, setOvertimeModal] = useState<{ date: string } | null>(null);
  const [overtimeReason, setOvertimeReason] = useState('');

  useEffect(() => {
    if (!isAuthenticated || !staff) {
      navigate('/');
    }
  }, [isAuthenticated, staff, navigate]);

  // Fetch existing records for the month
  useEffect(() => {
    if (!staff) return;

    async function fetchRecords() {
      setIsLoading(true);
      try {
        const response = await attendanceApi.getMonthly(staff!.staffId, selectedYear, selectedMonth);
        if (response.success && response.data) {
          setExistingRecords(response.data);
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    }

    fetchRecords();
    setEntries({});
    setMessage(null);
  }, [staff, selectedYear, selectedMonth]);

  const initEntry = useCallback((dateStr: string): BulkEntry => {
    const existing = existingRecords.find(r => r.date === dateStr);
    if (existing) {
      const clockIn = existing.clockIn ? existing.clockIn.substring(11, 16) : '';
      const clockOut = existing.clockOut ? existing.clockOut.substring(11, 16) : '';
      const grossMin = computeGrossMinutes(clockIn, clockOut);
      const autoBreak = calculateAutoBreakMinutes(grossMin);
      return {
        date: dateStr,
        clockIn,
        clockOut,
        breakMinutes: existing.breakMinutes || autoBreak,
        workMinutes: existing.workMinutes,
        hasOvertime: existing.workMinutes > STANDARD_WORK_MINUTES,
        overtimeMinutes: Math.max(0, existing.workMinutes - STANDARD_WORK_MINUTES),
        overtimeReason: existing.remarks || '',
        remarks: existing.remarks,
      };
    }
    return {
      date: dateStr,
      clockIn: '',
      clockOut: '',
      breakMinutes: 0,
      workMinutes: 0,
      hasOvertime: false,
      overtimeMinutes: 0,
      overtimeReason: '',
    };
  }, [existingRecords]);

  const getEntry = useCallback((dateStr: string): BulkEntry => {
    return entries[dateStr] || initEntry(dateStr);
  }, [entries, initEntry]);

  const updateEntry = useCallback((dateStr: string, updates: Partial<BulkEntry>) => {
    setEntries(prev => {
      const current = prev[dateStr] || initEntry(dateStr);
      const updated = { ...current, ...updates };

      // Auto-calculate break and work minutes when times change
      if (updates.clockIn !== undefined || updates.clockOut !== undefined) {
        const grossMin = computeGrossMinutes(updated.clockIn, updated.clockOut);
        if (!updates.breakMinutes && updates.breakMinutes !== 0) {
          updated.breakMinutes = calculateAutoBreakMinutes(grossMin);
        }
        updated.workMinutes = computeWorkMinutes(updated.clockIn, updated.clockOut, updated.breakMinutes);
        updated.hasOvertime = updated.workMinutes > STANDARD_WORK_MINUTES;
        updated.overtimeMinutes = Math.max(0, updated.workMinutes - STANDARD_WORK_MINUTES);
      }

      // Recalculate when break is manually changed
      if (updates.breakMinutes !== undefined) {
        updated.workMinutes = computeWorkMinutes(updated.clockIn, updated.clockOut, updated.breakMinutes);
        updated.hasOvertime = updated.workMinutes > STANDARD_WORK_MINUTES;
        updated.overtimeMinutes = Math.max(0, updated.workMinutes - STANDARD_WORK_MINUTES);
      }

      return { ...prev, [dateStr]: updated };
    });
  }, [initEntry]);

  const clearEntry = useCallback((dateStr: string) => {
    setEntries(prev => {
      const updated = { ...prev };
      updated[dateStr] = {
        date: dateStr,
        clockIn: '',
        clockOut: '',
        breakMinutes: 0,
        workMinutes: 0,
        hasOvertime: false,
        overtimeMinutes: 0,
        overtimeReason: '',
      };
      return updated;
    });
  }, []);

  const handleOvertimeSubmit = () => {
    if (!overtimeModal || !overtimeReason.trim()) return;
    updateEntry(overtimeModal.date, { overtimeReason: overtimeReason.trim() });
    setOvertimeModal(null);
    setOvertimeReason('');
  };

  const handleSave = async () => {
    if (!staff) return;

    // Check all overtime entries have reasons
    const entriesWithOvertime = Object.values(entries).filter(
      e => e.hasOvertime && e.clockIn && e.clockOut && !e.overtimeReason
    );
    if (entriesWithOvertime.length > 0) {
      setMessage({
        type: 'error',
        text: `残業のある日（${entriesWithOvertime.map(e => formatDateShort(e.date)).join(', ')}）の残業理由を入力してください`,
      });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const toSave = Object.values(entries).filter(e => e.clockIn && e.clockOut);

      if (toSave.length === 0) {
        setMessage({ type: 'error', text: '保存するデータがありません' });
        setIsSaving(false);
        return;
      }

      // Save each entry
      const results = await Promise.all(
        toSave.map(async (entry) => {
          const dateStr = entry.date;
          const clockIn = `${dateStr}T${entry.clockIn}:00`;
          const clockOut = `${dateStr}T${entry.clockOut}:00`;

          const updates = [
            attendanceApi.update(dateStr, staff.staffId, 'clockIn', clockIn),
            attendanceApi.update(dateStr, staff.staffId, 'clockOut', clockOut),
            attendanceApi.update(dateStr, staff.staffId, 'breakMinutes', entry.breakMinutes),
            attendanceApi.update(dateStr, staff.staffId, 'workMinutes', entry.workMinutes),
          ];

          if (entry.hasOvertime && entry.overtimeReason) {
            updates.push(
              attendanceApi.update(dateStr, staff.staffId, 'remarks', `【残業申請】${entry.overtimeReason}`)
            );
          }

          return Promise.all(updates);
        })
      );

      // Also submit overtime requests
      const overtimeEntries = toSave.filter(e => e.hasOvertime && e.overtimeReason);
      if (overtimeEntries.length > 0) {
        await Promise.all(
          overtimeEntries.map(entry =>
            attendanceApi.update(entry.date, staff.staffId, 'overtimeRequest', JSON.stringify({
              reason: entry.overtimeReason,
              minutes: entry.overtimeMinutes,
              status: 'pending',
            }))
          )
        );
      }

      const savedCount = results.length;
      const overtimeCount = overtimeEntries.length;
      let msg = `${savedCount}日分の勤怠データを保存しました`;
      if (overtimeCount > 0) {
        msg += `（残業申請: ${overtimeCount}件）`;
      }
      setMessage({ type: 'success', text: msg });

      // Refresh data
      const response = await attendanceApi.getMonthly(staff.staffId, selectedYear, selectedMonth);
      if (response.success && response.data) {
        setExistingRecords(response.data);
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

  const days = getDaysInMonth(selectedYear, selectedMonth);
  const today = formatLocalDate(new Date());

  // Count modified entries
  const modifiedCount = Object.values(entries).filter(e => e.clockIn && e.clockOut).length;
  const overtimeCount = Object.values(entries).filter(e => e.hasOvertime && e.clockIn && e.clockOut).length;
  const missingReasonCount = Object.values(entries).filter(
    e => e.hasOvertime && e.clockIn && e.clockOut && !e.overtimeReason
  ).length;

  const formatMinutes = (min: number): string => {
    if (min <= 0) return '-';
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return `${m}分`;
    if (m === 0) return `${h}時間`;
    return `${h}時間${m}分`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="一括勤怠入力" />

      <main className="max-w-4xl mx-auto p-4">
        {/* Back Link */}
        <Link
          to="/mypage"
          className="inline-flex items-center gap-1 text-gray-600 hover:text-primary-600 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          マイページへ戻る
        </Link>

        {/* Message */}
        {message && (
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-lg mb-4 ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <p className="text-sm">{message.text}</p>
          </div>
        )}

        {/* Month Selector + Stats */}
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={handlePreviousMonth}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h2 className="text-lg font-semibold">
              {selectedYear}年{selectedMonth}月
            </h2>
            <button
              onClick={handleNextMonth}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* Stats bar */}
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span className="text-gray-600">入力済: <strong>{modifiedCount}日</strong></span>
            </div>
            {overtimeCount > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="text-gray-600">残業あり: <strong>{overtimeCount}日</strong></span>
              </div>
            )}
            {missingReasonCount > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="text-gray-600">理由未入力: <strong>{missingReasonCount}日</strong></span>
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 text-sm text-blue-700">
          <div className="flex items-start gap-2">
            <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium mb-1">一括入力について</p>
              <ul className="space-y-0.5 text-blue-600">
                <li>・休憩時間は労働時間に応じて自動計算されます（6h超→45分、8h超→60分）</li>
                <li>・休憩時間は手動で変更できます</li>
                <li>・8時間を超える勤務がある場合、残業申請（理由の入力）が必要です</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <Loading message="読み込み中..." />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-3 px-2 font-semibold text-gray-700 w-20">日付</th>
                  <th className="text-center py-3 px-2 font-semibold text-gray-700 w-28">出勤</th>
                  <th className="text-center py-3 px-2 font-semibold text-gray-700 w-28">退勤</th>
                  <th className="text-center py-3 px-2 font-semibold text-gray-700 w-24">休憩</th>
                  <th className="text-center py-3 px-2 font-semibold text-gray-700 w-24">実働</th>
                  <th className="text-center py-3 px-2 font-semibold text-gray-700 w-24">残業</th>
                  <th className="text-center py-3 px-2 font-semibold text-gray-700 w-16">操作</th>
                </tr>
              </thead>
              <tbody>
                {days.map(dateStr => {
                  const sunday = isSunday(dateStr);
                  const saturday = isSaturday(dateStr);
                  const isFuture = dateStr > today;
                  const entry = getEntry(dateStr);
                  const hasExisting = existingRecords.some(r => r.date === dateStr);
                  const isModified = !!entries[dateStr]?.clockIn;

                  const rowClass = sunday
                    ? 'bg-red-50/50'
                    : saturday
                    ? 'bg-blue-50/50'
                    : hasExisting && !isModified
                    ? 'bg-gray-50/50'
                    : isModified
                    ? 'bg-green-50/30'
                    : '';

                  return (
                    <tr
                      key={dateStr}
                      className={`border-b border-gray-100 ${rowClass} ${isFuture ? 'opacity-40' : ''}`}
                    >
                      {/* Date */}
                      <td className="py-2 px-2">
                        <span
                          className={`font-medium ${
                            sunday ? 'text-red-600' : saturday ? 'text-blue-600' : 'text-gray-800'
                          }`}
                        >
                          {new Date(dateStr + 'T00:00:00').getDate()}
                        </span>
                        <span
                          className={`ml-1 text-xs ${
                            sunday ? 'text-red-400' : saturday ? 'text-blue-400' : 'text-gray-400'
                          }`}
                        >
                          ({getDayOfWeek(dateStr)})
                        </span>
                      </td>

                      {/* Clock In */}
                      <td className="py-2 px-1 text-center">
                        <input
                          type="time"
                          value={entry.clockIn}
                          onChange={e => updateEntry(dateStr, { clockIn: e.target.value })}
                          disabled={isFuture}
                          className="w-full text-center border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:text-gray-400"
                        />
                      </td>

                      {/* Clock Out */}
                      <td className="py-2 px-1 text-center">
                        <input
                          type="time"
                          value={entry.clockOut}
                          onChange={e => updateEntry(dateStr, { clockOut: e.target.value })}
                          disabled={isFuture}
                          className="w-full text-center border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:text-gray-400"
                        />
                      </td>

                      {/* Break */}
                      <td className="py-2 px-1 text-center">
                        <input
                          type="number"
                          value={entry.clockIn && entry.clockOut ? entry.breakMinutes : ''}
                          onChange={e => updateEntry(dateStr, { breakMinutes: Math.max(0, Number(e.target.value)) })}
                          disabled={isFuture || !entry.clockIn || !entry.clockOut}
                          min={0}
                          className="w-full text-center border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:text-gray-400"
                          placeholder="-"
                        />
                      </td>

                      {/* Work Minutes */}
                      <td className="py-2 px-2 text-center">
                        <span className={`font-medium ${entry.workMinutes > 0 ? 'text-gray-800' : 'text-gray-400'}`}>
                          {entry.workMinutes > 0 ? formatMinutes(entry.workMinutes) : '-'}
                        </span>
                      </td>

                      {/* Overtime */}
                      <td className="py-2 px-2 text-center">
                        {entry.hasOvertime && entry.clockIn && entry.clockOut ? (
                          <button
                            onClick={() => {
                              setOvertimeReason(entry.overtimeReason);
                              setOvertimeModal({ date: dateStr });
                            }}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                              entry.overtimeReason
                                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                : 'bg-red-100 text-red-700 hover:bg-red-200 animate-pulse'
                            }`}
                          >
                            {entry.overtimeReason ? (
                              <>
                                <CheckCircle className="w-3 h-3" />
                                {formatMinutes(entry.overtimeMinutes)}
                              </>
                            ) : (
                              <>
                                <AlertTriangle className="w-3 h-3" />
                                要申請
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-2 text-center">
                        {(entry.clockIn || entry.clockOut) && !isFuture && (
                          <button
                            onClick={() => clearEntry(dateStr)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="クリア"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Save Button */}
        <div className="sticky bottom-0 bg-gray-50 pt-4 pb-6 mt-4">
          <button
            onClick={handleSave}
            disabled={isSaving || modifiedCount === 0}
            className="btn btn-primary w-full flex items-center justify-center gap-2 py-3 text-base disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                {modifiedCount > 0
                  ? `${modifiedCount}日分を保存する`
                  : '保存するデータがありません'}
              </>
            )}
          </button>
        </div>
      </main>

      {/* Overtime Reason Modal */}
      <Modal
        isOpen={!!overtimeModal}
        onClose={() => { setOvertimeModal(null); setOvertimeReason(''); }}
        title="残業申請"
        size="sm"
      >
        {overtimeModal && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm">
              <div className="flex items-center gap-2 text-amber-700 font-medium mb-1">
                <AlertTriangle className="w-4 h-4" />
                残業が発生しています
              </div>
              <p className="text-amber-600">
                {formatDateShort(overtimeModal.date)}（{getDayOfWeek(overtimeModal.date)}）
                ・残業時間: {formatMinutes(getEntry(overtimeModal.date).overtimeMinutes)}
              </p>
            </div>

            <div>
              <label className="label">残業理由 <span className="text-red-500">*</span></label>
              <textarea
                value={overtimeReason}
                onChange={e => setOvertimeReason(e.target.value)}
                rows={3}
                className="input resize-none"
                placeholder="例: 月末締め作業のため、予約が立て込んだため"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setOvertimeModal(null); setOvertimeReason(''); }}
                className="btn btn-secondary flex-1"
              >
                キャンセル
              </button>
              <button
                onClick={handleOvertimeSubmit}
                disabled={!overtimeReason.trim()}
                className="btn btn-primary flex-1"
              >
                申請する
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
