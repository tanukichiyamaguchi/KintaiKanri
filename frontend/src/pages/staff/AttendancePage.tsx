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
  Send,
  Lock,
  FileText,
  Info,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  bulkAttendanceApi,
  staffApi,
  shiftApi,
  applicationApi,
  submissionApi,
} from '../../api';
import type {
  BulkAttendanceRow,
  Application,
  ApplicationType,
  MonthlySubmission,
  ShiftDiff,
  ShiftDiffKind,
  StaffInfo,
} from '../../types';
import { Header, Loading, Modal, ApplicationModal, SubmissionStatusBadge, ShiftDiffKindBadge, ApplicationStatusBadge } from '../../components/common';
import { formatLocalDate, extractLocalTimeHHMM } from '../../utils/calculations';
import {
  computeWorkAndOvertime,
  calcElapsedMinutes,
  getLegalBreakMinutes,
} from '../../utils/breakCalculator';
import { detectShiftDiff, estimatedPlannedBreak, APPLICATION_TYPE_LABEL } from '../../utils/shiftDiff';

export function AttendancePage() {
  const navigate = useNavigate();
  const { staff, isAuthenticated, isAdmin } = useAuth();

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [rows, setRows] = useState<BulkAttendanceRow[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [submission, setSubmission] = useState<MonthlySubmission | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submissionRemarks, setSubmissionRemarks] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [appModalDate, setAppModalDate] = useState<string | null>(null);
  const [appModalDiff, setAppModalDiff] = useState<ShiftDiff | null>(null);
  const [appModalKind, setAppModalKind] = useState<ShiftDiffKind | null>(null);

  // Admin mode: staff selector
  const [staffList, setStaffList] = useState<StaffInfo[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');

  const currentStaffId = isAdmin ? selectedStaffId : staff?.staffId;
  const currentStaffName =
    isAdmin
      ? staffList.find(s => s.staffId === selectedStaffId)?.name || ''
      : staff?.name || '';
  const yearMonthStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

  const submissionStatus = submission?.status || 'draft';
  const isLocked = submissionStatus === 'submitted' || submissionStatus === 'approved';

  useEffect(() => {
    if (!isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  // Load staff list for admin (once on entering admin mode)
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const res = await staffApi.getList();
      if (res.success && res.data) {
        const active = res.data.filter(s => s.status === 'active');
        setStaffList(active);
        // Default-select the first staff only if nothing is selected yet.
        // Use functional update so this effect doesn't depend on selectedStaffId
        // (otherwise it would refire on every selection change).
        setSelectedStaffId(prev => prev || (active[0]?.staffId ?? ''));
      }
    })();
  }, [isAdmin]);

  // All days of the month
  const allDays = useMemo(() => {
    const days: string[] = [];
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    for (let i = 1; i <= lastDay; i++) {
      const date = new Date(selectedYear, selectedMonth - 1, i);
      days.push(formatLocalDate(date));
    }
    return days;
  }, [selectedYear, selectedMonth]);

  // Load all data
  const loadAll = useCallback(async () => {
    if (!currentStaffId) return;
    setIsLoading(true);
    try {
      const [attRes, shiftRes, appsRes, subRes] = await Promise.all([
        bulkAttendanceApi.get(currentStaffId, selectedYear, selectedMonth),
        shiftApi.getStaffMonth(currentStaffId, selectedYear, selectedMonth),
        applicationApi.list({ staffId: currentStaffId, yearMonth: yearMonthStr }),
        submissionApi.getStatus(currentStaffId, yearMonthStr),
      ]);

      const existing = attRes.success && attRes.data ? attRes.data : [];
      const shiftList = shiftRes.success && shiftRes.data ? shiftRes.data.shifts : [];
      const apps = appsRes.success && appsRes.data ? appsRes.data : [];
      const sub = subRes.success && subRes.data ? subRes.data : null;

      setApplications(apps);
      setSubmission(sub);

      const newRows: BulkAttendanceRow[] = allDays.map(date => {
        const ex = existing.find(r => r.date === date);
        const dateObj = new Date(date);
        const isHoliday = dateObj.getDay() === 0 || dateObj.getDay() === 6;
        const shift = shiftList.find(s => s.date === date);

        if (ex && (ex.clockIn || ex.clockOut)) {
          // 片方だけ入力済み（出勤のみ等）の行も復元する。両方必須にすると、
          // 片側入力のデータが画面上は空に見え（＝サイレント消失）、detectShiftDiff が
          // 欠勤と誤判定して提出がブロックされるため。
          // Parse via Date when ISO so UTC strings (from /clock punches) are
          // shown as the user's local time.
          const clockIn = ex.clockIn ? extractLocalTimeHHMM(ex.clockIn) : '';
          const clockOut = ex.clockOut ? extractLocalTimeHHMM(ex.clockOut) : '';
          const elapsed = calcElapsedMinutes(clockIn, clockOut);
          // 手動修正フラグが立っている場合のみ保存値を尊重する。
          // 立っていなければ常に最新の法定値を再計算（閾値の改訂・古い保存値の自動補正のため）。
          const breakMin = ex.breakMinutesIsManual && typeof ex.breakMinutes === 'number'
            ? ex.breakMinutes
            : getLegalBreakMinutes(elapsed);
          const { workMinutes, overtimeMinutes } = computeWorkAndOvertime(clockIn, clockOut, breakMin);
          return {
            date,
            clockIn,
            clockOut,
            breakMinutes: breakMin,
            breakMinutesIsManual: ex.breakMinutesIsManual,
            workMinutes,
            isHoliday,
            overtimeMinutes,
            overtimeReason: '',
            remarks: ex.remarks || '',
            shift,
          };
        }

        return {
          date,
          clockIn: '',
          clockOut: '',
          breakMinutes: 0,
          workMinutes: 0,
          isHoliday,
          overtimeMinutes: 0,
          overtimeReason: '',
          remarks: '',
          shift,
        };
      });

      setRows(newRows);
      setHasUnsavedChanges(false);
    } catch {
      setMessage({ type: 'error', text: 'データの取得に失敗しました' });
    } finally {
      setIsLoading(false);
    }
  }, [currentStaffId, selectedYear, selectedMonth, allDays, yearMonthStr]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Update a row + auto-recalc
  const updateRow = useCallback((index: number, field: keyof BulkAttendanceRow, value: string | number | boolean) => {
    setRows(prev => {
      const newRows = [...prev];
      const row = { ...newRows[index] };
      if (field === 'clockIn' || field === 'clockOut') {
        (row as Record<string, unknown>)[field] = value;
        const elapsed = calcElapsedMinutes(
          field === 'clockIn' ? (value as string) : row.clockIn,
          field === 'clockOut' ? (value as string) : row.clockOut
        );
        if (elapsed > 0) {
          if (!row.breakMinutesIsManual) {
            row.breakMinutes = getLegalBreakMinutes(elapsed);
          }
          const { workMinutes, overtimeMinutes } = computeWorkAndOvertime(
            row.clockIn, row.clockOut, row.breakMinutes
          );
          row.workMinutes = workMinutes;
          row.overtimeMinutes = overtimeMinutes;
        } else {
          row.breakMinutes = 0;
          row.workMinutes = 0;
          row.overtimeMinutes = 0;
        }
      } else if (field === 'breakMinutes') {
        const parsed = Number(value);
        const safe = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
        row.breakMinutes = safe;
        row.breakMinutesIsManual = true;
        const { workMinutes, overtimeMinutes } = computeWorkAndOvertime(
          row.clockIn, row.clockOut, row.breakMinutes
        );
        row.workMinutes = workMinutes;
        row.overtimeMinutes = overtimeMinutes;
      } else {
        (row as Record<string, unknown>)[field] = value;
      }
      newRows[index] = row;
      return newRows;
    });
    setHasUnsavedChanges(true);
  }, []);

  /**
   * 「定時」ボタン: 当日のシフト予定時刻 (startTime/endTime) を出勤・退勤に流し込む。
   * 休憩は法定基準で再計算（手動修正フラグもリセット）し、実労働・残業も同時に算出。
   * シフト未登録 / 休 / 仮シフト / 行ロック中は何もしない。
   */
  const applyScheduledTime = useCallback((index: number) => {
    setRows(prev => {
      const newRows = [...prev];
      const row = { ...newRows[index] };
      const shift = row.shift;
      if (!shift || shift.isOff || !shift.startTime || !shift.endTime) {
        return prev;
      }
      row.clockIn = shift.startTime;
      row.clockOut = shift.endTime;
      row.breakMinutesIsManual = false;
      const elapsed = calcElapsedMinutes(row.clockIn, row.clockOut);
      row.breakMinutes = getLegalBreakMinutes(elapsed);
      const { workMinutes, overtimeMinutes } = computeWorkAndOvertime(
        row.clockIn, row.clockOut, row.breakMinutes
      );
      row.workMinutes = workMinutes;
      row.overtimeMinutes = overtimeMinutes;
      newRows[index] = row;
      return newRows;
    });
    setHasUnsavedChanges(true);
  }, []);

  // Compute diff for each row
  const rowDiffs = useMemo(() => {
    return rows.map(row => {
      if (!row.clockIn && !row.clockOut && !row.shift) {
        return null;
      }
      const plannedBreak = estimatedPlannedBreak(row.shift);
      return detectShiftDiff(
        row.date, row.shift, row.clockIn, row.clockOut, row.breakMinutes, plannedBreak,
        row.breakMinutesIsManual
      );
    });
  }, [rows]);

  // Map applications by date (sorted by submittedAt desc so newer first)
  const applicationsByDate = useMemo(() => {
    const map: Record<string, Application[]> = {};
    applications.forEach(a => {
      if (!map[a.date]) map[a.date] = [];
      map[a.date].push(a);
    });
    // Sort each bucket: newest submittedAt first
    Object.keys(map).forEach(date => {
      map[date].sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
    });
    return map;
  }, [applications]);

  /**
   * Pick the application that "represents" the current state for a given (date, kind).
   * Priority: approved > pending > rejected; ties broken by most recent submittedAt.
   * This avoids the stale-rejected bug where a re-submitted (newer) application would
   * be ignored just because an older rejected entry came first.
   */
  const findRelevantApp = (apps: Application[], kind: string): Application | undefined => {
    const ofKind = apps.filter(a => a.type === kind);
    if (ofKind.length === 0) return undefined;
    const priority: Record<string, number> = { approved: 0, pending: 1, rejected: 2 };
    return [...ofKind].sort((a, b) => {
      const p = (priority[a.status] ?? 99) - (priority[b.status] ?? 99);
      if (p !== 0) return p;
      return a.submittedAt < b.submittedAt ? 1 : -1;
    })[0];
  };

  // Submission gate calculation
  const submissionGate = useMemo(() => {
    const blockingReasons: string[] = [];
    const flagged = new Set<string>(); // `${date}|${type}` を重複計上しない
    rows.forEach((row, idx) => {
      const diff = rowDiffs[idx];
      const apps = applicationsByDate[row.date] || [];
      if (diff && diff.hasIssue) {
        diff.kinds.forEach(kind => {
          const matched = findRelevantApp(apps, kind);
          const label = APPLICATION_TYPE_LABEL[kind] || kind;
          if (!matched) {
            blockingReasons.push(`${row.date}: ${label}の申請が必要です`);
          } else if (matched.status === 'pending') {
            blockingReasons.push(`${row.date}: ${label}の申請が承認待ちです`);
            flagged.add(`${row.date}|${kind}`);
          } else if (matched.status === 'rejected') {
            blockingReasons.push(`${row.date}: ${label}の申請が却下されています（再申請が必要）`);
            flagged.add(`${row.date}|${kind}`);
          }
        });
      }
    });
    // GAS 側は「当月に審査待ち(pending)の申請が1件でもあれば提出不可」。
    // 差異が消えた日の pending 申請は上のループに現れず、フロントでは押せるのに
    // GAS で弾かれる齟齬になる。未計上の pending を全て理由に加えて整合させる。
    applications.forEach(a => {
      if (a.status !== 'pending') return;
      if (flagged.has(`${a.date}|${a.type}`)) return;
      const label = APPLICATION_TYPE_LABEL[a.type] || a.type;
      blockingReasons.push(`${a.date}: ${label}の申請が承認待ちです`);
      flagged.add(`${a.date}|${a.type}`);
    });
    return {
      canSubmit: blockingReasons.length === 0 && !isLocked,
      blockingReasons,
    };
  }, [rows, rowDiffs, applicationsByDate, applications, isLocked]);

  // Save (draft)
  const handleSave = async () => {
    if (!currentStaffId) return;
    setIsSaving(true);
    setMessage(null);
    try {
      const response = await bulkAttendanceApi.save(currentStaffId, selectedYear, selectedMonth, rows);
      if (response.success) {
        setMessage({ type: 'success', text: `下書き保存しました（${response.data?.saved || 0}件）` });
        setHasUnsavedChanges(false);
        await loadAll();
      } else {
        setMessage({ type: 'error', text: response.error || '保存に失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: '保存に失敗しました' });
    } finally {
      setIsSaving(false);
    }
  };

  // Submit monthly
  const handleSubmitMonthly = async () => {
    if (!currentStaffId) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      // Save first; abort submit if the save itself fails (otherwise stale rows
      // would be submitted without the user's latest edits).
      const saveRes = await bulkAttendanceApi.save(currentStaffId, selectedYear, selectedMonth, rows);
      if (!saveRes.success) {
        setMessage({ type: 'error', text: saveRes.error || '保存に失敗したため提出を中止しました' });
        return;
      }
      const res = await submissionApi.submit(currentStaffId, yearMonthStr, submissionRemarks);
      if (res.success) {
        setMessage({ type: 'success', text: `${selectedYear}年${selectedMonth}月を提出しました` });
        setShowSubmitModal(false);
        setSubmissionRemarks('');
        setHasUnsavedChanges(false);
        await loadAll();
      } else {
        setMessage({ type: 'error', text: res.error || '提出に失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: '提出に失敗しました' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit application
  const handleSubmitApplication = async (params: {
    type: ApplicationType;
    reason: string;
    details: ShiftDiff['details'];
  }) => {
    if (!currentStaffId || !appModalDate) throw new Error('内部エラー: 状態が不正です');
    // 申請対象日の編集内容が下書き保存されていないと、再読込時にロールバックされてしまう。
    // 申請送信前に必ず一旦下書き保存しておく（失敗時は申請を中止）。
    if (hasUnsavedChanges) {
      const saveRes = await bulkAttendanceApi.save(currentStaffId, selectedYear, selectedMonth, rows);
      if (!saveRes.success) {
        throw new Error(saveRes.error || '下書き保存に失敗したため申請を中止しました');
      }
      setHasUnsavedChanges(false);
    }
    const res = await applicationApi.create({
      staffId: currentStaffId,
      date: appModalDate,
      type: params.type,
      reason: params.reason,
      details: params.details,
    });
    if (!res.success) throw new Error(res.error || '申請に失敗しました');
    setMessage({ type: 'success', text: '申請を送信しました（下書きも自動保存されました）' });
    await loadAll();
  };

  const handlePreviousMonth = () => {
    if (selectedMonth === 1) {
      setSelectedYear(selectedYear - 1);
      setSelectedMonth(12);
    } else setSelectedMonth(selectedMonth - 1);
  };
  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedYear(selectedYear + 1);
      setSelectedMonth(1);
    } else setSelectedMonth(selectedMonth + 1);
  };

  const formatDateLabel = (dateStr: string): string => {
    const date = new Date(dateStr);
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    return `${date.getDate()}（${weekdays[date.getDay()]}）`;
  };

  const formatMinutes = (minutes: number): string => {
    if (minutes <= 0) return '-';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}:${String(m).padStart(2, '0')}`;
  };

  const totalWorkMinutes = rows.reduce((s, r) => s + r.workMinutes, 0);
  const totalOvertimeMinutes = rows.reduce((s, r) => s + r.overtimeMinutes, 0);
  const filledRowCount = rows.filter(r => r.clockIn && r.clockOut).length;
  // 期待勤務日数 = シフトで勤務予定の日 ∪ 実績で打刻があった日（休日出勤を含む）
  // どちらか一方でも該当すれば母数に1日加算する。
  const expectedWorkDays = rows.reduce((sum, r) => {
    const isShiftWorkDay = !!(r.shift && !r.shift.isOff);
    const hasActualWork = !!(r.clockIn && r.clockOut);
    return sum + (isShiftWorkDay || hasActualWork ? 1 : 0);
  }, 0);

  const backLink = isAdmin ? '/admin/attendance' : '/clock';
  const backLabel = isAdmin ? '勤怠管理へ戻る' : '打刻画面へ戻る';

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-secondary-100">
      <Header title="出勤簿" />

      <main className="max-w-7xl mx-auto p-4 sm:p-6">
        <Link
          to={backLink}
          className="inline-flex items-center gap-1.5 text-secondary-500 hover:text-primary-600 transition-colors mb-5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">{backLabel}</span>
        </Link>

        {/* Status Banner */}
        <div className="card mb-5 flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <div className="text-xs text-secondary-500 mb-1 truncate">{currentStaffName} さんの {selectedYear}年{selectedMonth}月</div>
              <div className="flex flex-wrap items-center gap-2">
                <SubmissionStatusBadge status={submissionStatus} />
                {submission?.rejectionReason && (
                  <span className="text-xs text-red-600">差戻理由: {submission.rejectionReason}</span>
                )}
              </div>
            </div>
          </div>

          {/* Month Selector */}
          <div className="flex items-center justify-center gap-1">
            <button
              onClick={handlePreviousMonth}
              className="p-2.5 rounded-xl hover:bg-primary-50 transition-colors min-h-11 min-w-11 flex items-center justify-center"
              aria-label="前の月"
            >
              <ChevronLeft className="w-5 h-5 text-secondary-600" />
            </button>
            <span className="text-lg font-bold min-w-[140px] text-center text-secondary-800">
              {selectedYear}年{selectedMonth}月
            </span>
            <button
              onClick={handleNextMonth}
              className="p-2.5 rounded-xl hover:bg-primary-50 transition-colors min-h-11 min-w-11 flex items-center justify-center"
              aria-label="次の月"
            >
              <ChevronRight className="w-5 h-5 text-secondary-600" />
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2">
            {hasUnsavedChanges && !isLocked && (
              <span className="self-start text-sm text-amber-600 inline-flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200">
                <AlertTriangle className="w-3.5 h-3.5" />未保存
              </span>
            )}
            {isLocked ? (
              <span className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary-100 text-secondary-600 text-sm">
                <Lock className="w-3.5 h-3.5" />編集ロック中
              </span>
            ) : (
              <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={handleSave}
                  disabled={isSaving || !currentStaffId}
                  className="btn btn-secondary inline-flex items-center justify-center gap-2 min-h-11 whitespace-nowrap"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>下書き保存</span>
                </button>
                {!isAdmin && (
                  <button
                    onClick={() => setShowSubmitModal(true)}
                    disabled={!submissionGate.canSubmit || isSubmitting}
                    className="btn btn-primary inline-flex items-center justify-center gap-2 min-h-11 whitespace-nowrap"
                    title={submissionGate.canSubmit ? '月次提出' : submissionGate.blockingReasons[0]}
                  >
                    <Send className="w-4 h-4" />
                    <span>申請する</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`flex items-center gap-3 px-5 py-4 rounded-xl mb-5 border ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}
          >
            {message.type === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            <p className="text-sm font-medium">{message.text}</p>
          </div>
        )}

        {/* Submission gate blocking reasons */}
        {!isLocked && submissionGate.blockingReasons.length > 0 && (
          <div className="card mb-5 border-amber-200 bg-amber-50/50">
            <div className="flex items-start gap-3 text-sm">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-amber-700 mb-1">提出する前に以下に対応してください</p>
                <ul className="text-amber-700 space-y-0.5 text-xs">
                  {submissionGate.blockingReasons.slice(0, 8).map((r, i) => (
                    <li key={i}>・{r}</li>
                  ))}
                  {submissionGate.blockingReasons.length > 8 && (
                    <li>・ほか {submissionGate.blockingReasons.length - 8} 件</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Summary cards (上部) */}
        {!isLoading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-2">
                <CalendarDays className="w-4 h-4 text-primary-500" />
                <span className="text-xs font-medium text-secondary-500">入力済み</span>
              </div>
              <div className="text-2xl font-bold text-secondary-800">{filledRowCount}<span className="text-sm text-secondary-400 ml-1">/ {expectedWorkDays}日</span></div>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-2">
                <ClockIcon className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-medium text-secondary-500">総労働時間</span>
              </div>
              <div className="text-2xl font-bold text-secondary-800">{formatMinutes(totalWorkMinutes)}</div>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-medium text-secondary-500">残業時間</span>
              </div>
              <div className="text-2xl font-bold text-amber-600">{formatMinutes(totalOvertimeMinutes)}</div>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-primary-500" />
                <span className="text-xs font-medium text-secondary-500">申請</span>
              </div>
              <div className="text-2xl font-bold text-secondary-800">
                {applications.length}
                <span className="text-xs text-secondary-400 ml-1">
                  ({applications.filter(a => a.status === 'approved').length}承認/{applications.filter(a => a.status === 'pending').length}待)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Guide */}
        <div className="bg-primary-50/50 border border-primary-200/50 rounded-2xl px-5 py-3.5 mb-5">
          <div className="flex items-start gap-3 text-sm">
            <Info className="w-4 h-4 text-primary-600 flex-shrink-0 mt-1" />
            <div className="text-secondary-600 space-y-1">
              <p>シフトと差異がある日は<strong className="text-amber-600">申請が必要</strong>です。理由を添えて申請してください。</p>
              <p>休憩は<strong>法定通り自動付与</strong>されます。実態と異なる場合は休憩列で修正できます（修正は履歴に記録されます）。</p>
            </div>
          </div>
        </div>

        {/* Loading state */}
        {isLoading ? (
          <div className="card overflow-hidden p-0">
            <div className="p-10"><Loading message="読み込み中..." /></div>
          </div>
        ) : (
          <>
            {/* Mobile: Card stack (< sm) */}
            <div className="sm:hidden space-y-2">
              {rows.map((row, index) => {
                const diff = rowDiffs[index];
                const dateApps = applicationsByDate[row.date] || [];
                const dateObj = new Date(row.date);
                const dow = dateObj.getDay();
                const isSunday = dow === 0;
                const isSaturday = dow === 6;
                const hasOvertime = row.overtimeMinutes > 0;
                const shiftLabel = row.shift
                  ? row.shift.isOff
                    ? `休${row.shift.isTentative ? '(仮)' : ''}`
                    : `${row.shift.startTime || '?'} - ${row.shift.endTime || '?'}${row.shift.isTentative ? '(仮)' : ''}`
                  : '';
                const cellDisabled = isLocked;
                const cardBg =
                  diff && diff.hasIssue && dateApps.length === 0 ? 'bg-amber-50/60 border-amber-200' :
                  isSunday || isSaturday ? 'bg-secondary-50/60 border-secondary-200' :
                  'bg-white border-secondary-200';
                return (
                  <div
                    key={row.date}
                    className={`rounded-xl border overflow-hidden ${cardBg}`}
                  >
                    {/* Header: date + shift + 定時ボタン */}
                    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-secondary-100/70">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span className={`text-sm font-bold ${
                          isSunday ? 'text-red-500' : isSaturday ? 'text-blue-500' : 'text-secondary-800'
                        }`}>
                          {selectedMonth}/{formatDateLabel(row.date)}
                        </span>
                        {row.shift ? (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                            row.shift.isTentative
                              ? 'text-secondary-400 border-secondary-200 bg-secondary-50'
                              : row.shift.isOff
                                ? 'text-secondary-600 border-secondary-200 bg-secondary-100'
                                : 'text-secondary-700 border-primary-200 bg-primary-50'
                          }`}>
                            {shiftLabel}
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-secondary-200 bg-secondary-50 text-secondary-300">
                            シフト未登録
                          </span>
                        )}
                      </div>
                      {row.shift && !row.shift.isOff && !row.shift.isTentative && row.shift.startTime && row.shift.endTime && !cellDisabled && (
                        <button
                          type="button"
                          onClick={() => applyScheduledTime(index)}
                          className="shrink-0 inline-flex items-center gap-1 px-3 h-9 text-xs font-bold border border-primary-400 text-primary-700 bg-primary-100 rounded-lg hover:bg-primary-200 active:scale-95 transition-all shadow-sm"
                          title="出勤・退勤を定時で埋める"
                        >
                          <ClockIcon className="w-3.5 h-3.5" />定時で入力
                        </button>
                      )}
                    </div>

                    {/* Body: clock-in/out, break, work/overtime — 横一列 */}
                    <div className="px-3 py-2 space-y-2">
                      <div className="grid grid-cols-4 gap-1.5">
                        <label className="block min-w-0">
                          <span className="block text-[10px] font-medium text-secondary-500 mb-0.5">出勤</span>
                          <input
                            type="time"
                            value={row.clockIn}
                            onChange={e => updateRow(index, 'clockIn', e.target.value)}
                            disabled={cellDisabled}
                            className="w-full h-10 px-1 text-sm text-center border border-secondary-200 rounded-md focus:border-primary-400 focus:ring-2 focus:ring-primary-200 focus:outline-none disabled:bg-secondary-50 disabled:text-secondary-400 bg-white"
                          />
                        </label>
                        <label className="block min-w-0">
                          <span className="block text-[10px] font-medium text-secondary-500 mb-0.5">退勤</span>
                          <input
                            type="time"
                            value={row.clockOut}
                            onChange={e => updateRow(index, 'clockOut', e.target.value)}
                            disabled={cellDisabled}
                            className="w-full h-10 px-1 text-sm text-center border border-secondary-200 rounded-md focus:border-primary-400 focus:ring-2 focus:ring-primary-200 focus:outline-none disabled:bg-secondary-50 disabled:text-secondary-400 bg-white"
                          />
                        </label>
                        <label className="block min-w-0">
                          <span className="block text-[10px] font-medium text-secondary-500 mb-0.5">休憩</span>
                          <input
                            type="number"
                            min={0}
                            max={480}
                            inputMode="numeric"
                            value={
                              !row.clockIn || !row.clockOut
                                ? ''
                                : row.breakMinutesIsManual
                                  ? row.breakMinutes
                                  : (row.breakMinutes || '')
                            }
                            onChange={e => updateRow(index, 'breakMinutes', e.target.value)}
                            disabled={cellDisabled || (!row.clockIn || !row.clockOut)}
                            className={`w-full h-10 px-1 text-sm text-center border rounded-md focus:outline-none ${
                              row.breakMinutesIsManual ? 'border-amber-300 bg-amber-50' : 'border-secondary-200 bg-white'
                            } focus:border-primary-400 focus:ring-2 focus:ring-primary-200 disabled:bg-secondary-50 disabled:text-secondary-300`}
                            placeholder="-"
                            title={row.breakMinutesIsManual ? '手動修正済み' : '法定休憩を自動付与'}
                          />
                        </label>
                        <div className="block min-w-0">
                          <span className="block text-[10px] font-medium text-secondary-500 mb-0.5">実働{hasOvertime ? '/残業' : ''}</span>
                          <div className="h-10 flex flex-col items-center justify-center px-1 rounded-md bg-secondary-50 border border-secondary-100 leading-tight">
                            <span className={`text-sm font-mono ${row.workMinutes > 0 ? 'font-semibold text-secondary-800' : 'text-secondary-300'}`}>
                              {formatMinutes(row.workMinutes)}
                            </span>
                            {hasOvertime && (
                              <span className="text-[9px] font-semibold text-amber-600">
                                残{formatMinutes(row.overtimeMinutes)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Diff / Application */}
                      {diff && diff.hasIssue && (
                        <div>
                          <span className="block text-xs font-medium text-secondary-500 mb-1.5">差異 / 申請</span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {diff.kinds.map(kind => {
                              const matched = findRelevantApp(dateApps, kind);
                              if (!matched || matched.status === 'rejected') {
                                return (
                                  <div key={kind} className="flex items-center gap-1 flex-wrap">
                                    {matched && (
                                      <>
                                        <ShiftDiffKindBadge kind={kind} />
                                        <ApplicationStatusBadge status={matched.status} />
                                      </>
                                    )}
                                    <button
                                      onClick={() => {
                                        setAppModalDate(row.date);
                                        setAppModalDiff(diff);
                                        setAppModalKind(kind);
                                      }}
                                      disabled={cellDisabled}
                                      className="inline-flex items-center gap-1 h-9 px-3 text-xs font-medium border border-amber-300 text-amber-700 bg-amber-50 rounded-full hover:bg-amber-100 transition-colors disabled:opacity-50"
                                    >
                                      <Send className="w-3 h-3" />
                                      {matched ? '再申請' : '申請'}
                                    </button>
                                  </div>
                                );
                              }
                              return (
                                <div key={kind} className="flex items-center gap-1">
                                  <ShiftDiffKindBadge kind={kind} />
                                  <ApplicationStatusBadge status={matched.status} />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Remarks */}
                      <label className="block">
                        <span className="block text-[10px] font-medium text-secondary-500 mb-0.5">備考</span>
                        <input
                          type="text"
                          value={row.remarks}
                          onChange={e => updateRow(index, 'remarks', e.target.value)}
                          disabled={cellDisabled}
                          className="w-full h-10 px-2 text-sm border border-secondary-200 rounded-md focus:border-primary-400 focus:ring-2 focus:ring-primary-200 focus:outline-none disabled:bg-secondary-50 disabled:text-secondary-400 bg-white"
                          placeholder="-"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tablet+: Table (>= sm) */}
            <div className="card overflow-hidden p-0 hidden sm:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px]">
                  <thead>
                    <tr className="bg-gradient-to-r from-secondary-800 to-secondary-900 text-white">
                      <th className="px-3 py-3 text-left text-xs font-semibold w-20">日付</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold w-28">予定（シフト）</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold w-[108px]">出勤</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold w-[108px]">退勤</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold w-20">休憩<span className="font-normal opacity-70">（分）</span></th>
                      <th className="px-3 py-3 text-center text-xs font-semibold w-20">実働</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold w-20">残業</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold">差異 / 申請</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold w-[120px]">備考</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => {
                      const diff = rowDiffs[index];
                      const dateApps = applicationsByDate[row.date] || [];
                      const dateObj = new Date(row.date);
                      const dow = dateObj.getDay();
                      const isSunday = dow === 0;
                      const isSaturday = dow === 6;
                      const hasOvertime = row.overtimeMinutes > 0;
                      const shiftLabel = row.shift
                        ? row.shift.isOff
                          ? `休${row.shift.isTentative ? '(仮)' : ''}`
                          : `${row.shift.startTime || '?'} - ${row.shift.endTime || '?'}${row.shift.isTentative ? '(仮)' : ''}`
                        : '';
                      const cellDisabled = isLocked;
                      return (
                        <tr key={row.date} className={`border-b border-secondary-100 last:border-0 transition-colors ${
                          diff && diff.hasIssue && dateApps.length === 0 ? 'bg-amber-50/40' :
                          isSunday || isSaturday ? 'bg-secondary-50/60' : 'bg-white'
                        } hover:bg-primary-50/30`}>
                          <td className={`px-3 py-2 text-sm whitespace-nowrap ${
                            isSunday ? 'text-red-500 font-semibold' : isSaturday ? 'text-blue-500 font-semibold' : 'text-secondary-800'
                          }`}>
                            {formatDateLabel(row.date)}
                          </td>
                          <td className="px-3 py-2 text-xs whitespace-nowrap">
                            {row.shift ? (
                              <div className="flex items-center gap-1.5">
                                <span className={row.shift.isTentative ? 'text-secondary-400' : 'text-secondary-700'}>
                                  {shiftLabel}
                                </span>
                                {!row.shift.isOff && !row.shift.isTentative && row.shift.startTime && row.shift.endTime && !cellDisabled && (
                                  <button
                                    type="button"
                                    onClick={() => applyScheduledTime(index)}
                                    className="px-1.5 py-0.5 text-[10px] font-semibold border border-primary-300 text-primary-700 bg-primary-50 rounded hover:bg-primary-100 transition-colors"
                                    title="出勤・退勤を定時で埋める"
                                  >
                                    定時
                                  </button>
                                )}
                              </div>
                            ) : <span className="text-secondary-300">未登録</span>}
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="time"
                              value={row.clockIn}
                              onChange={e => updateRow(index, 'clockIn', e.target.value)}
                              disabled={cellDisabled}
                              className="w-full py-1.5 px-2.5 text-sm border border-secondary-200 rounded-lg focus:border-primary-400 focus:ring-2 focus:ring-primary-200 focus:outline-none disabled:bg-secondary-50 disabled:text-secondary-400"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="time"
                              value={row.clockOut}
                              onChange={e => updateRow(index, 'clockOut', e.target.value)}
                              disabled={cellDisabled}
                              className="w-full py-1.5 px-2.5 text-sm border border-secondary-200 rounded-lg focus:border-primary-400 focus:ring-2 focus:ring-primary-200 focus:outline-none disabled:bg-secondary-50 disabled:text-secondary-400"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              min={0}
                              max={480}
                              // Show "0" as 0 when manually set to zero; only blank if no clock data yet
                              value={
                                !row.clockIn || !row.clockOut
                                  ? ''
                                  : row.breakMinutesIsManual
                                    ? row.breakMinutes
                                    : (row.breakMinutes || '')
                              }
                              onChange={e => updateRow(index, 'breakMinutes', e.target.value)}
                              disabled={cellDisabled || (!row.clockIn || !row.clockOut)}
                              className={`w-full py-1.5 px-2 text-sm text-center border rounded-lg focus:outline-none ${
                                row.breakMinutesIsManual ? 'border-amber-300 bg-amber-50' : 'border-secondary-200 bg-white'
                              } focus:border-primary-400 focus:ring-2 focus:ring-primary-200 disabled:bg-secondary-50 disabled:text-secondary-300`}
                              placeholder="-"
                              title={row.breakMinutesIsManual ? '手動修正済み' : '法定休憩を自動付与'}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <span className={`text-sm font-mono ${row.workMinutes > 0 ? 'font-semibold text-secondary-800' : 'text-secondary-300'}`}>
                              {formatMinutes(row.workMinutes)}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            {hasOvertime ? (
                              <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                                <AlertTriangle className="w-3 h-3" />{formatMinutes(row.overtimeMinutes)}
                              </span>
                            ) : <span className="text-sm text-secondary-300">-</span>}
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {diff && diff.hasIssue && diff.kinds.map(kind => {
                                const matched = findRelevantApp(dateApps, kind);
                                // No application yet → show 申請 button
                                // Rejected (latest) → also show re-apply button alongside the badge
                                if (!matched || matched.status === 'rejected') {
                                  return (
                                    <div key={kind} className="flex items-center gap-1">
                                      {matched && (
                                        <>
                                          <ShiftDiffKindBadge kind={kind} />
                                          <ApplicationStatusBadge status={matched.status} />
                                        </>
                                      )}
                                      <button
                                        onClick={() => {
                                          setAppModalDate(row.date);
                                          setAppModalDiff(diff);
                                          setAppModalKind(kind);
                                        }}
                                        disabled={cellDisabled}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium border border-amber-300 text-amber-700 bg-amber-50 rounded-full hover:bg-amber-100 transition-colors disabled:opacity-50"
                                      >
                                        <Send className="w-3 h-3" />
                                        {matched ? '再申請' : '申請'}
                                      </button>
                                    </div>
                                  );
                                }
                                return (
                                  <div key={kind} className="flex items-center gap-1">
                                    <ShiftDiffKindBadge kind={kind} />
                                    <ApplicationStatusBadge status={matched.status} />
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              value={row.remarks}
                              onChange={e => updateRow(index, 'remarks', e.target.value)}
                              disabled={cellDisabled}
                              className="w-full py-1.5 px-2.5 text-sm border border-secondary-200 rounded-lg focus:border-primary-400 focus:ring-2 focus:ring-primary-200 focus:outline-none disabled:bg-secondary-50 disabled:text-secondary-400"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ページ末尾のアクション + サマリ（スクロール末尾でも操作できるように） */}
            <div className="mt-6 sm:mt-8 space-y-4">
              {/* アクションボタン */}
              {!isLocked && (
                <div className="card !p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  {hasUnsavedChanges && (
                    <span className="self-start text-sm text-amber-600 inline-flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200">
                      <AlertTriangle className="w-3.5 h-3.5" />未保存の変更あり
                    </span>
                  )}
                  <div className="grid grid-cols-2 sm:flex sm:items-center sm:ml-auto gap-2 w-full sm:w-auto">
                    <button
                      onClick={handleSave}
                      disabled={isSaving || !currentStaffId}
                      className="btn btn-secondary inline-flex items-center justify-center gap-2 min-h-11 whitespace-nowrap"
                    >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      <span>下書き保存</span>
                    </button>
                    {!isAdmin && (
                      <button
                        onClick={() => setShowSubmitModal(true)}
                        disabled={!submissionGate.canSubmit || isSubmitting}
                        className="btn btn-primary inline-flex items-center justify-center gap-2 min-h-11 whitespace-nowrap"
                        title={submissionGate.canSubmit ? '月次提出' : submissionGate.blockingReasons[0]}
                      >
                        <Send className="w-4 h-4" />
                        <span>申請する</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* サマリ */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CalendarDays className="w-4 h-4 text-primary-500" />
                    <span className="text-xs font-medium text-secondary-500">入力済み</span>
                  </div>
                  <div className="text-2xl font-bold text-secondary-800">{filledRowCount}<span className="text-sm text-secondary-400 ml-1">/ {expectedWorkDays}日</span></div>
                </div>
                <div className="card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ClockIcon className="w-4 h-4 text-blue-500" />
                    <span className="text-xs font-medium text-secondary-500">総労働時間</span>
                  </div>
                  <div className="text-2xl font-bold text-secondary-800">{formatMinutes(totalWorkMinutes)}</div>
                </div>
                <div className="card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-medium text-secondary-500">残業時間</span>
                  </div>
                  <div className="text-2xl font-bold text-amber-600">{formatMinutes(totalOvertimeMinutes)}</div>
                </div>
                <div className="card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-primary-500" />
                    <span className="text-xs font-medium text-secondary-500">申請</span>
                  </div>
                  <div className="text-2xl font-bold text-secondary-800">
                    {applications.length}
                    <span className="text-xs text-secondary-400 ml-1">
                      ({applications.filter(a => a.status === 'approved').length}承認/{applications.filter(a => a.status === 'pending').length}待)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Application Modal */}
      <ApplicationModal
        isOpen={!!appModalDate}
        onClose={() => { setAppModalDate(null); setAppModalDiff(null); setAppModalKind(null); }}
        date={appModalDate || ''}
        diff={appModalDiff}
        preselectedType={appModalKind || undefined}
        onSubmit={handleSubmitApplication}
      />

      {/* Submission Modal */}
      <Modal
        isOpen={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        title="月次勤怠を提出する"
        size="md"
      >
        <div className="space-y-4 py-2">
          <p className="text-secondary-700">
            <strong>{selectedYear}年{selectedMonth}月</strong>の勤怠を管理者に提出します。
            提出後は編集できなくなります（差戻時のみ再編集可）。
          </p>
          <div>
            <label className="label">備考（任意）</label>
            <textarea
              value={submissionRemarks}
              onChange={e => setSubmissionRemarks(e.target.value)}
              className="input min-h-[80px] resize-y"
              rows={3}
              placeholder="管理者への申し送り事項があれば記入"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setShowSubmitModal(false)}
              disabled={isSubmitting}
              className="btn btn-secondary flex-1"
            >
              キャンセル
            </button>
            <button
              onClick={handleSubmitMonthly}
              disabled={isSubmitting}
              className="btn btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              提出する
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
