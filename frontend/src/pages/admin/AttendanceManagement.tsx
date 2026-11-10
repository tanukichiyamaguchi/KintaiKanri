import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { staffApi, attendanceApi, submissionApi } from '../../api';
import type {
  StaffInfo,
  AttendanceRecord,
  MonthlySubmission,
  SubmissionStatus,
} from '../../types';
import { Header, Loading } from '../../components/common';
import { formatMinutesAsTime, formatLocalDate } from '../../utils/calculations';

// 表（iPad・PC）の見出しセル
const TH = 't-footnote text-label-2 font-medium px-4 py-2.5 bg-surface sticky top-0 whitespace-nowrap';
// 表の中で使う小さめの入力欄
const CELL_INPUT = 'input !min-h-9 !py-1.5 !px-2.5 !text-[15px]';
// 前月・次月の丸いボタン
const STEP_BTN = 'grid h-11 w-11 place-items-center rounded-full text-tint transition-colors hover:bg-fill active:bg-fill-2';

export function AttendanceManagement() {
  const navigate = useNavigate();
  const { isAdmin, isAuthenticated, admin } = useAuth();

  const [staffList, setStaffList] = useState<StaffInfo[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<AttendanceRecord>>({});
  const [error, setError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<MonthlySubmission | null>(null);

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

  // Fetch monthly submission status
  useEffect(() => {
    if (!selectedStaff) {
      setSubmission(null);
      return;
    }

    async function fetchSubmission() {
      try {
        const yearMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
        const response = await submissionApi.getStatus(selectedStaff, yearMonth);
        if (response.success && response.data) {
          setSubmission(response.data);
        } else {
          setSubmission(null);
        }
      } catch {
        setSubmission(null);
      }
    }

    fetchSubmission();
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
      breakMinutes: record.breakMinutes,
      remarks: record.remarks,
    });
  };

  const handleCancelEdit = () => {
    setEditingRow(null);
    setEditData({});
  };

  const handleSaveEdit = async (date: string) => {
    const original = attendance.find(r => r.date === date);
    const fields: Array<{ field: string; value: string | number | undefined }> = [
      { field: 'clockIn', value: editData.clockIn },
      { field: 'clockOut', value: editData.clockOut },
      { field: 'breakMinutes', value: editData.breakMinutes },
      { field: 'remarks', value: editData.remarks },
    ];

    try {
      for (const { field, value } of fields) {
        const originalValue = original ? (original as unknown as Record<string, unknown>)[field] : undefined;
        if (value === undefined || value === originalValue) continue;
        await attendanceApi.update(date, selectedStaff, field, value as string | number, {
          editorRole: 'admin',
          editorId: admin?.adminId,
        });
      }

      setAttendance(prev => {
        const idx = prev.findIndex(r => r.date === date);
        if (idx === -1) {
          return [
            ...prev,
            {
              date,
              staffId: selectedStaff,
              name: '',
              breakMinutes: 0,
              workMinutes: 0,
              lateMinutes: 0,
              earlyLeaveMinutes: 0,
              isHoliday: false,
              ...editData,
            } as AttendanceRecord,
          ];
        }
        return prev.map(record =>
          record.date === date ? { ...record, ...editData } : record
        );
      });
      setEditingRow(null);
      setEditData({});
    } catch {
      setError('保存に失敗しました');
    }
  };

  const submissionStatusInfo = (
    status?: SubmissionStatus
  ): { label: string; cls: string } | null => {
    switch (status) {
      case 'submitted':
        return { label: '提出済み（承認待ち）', cls: 'pill-warning' };
      case 'approved':
        return { label: '承認済み', cls: 'pill-success' };
      case 'rejected':
        return { label: '差戻し', cls: 'pill-danger' };
      case 'draft':
        return { label: '未提出', cls: 'pill-neutral' };
      default:
        return null;
    }
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
    <div className="page">
      <Header
        title="勤怠"
        wide
        actions={
          <Link to="/admin/attendance/edit" className="btn btn-plain !font-normal">
            出勤簿編集
          </Link>
        }
      />

      <main className="page-content page-content-wide">
        {/* Error */}
        {error && (
          <div className="callout callout-danger mb-4" role="alert">
            <AlertCircle aria-hidden="true" />
            <p className="font-medium break-words">{error}</p>
          </div>
        )}

        {/* スタッフと月の選択・出勤簿の提出状況 */}
        <section className="card" aria-label="表示するスタッフと月">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
            {/* Staff Selector */}
            <div className="sm:w-72 sm:flex-shrink-0">
              <label htmlFor="attendance-staff" className="label">スタッフ</label>
              <select
                id="attendance-staff"
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

            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-2">
              {/* Month Selector */}
              <div className="-mx-2 flex items-center">
                <button type="button" onClick={handlePreviousMonth} className={STEP_BTN} aria-label="前月">
                  <ChevronLeft className="h-6 w-6" strokeWidth={2.4} aria-hidden="true" />
                </button>
                <p className="t-headline tabular min-w-[7.5em] text-center" aria-live="polite">
                  {selectedYear}年{selectedMonth}月
                </p>
                <button type="button" onClick={handleNextMonth} className={STEP_BTN} aria-label="次月">
                  <ChevronRight className="h-6 w-6" strokeWidth={2.4} aria-hidden="true" />
                </button>
              </div>

              {/* Submission Status */}
              {(() => {
                const info = submissionStatusInfo(submission?.status);
                if (!info) return null;
                return (
                  <span className="flex items-center gap-2">
                    <span className="t-footnote text-label-2">出勤簿</span>
                    <span className={`pill ${info.cls}`}>{info.label}</span>
                  </span>
                );
              })()}
            </div>
          </div>
        </section>

        {/* Summary */}
        {!isLoading && attendance.length > 0 && (
          <section className="section">
            <h2 className="section-header">月間サマリー</h2>
            <div className="card grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              <div className="tile">
                <p className="t-footnote text-label-2">出勤日数</p>
                <p className="t-title2 tabular mt-0.5">
                  {attendance.filter(r => r.workMinutes > 0).length}<span className="t-subhead font-medium text-label-2 ml-0.5">日</span>
                </p>
              </div>
              <div className="tile">
                <p className="t-footnote text-label-2">総労働時間</p>
                <p className="t-title2 tabular mt-0.5">
                  {formatMinutesAsTime(
                    attendance.reduce((sum, r) => sum + r.workMinutes, 0)
                  )}
                </p>
              </div>
              <div className="tile">
                <p className="t-footnote text-label-2">遅刻時間</p>
                <p className={`t-title2 tabular mt-0.5 ${
                  attendance.reduce((sum, r) => sum + r.lateMinutes, 0) > 0 ? 'text-danger' : 'text-label'
                }`}>
                  {attendance.reduce((sum, r) => sum + r.lateMinutes, 0)}<span className="t-subhead font-medium ml-0.5">分</span>
                </p>
              </div>
              <div className="tile">
                <p className="t-footnote text-label-2">早退時間</p>
                <p className={`t-title2 tabular mt-0.5 ${
                  attendance.reduce((sum, r) => sum + r.earlyLeaveMinutes, 0) > 0 ? 'text-danger' : 'text-label'
                }`}>
                  {attendance.reduce((sum, r) => sum + r.earlyLeaveMinutes, 0)}<span className="t-subhead font-medium ml-0.5">分</span>
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Attendance Table / List */}
        <section className="section">
          <h2 className="section-header">日別の記録</h2>
          {isLoading ? (
            <div className="card">
              <Loading message="読み込み中..." />
            </div>
          ) : (
            <>
              {/* iPhone: list */}
              <div className="sm:hidden list-group">
                {allDays.map(date => {
                  const record = attendance.find(r => r.date === date);
                  const isEditing = editingRow === date;
                  const dateObj = new Date(date);
                  const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                  const dateColor =
                    dateObj.getDay() === 0
                      ? 'text-danger'
                      : dateObj.getDay() === 6
                      ? 'text-info'
                      : 'text-label';

                  return (
                    <div
                      key={date}
                      className={`list-row !py-2.5 ${isEditing ? 'bg-tint-fill-weak' : '!pr-2'}`}
                    >
                      {isEditing ? (
                        <div className="min-w-0 flex-1 space-y-3 py-1">
                          <p className={`t-headline ${dateColor}`}>{formatDate(date)}</p>
                          <div className="grid grid-cols-2 gap-3">
                            <label className="block min-w-0">
                              <span className="label">出勤</span>
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
                                className="input"
                              />
                            </label>
                            <label className="block min-w-0">
                              <span className="label">退勤</span>
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
                                className="input"
                              />
                            </label>
                          </div>
                          <label className="block">
                            <span className="label">休憩（分）</span>
                            <input
                              type="number"
                              min={0}
                              value={editData.breakMinutes ?? 0}
                              onChange={e =>
                                setEditData(prev => ({
                                  ...prev,
                                  breakMinutes: Number(e.target.value) || 0,
                                }))
                              }
                              className="input tabular"
                            />
                          </label>
                          <label className="block">
                            <span className="label">備考</span>
                            <input
                              type="text"
                              value={editData.remarks || ''}
                              onChange={e =>
                                setEditData(prev => ({
                                  ...prev,
                                  remarks: e.target.value,
                                }))
                              }
                              className="input"
                              placeholder="備考"
                            />
                          </label>
                          <div className="grid grid-cols-2 gap-3 pt-1">
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              className="btn btn-gray"
                            >
                              キャンセル
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(date)}
                              className="btn btn-filled"
                            >
                              保存
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="list-row-title">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className={`t-headline ${dateColor}`}>
                                {formatDate(date)}
                              </span>
                              <span className="t-subhead tabular whitespace-nowrap">
                                <span className="t-footnote text-label-2 mr-1">実働</span>
                                {record?.workMinutes
                                  ? formatMinutesAsTime(record.workMinutes)
                                  : '-'}
                              </span>
                            </div>
                            <p className="mt-0.5 flex flex-wrap gap-x-3.5 t-footnote tabular">
                              <span>
                                <span className="text-label-2 mr-1">出勤</span>
                                {formatTime(record?.clockIn)}
                              </span>
                              <span>
                                <span className="text-label-2 mr-1">退勤</span>
                                {formatTime(record?.clockOut)}
                              </span>
                              <span>
                                <span className="text-label-2 mr-1">休憩</span>
                                {record?.breakMinutes ? `${record.breakMinutes}分` : '-'}
                              </span>
                            </p>
                            {record?.remarks && (
                              <p className="mt-0.5 t-footnote truncate">
                                <span className="text-label-2 mr-1">備考</span>
                                {record.remarks}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
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
                            className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full text-tint active:bg-fill"
                            aria-label="編集"
                          >
                            <Pencil className="h-5 w-5" aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* iPad・PC: Table */}
              <div className="hidden sm:block card !p-0 overflow-x-auto">
                <table className="w-full min-w-[760px] t-subhead tabular">
                  <thead>
                    <tr>
                      <th scope="col" className={`${TH} text-left w-[6.5rem]`}>日付</th>
                      <th scope="col" className={`${TH} text-right w-[9.75rem]`}>出勤</th>
                      <th scope="col" className={`${TH} text-right w-[9.75rem]`}>退勤</th>
                      <th scope="col" className={`${TH} text-right w-[6.5rem]`}>休憩(分)</th>
                      <th scope="col" className={`${TH} text-right w-[8rem]`}>実働</th>
                      <th scope="col" className={`${TH} text-left`}>備考</th>
                      <th scope="col" className={`${TH} text-right w-[11rem]`}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allDays.map(date => {
                      const record = attendance.find(r => r.date === date);
                      const isEditing = editingRow === date;
                      const dateObj = new Date(date);
                      const isWeekend =
                        dateObj.getDay() === 0 || dateObj.getDay() === 6;

                      return (
                        <tr
                          key={date}
                          className={`border-t-[0.5px] border-separator ${
                            isEditing ? 'bg-tint-fill-weak' : ''
                          }`}
                        >
                          <td
                            className={`px-4 py-3 font-medium whitespace-nowrap ${
                              dateObj.getDay() === 0
                                ? 'text-danger'
                                : dateObj.getDay() === 6
                                ? 'text-info'
                                : 'text-label'
                            }`}
                          >
                            {formatDate(date)}
                          </td>

                          {isEditing ? (
                            <>
                              <td className="pl-2 pr-4 py-2">
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
                                  aria-label="出勤"
                                  className={`${CELL_INPUT} ml-auto w-[8.25rem]`}
                                />
                              </td>
                              <td className="pl-2 pr-4 py-2">
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
                                  aria-label="退勤"
                                  className={`${CELL_INPUT} ml-auto w-[8.25rem]`}
                                />
                              </td>
                              <td className="pl-2 pr-4 py-2">
                                <input
                                  type="number"
                                  min={0}
                                  value={editData.breakMinutes ?? 0}
                                  onChange={e =>
                                    setEditData(prev => ({
                                      ...prev,
                                      breakMinutes: Number(e.target.value) || 0,
                                    }))
                                  }
                                  aria-label="休憩（分）"
                                  className={`${CELL_INPUT} ml-auto w-[5rem] text-right tabular`}
                                />
                              </td>
                              <td className="px-4 py-2 text-right text-label-3">-</td>
                              <td className="px-4 py-2">
                                <input
                                  type="text"
                                  value={editData.remarks || ''}
                                  onChange={e =>
                                    setEditData(prev => ({
                                      ...prev,
                                      remarks: e.target.value,
                                    }))
                                  }
                                  aria-label="備考"
                                  className={`${CELL_INPUT} min-w-[7rem]`}
                                  placeholder="備考"
                                />
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={handleCancelEdit}
                                    className="btn btn-plain !text-[15px] !font-normal"
                                  >
                                    キャンセル
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSaveEdit(date)}
                                    className="btn btn-filled !px-4 !text-[15px]"
                                  >
                                    保存
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3 text-right">
                                {formatTime(record?.clockIn)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {formatTime(record?.clockOut)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {record?.breakMinutes
                                  ? `${record.breakMinutes}分`
                                  : '-'}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                                {record?.workMinutes
                                  ? formatMinutesAsTime(record.workMinutes)
                                  : '-'}
                              </td>
                              <td className="px-4 py-3 text-label-2">
                                {record?.remarks || '-'}
                              </td>
                              <td className="px-2 py-0">
                                <button
                                  type="button"
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
                                  className="ml-auto grid h-11 w-11 place-items-center rounded-full text-tint transition-colors hover:bg-fill active:bg-fill-2"
                                  aria-label="編集"
                                  title="編集"
                                >
                                  <Pencil className="h-[18px] w-[18px]" aria-hidden="true" />
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
