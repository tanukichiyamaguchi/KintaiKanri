import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Save,
  X,
  AlertCircle,
  ClipboardList,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { staffApi, attendanceApi } from '../../api';
import type { StaffInfo, AttendanceRecord } from '../../types';
import { Header, Loading } from '../../components/common';
import { formatMinutesAsTime, formatLocalDate } from '../../utils/calculations';

export function AttendanceManagement() {
  const navigate = useNavigate();
  const { isAdmin, isAuthenticated } = useAuth();

  const [staffList, setStaffList] = useState<StaffInfo[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<AttendanceRecord>>({});
  const [error, setError] = useState<string | null>(null);

  // Redirect if not admin
  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      navigate('/');
    }
  }, [isAuthenticated, isAdmin, navigate]);

  // Fetch staff list
  useEffect(() => {
    async function fetchStaff() {
      try {
        const response = await staffApi.getList();
        if (response.success && response.data) {
          const activeStaff = response.data.filter(s => s.status === 'active');
          setStaffList(activeStaff);
          if (activeStaff.length > 0) {
            setSelectedStaff(prev => prev || activeStaff[0].staffId);
          }
        }
      } catch {
        setError('スタッフ情報の取得に失敗しました');
      } finally {
        setIsLoading(false);
      }
    }

    fetchStaff();
  }, []);

  // Fetch attendance data
  useEffect(() => {
    if (!selectedStaff) return;

    async function fetchAttendance() {
      setIsLoading(true);
      try {
        const response = await attendanceApi.getMonthly(
          selectedStaff,
          selectedYear,
          selectedMonth
        );
        if (response.success && response.data) {
          setAttendance(response.data);
        } else {
          setAttendance([]);
        }
      } catch {
        setAttendance([]);
        setError('勤怠データの取得に失敗しました');
      } finally {
        setIsLoading(false);
      }
    }

    fetchAttendance();
  }, [selectedStaff, selectedYear, selectedMonth]);

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

  const handleEdit = (record: AttendanceRecord) => {
    setEditingRow(record.date);
    setEditData({
      clockIn: record.clockIn,
      clockOut: record.clockOut,
      breakStart: record.breakStart,
      breakEnd: record.breakEnd,
      remarks: record.remarks,
    });
  };

  const handleCancelEdit = () => {
    setEditingRow(null);
    setEditData({});
  };

  const handleSaveEdit = async (date: string) => {
    // In a real implementation, this would call the API
    // For now, just update the local state
    setAttendance(prev =>
      prev.map(record =>
        record.date === date ? { ...record, ...editData } : record
      )
    );
    setEditingRow(null);
    setEditData({});
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekday = weekdays[date.getDay()];
    return `${date.getDate()}（${weekday}）`;
  };

  const formatTime = (timeStr?: string): string => {
    if (!timeStr) return '-';
    const date = new Date(timeStr);
    return date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const extractTime = (timeStr?: string): string => {
    if (!timeStr) return '';
    const date = new Date(timeStr);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  // Generate all days in the month (using local timezone)
  const getDaysInMonth = (): string[] => {
    const days: string[] = [];
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();

    for (let i = 1; i <= lastDay; i++) {
      const date = new Date(selectedYear, selectedMonth - 1, i);
      days.push(formatLocalDate(date));
    }

    return days;
  };

  const allDays = getDaysInMonth();

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-secondary-100">
      <Header title="勤怠管理" />

      <main className="max-w-6xl mx-auto p-4 sm:p-6">
        {/* Back Link + Bulk Entry */}
        <div className="flex items-center justify-between mb-5">
          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 text-secondary-500 hover:text-primary-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">ダッシュボードへ戻る</span>
          </Link>
          <Link
            to="/admin/bulk-entry"
            className="btn btn-primary !py-2 !px-4 !text-sm !rounded-xl"
          >
            <ClipboardList className="w-4 h-4" />
            一括入力モード
          </Link>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 text-red-600 bg-red-50 border border-red-200 px-5 py-4 rounded-xl mb-5">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Filters */}
        <div className="card card-gold gold-border mb-5">
          <div className="flex flex-wrap items-center gap-4">
            {/* Staff Selector */}
            <div className="flex-1 min-w-[200px]">
              <label className="label">スタッフ</label>
              <select
                value={selectedStaff}
                onChange={e => setSelectedStaff(e.target.value)}
                className="input"
              >
                {staffList.map(staff => (
                  <option key={staff.staffId} value={staff.staffId}>
                    {staff.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Month Selector */}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePreviousMonth}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <span className="text-lg font-semibold min-w-[120px] text-center">
                {selectedYear}年{selectedMonth}月
              </span>
              <button
                onClick={handleNextMonth}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>
        </div>

        {/* Attendance Table */}
        <div className="card overflow-x-auto p-0 overflow-hidden">
          {isLoading ? (
            <Loading message="読み込み中..." />
          ) : (
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="bg-gradient-to-r from-secondary-800 to-secondary-900 text-white">
                  <th className="px-3 py-3 text-left text-xs font-semibold tracking-wider">日付</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold tracking-wider">出勤</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold tracking-wider">退勤</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold tracking-wider">休憩開始</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold tracking-wider">休憩終了</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold tracking-wider">休憩</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold tracking-wider">実働</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold tracking-wider">備考</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allDays.map(date => {
                  const record = attendance.find(r => r.date === date);
                  const isEditing = editingRow === date;
                  const dateObj = new Date(date);
                  const isWeekend =
                    dateObj.getDay() === 0 || dateObj.getDay() === 6;

                  return (
                    <tr
                      key={date}
                      className={`${
                        isWeekend ? 'bg-gray-50' : ''
                      } hover:bg-gray-100`}
                    >
                      <td
                        className={`px-3 py-2 text-sm font-medium ${
                          dateObj.getDay() === 0
                            ? 'text-red-600'
                            : dateObj.getDay() === 6
                            ? 'text-blue-600'
                            : 'text-gray-800'
                        }`}
                      >
                        {formatDate(date)}
                      </td>

                      {isEditing ? (
                        <>
                          <td className="px-3 py-2">
                            <input
                              type="time"
                              value={extractTime(editData.clockIn)}
                              onChange={e =>
                                setEditData(prev => ({
                                  ...prev,
                                  clockIn: e.target.value
                                    ? `${date}T${e.target.value}:00`
                                    : undefined,
                                }))
                              }
                              className="input py-1 px-2 text-sm w-24"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="time"
                              value={extractTime(editData.clockOut)}
                              onChange={e =>
                                setEditData(prev => ({
                                  ...prev,
                                  clockOut: e.target.value
                                    ? `${date}T${e.target.value}:00`
                                    : undefined,
                                }))
                              }
                              className="input py-1 px-2 text-sm w-24"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="time"
                              value={extractTime(editData.breakStart)}
                              onChange={e =>
                                setEditData(prev => ({
                                  ...prev,
                                  breakStart: e.target.value
                                    ? `${date}T${e.target.value}:00`
                                    : undefined,
                                }))
                              }
                              className="input py-1 px-2 text-sm w-24"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="time"
                              value={extractTime(editData.breakEnd)}
                              onChange={e =>
                                setEditData(prev => ({
                                  ...prev,
                                  breakEnd: e.target.value
                                    ? `${date}T${e.target.value}:00`
                                    : undefined,
                                }))
                              }
                              className="input py-1 px-2 text-sm w-24"
                            />
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-700">-</td>
                          <td className="px-3 py-2 text-sm text-gray-700">-</td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={editData.remarks || ''}
                              onChange={e =>
                                setEditData(prev => ({
                                  ...prev,
                                  remarks: e.target.value,
                                }))
                              }
                              className="input py-1 px-2 text-sm w-full"
                              placeholder="備考"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleSaveEdit(date)}
                                className="p-1 text-green-600 hover:bg-green-50 rounded"
                              >
                                <Save className="w-4 h-4" />
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 text-sm text-gray-700">
                            {formatTime(record?.clockIn)}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-700">
                            {formatTime(record?.clockOut)}
                            {record?.clockOutType === 'early_company' && (
                              <span className="ml-1 text-xs text-blue-600">
                                早上
                              </span>
                            )}
                            {record?.clockOutType === 'early_self' && (
                              <span className="ml-1 text-xs text-red-600">
                                早退
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-700">
                            {formatTime(record?.breakStart)}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-700">
                            {formatTime(record?.breakEnd)}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-700">
                            {record?.breakMinutes
                              ? `${record.breakMinutes}分`
                              : '-'}
                          </td>
                          <td className="px-3 py-2 text-sm font-medium text-gray-900">
                            {record?.workMinutes
                              ? formatMinutesAsTime(record.workMinutes)
                              : '-'}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-500">
                            {record?.remarks || '-'}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() =>
                                record
                                  ? handleEdit(record)
                                  : handleEdit({
                                      date,
                                      staffId: selectedStaff,
                                      name: '',
                                      breakMinutes: 0,
                                      workMinutes: 0,
                                      lateMinutes: 0,
                                      earlyLeaveMinutes: 0,
                                      isHoliday: isWeekend,
                                    })
                              }
                              className="p-1 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Summary */}
        {!isLoading && attendance.length > 0 && (
          <div className="card card-gold mt-5">
            <h3 className="font-semibold text-secondary-800 mb-4 flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
                <span className="text-white text-xs font-bold">{String.fromCharCode(931)}</span>
              </div>
              月間サマリー
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-4 border border-secondary-100">
                <p className="text-xs font-medium text-secondary-500 mb-1">出勤日数</p>
                <p className="text-2xl font-bold text-secondary-800">
                  {attendance.filter(r => r.workMinutes > 0).length}<span className="text-sm ml-0.5">日</span>
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-secondary-100">
                <p className="text-xs font-medium text-secondary-500 mb-1">総労働時間</p>
                <p className="text-2xl font-bold text-secondary-800">
                  {formatMinutesAsTime(
                    attendance.reduce((sum, r) => sum + r.workMinutes, 0)
                  )}
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-red-100">
                <p className="text-xs font-medium text-secondary-500 mb-1">遅刻時間</p>
                <p className={`text-2xl font-bold ${
                  attendance.reduce((sum, r) => sum + r.lateMinutes, 0) > 0 ? 'text-red-500' : 'text-secondary-800'
                }`}>
                  {attendance.reduce((sum, r) => sum + r.lateMinutes, 0)}<span className="text-sm ml-0.5">分</span>
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-red-100">
                <p className="text-xs font-medium text-secondary-500 mb-1">早退時間</p>
                <p className={`text-2xl font-bold ${
                  attendance.reduce((sum, r) => sum + r.earlyLeaveMinutes, 0) > 0 ? 'text-red-500' : 'text-secondary-800'
                }`}>
                  {attendance.reduce((sum, r) => sum + r.earlyLeaveMinutes, 0)}<span className="text-sm ml-0.5">分</span>
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
