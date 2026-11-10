import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Save,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  Send,
  Lock,
  Info,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  bulkAttendanceApi,
  staffApi,
  shiftApi,
  applicationApi,
  submissionApi,
  readCache,
  writeCache,
} from '../../api';
import type {
  AttendanceRecord,
  Shift,
  BulkAttendanceRow,
  Application,
  ApplicationType,
  MonthlySubmission,
  ShiftDiff,
  ShiftDiffKind,
  StaffInfo,
} from '../../types';
import { Header, Loading, Modal, ApplicationModal, SubmissionStatusBadge, ShiftDiffKindBadge, ApplicationStatusBadge, Spinner } from '../../components/common';
import { formatLocalDate, extractLocalTimeHHMM } from '../../utils/calculations';
import {
  computeWorkAndOvertime,
  calcElapsedMinutes,
  getLegalBreakMinutes,
} from '../../utils/breakCalculator';
import { detectShiftDiff, estimatedPlannedBreak, APPLICATION_TYPE_LABEL } from '../../utils/shiftDiff';

// ---- 日別の行の見た目 ----
// iPhone: 「日付・シフト」/「出勤・退勤・休憩・実働」/「差異・申請」/「備考」の縦並び。
// 幅の広い画面（md 以上）: 日付・出勤・退勤・休憩・実働・備考を 1 行に並べ、差異・申請は 2 行目。
// 時刻欄は 12 時間表記（「07:03 PM」）+ 時計アイコンでも欠けない幅にしておく。
const DAY_COLS_MD = 'md:grid-cols-[7.75rem_7.75rem_7.75rem_4rem_3.75rem_minmax(0,1fr)]';
const DAY_GRID = `grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_3.75rem_3.5rem] ${DAY_COLS_MD}`;
// 入力欄の見出し（幅の広い画面では列の見出しを出すので、読み上げ用にだけ残す）
const DAY_CAPTION = 'mb-1 block px-0.5 t-caption2 font-medium text-label-2 md:sr-only';
// 入力欄（編集できないときは枠を消して、値だけを読みやすく表示する）
const DAY_INPUT = 'input h-11 text-base disabled:bg-transparent disabled:text-label-2 disabled:opacity-100';
const DAY_INPUT_CENTER = `${DAY_INPUT} px-1 text-center tabular`;
// 時刻欄: iPhone の Safari でも値を中央に寄せる。幅の狭い画面では Chrome の時計アイコンを出さず、
// 時刻の表示幅を確保する（タップすれば時刻の選択は開く）。
const DAY_INPUT_TIME = `${DAY_INPUT_CENTER} [&::-webkit-date-and-time-value]:text-center max-md:[&::-webkit-calendar-picker-indicator]:hidden`;
// 小さいボタン（高さ 32px）でも指で押しやすいよう、押せる範囲を上下に 6px ずつ広げる
const SMALL_BTN_HIT = "relative after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']";

// 出勤簿の画面を組み立てるために取得する 4 種類のデータ（前回の表示内容として保存もする）
interface AttendanceLoadData {
  existing: AttendanceRecord[];
  shiftList: Shift[];
  apps: Application[];
  sub: MonthlySubmission | null;
}

export function AttendancePage() {
  const navigate = useNavigate();
  const { staff, isAuthenticated, isAdmin } = useAuth();
  const [searchParams] = useSearchParams();

  // 初期表示月: URL の ?ym=YYYY-MM があればその月で開く（提出リマインドから来た場合は
  // 前月を指定して来るため、当月ではなく提出すべき月が開く）。無ければ当月。
  const initialYm = (() => {
    const ym = searchParams.get('ym');
    const m = ym && /^(\d{4})-(\d{1,2})$/.exec(ym);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      if (mo >= 1 && mo <= 12) return { year: y, month: mo };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  })();
  const [selectedYear, setSelectedYear] = useState(initialYm.year);
  const [selectedMonth, setSelectedMonth] = useState(initialYm.month);
  const [rows, setRows] = useState<BulkAttendanceRow[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [submission, setSubmission] = useState<MonthlySubmission | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // 前回の表示内容を出している間（最新を取得中）は編集・保存・提出をできないようにする
  const [isRefreshing, setIsRefreshing] = useState(false);
  // 月やスタッフを素早く切り替えたとき、前の取得結果で表示を上書きしないための通し番号
  const loadSeqRef = useRef(0);
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
  // 取得した 4 種類のデータ（勤怠・シフト・申請・提出状況）から画面の行を組み立てる
  const applyLoaded = useCallback((data: AttendanceLoadData) => {
    const { existing, shiftList, apps, sub } = data;
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
  }, [allDays]);

  // 【高速化】前回の表示内容（保存分）があればすぐ表示し、裏で最新を取得して差し替える。
  // 差し替えまでの間は編集・保存・提出をできないようにする（古い内容に上書きしないため）。
  const loadAll = useCallback(async () => {
    if (!currentStaffId) return;
    const seq = ++loadSeqRef.current;
    const cacheKey = `attendance:${currentStaffId}:${yearMonthStr}`;
    const cached = readCache<AttendanceLoadData>(cacheKey);
    if (cached) {
      applyLoaded(cached);
      setIsLoading(false);
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    try {
      const [attRes, shiftRes, appsRes, subRes] = await Promise.all([
        bulkAttendanceApi.get(currentStaffId, selectedYear, selectedMonth),
        shiftApi.getStaffMonth(currentStaffId, selectedYear, selectedMonth),
        applicationApi.list({ staffId: currentStaffId, yearMonth: yearMonthStr }),
        submissionApi.getStatus(currentStaffId, yearMonthStr),
      ]);
      if (seq !== loadSeqRef.current) return; // その間に別の月・スタッフに切り替わった

      const fresh: AttendanceLoadData = {
        existing: attRes.success && attRes.data ? attRes.data : [],
        shiftList: shiftRes.success && shiftRes.data ? shiftRes.data.shifts : [],
        apps: appsRes.success && appsRes.data ? appsRes.data : [],
        sub: subRes.success && subRes.data ? subRes.data : null,
      };
      applyLoaded(fresh);
      // すべて取得できたときだけ保存する（一部の失敗で空になった内容を次回表示しないため）
      if (attRes.success && shiftRes.success && appsRes.success && subRes.success) {
        writeCache<AttendanceLoadData>(cacheKey, fresh);
      }
    } catch {
      if (seq !== loadSeqRef.current) return;
      setMessage({ type: 'error', text: 'データの取得に失敗しました' });
    } finally {
      if (seq === loadSeqRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [currentStaffId, selectedYear, selectedMonth, yearMonthStr, applyLoaded]);

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

  // 「下書き保存」「申請する」（ページ上部と末尾の両方に置く）
  const actionButtons = (
    <div className={`grid gap-3 ${isAdmin ? 'grid-cols-1' : 'grid-cols-2'}`}>
      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving || !currentStaffId || isRefreshing}
        className={`btn ${isAdmin ? 'btn-filled' : 'btn-gray'}`}
      >
        {isSaving ? <Spinner size={18} className="!text-current" /> : <Save aria-hidden="true" />}
        下書き保存
      </button>
      {!isAdmin && (
        <button
          type="button"
          onClick={() => setShowSubmitModal(true)}
          disabled={!submissionGate.canSubmit || isSubmitting || isRefreshing}
          className="btn btn-filled"
          title={submissionGate.canSubmit ? '月次提出' : submissionGate.blockingReasons[0]}
        >
          <Send aria-hidden="true" />
          申請する
        </button>
      )}
    </div>
  );

  return (
    <div className="page">
      {isAdmin ? (
        <Header
          title="出勤簿の編集"
          subtitle={currentStaffName ? `${currentStaffName}さん` : undefined}
          backTo="/admin/more"
          backLabel="その他"
          backMobileOnly
        />
      ) : (
        <Header title="出勤簿" subtitle={currentStaffName ? `${currentStaffName}さん` : undefined} />
      )}

      <main className="page-content">
        {/* 月の切り替え・提出状況・今月の集計 */}
        <section className="card" aria-label="表示する月と今月の集計">
          <div className="flex items-center justify-center gap-1">
            <button
              type="button"
              onClick={handlePreviousMonth}
              className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full text-tint transition-colors hover:bg-fill active:bg-fill-2"
              aria-label="前の月"
            >
              <ChevronLeft className="h-6 w-6" strokeWidth={2.4} aria-hidden="true" />
            </button>
            <h2 className="min-w-[7.5em] text-center t-title3 tabular" aria-live="polite">
              {selectedYear}年{selectedMonth}月
            </h2>
            <button
              type="button"
              onClick={handleNextMonth}
              className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full text-tint transition-colors hover:bg-fill active:bg-fill-2"
              aria-label="次の月"
            >
              <ChevronRight className="h-6 w-6" strokeWidth={2.4} aria-hidden="true" />
            </button>
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
            <SubmissionStatusBadge status={submissionStatus} />
            {isRefreshing && (
              <span className="pill pill-neutral" role="status">
                <Spinner size={12} />
                最新の内容を確認しています…
              </span>
            )}
            {hasUnsavedChanges && !isLocked && (
              <span className="pill pill-warning">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                未保存
              </span>
            )}
            {isLocked && (
              <span className="pill pill-neutral">
                <Lock className="h-3 w-3" aria-hidden="true" />
                編集ロック中
              </span>
            )}
          </div>

          {!isLoading && (
            <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="tile">
                <dt className="t-footnote text-label-2">入力済み</dt>
                <dd className="mt-0.5 t-title3 tabular">
                  {filledRowCount}
                  <span className="ml-1 t-footnote font-normal text-label-2">/ {expectedWorkDays}日</span>
                </dd>
              </div>
              <div className="tile">
                <dt className="t-footnote text-label-2">総労働時間</dt>
                <dd className="mt-0.5 t-title3 tabular">{formatMinutes(totalWorkMinutes)}</dd>
              </div>
              <div className="tile">
                <dt className="t-footnote text-label-2">残業時間</dt>
                <dd className={`mt-0.5 t-title3 tabular ${totalOvertimeMinutes > 0 ? 'text-warning' : ''}`}>
                  {formatMinutes(totalOvertimeMinutes)}
                </dd>
              </div>
              <div className="tile">
                <dt className="t-footnote text-label-2">申請</dt>
                <dd className="mt-0.5 t-title3 tabular">
                  {applications.length}
                  <span className="ml-1 t-footnote font-normal text-label-2">
                    ({applications.filter(a => a.status === 'approved').length}承認/{applications.filter(a => a.status === 'pending').length}待)
                  </span>
                </dd>
              </div>
            </dl>
          )}
        </section>

        {/* 差戻しの理由 */}
        {submission?.rejectionReason && (
          <div className="callout callout-danger mt-3">
            <AlertCircle aria-hidden="true" />
            <p className="min-w-0 break-words">
              <span className="font-semibold">差戻理由:</span> {submission.rejectionReason}
            </p>
          </div>
        )}

        {/* 操作（上部） */}
        {!isLocked && <div className="mt-4">{actionButtons}</div>}

        {/* 結果のお知らせ */}
        {message && (
          <div
            className={`callout mt-3 ${message.type === 'success' ? 'callout-success' : 'callout-danger'}`}
            role={message.type === 'error' ? 'alert' : 'status'}
          >
            {message.type === 'success' ? <CheckCircle aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
            <p className="font-medium break-words">{message.text}</p>
          </div>
        )}

        {/* 提出できない理由 */}
        {!isLocked && submissionGate.blockingReasons.length > 0 && (
          <div className="callout callout-warning mt-3">
            <AlertTriangle aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">提出する前に以下に対応してください</p>
              <ul className="mt-1 space-y-0.5 t-footnote tabular break-words">
                {submissionGate.blockingReasons.slice(0, 8).map((r, i) => (
                  <li key={i} className="pl-[1em] -indent-[1em]">・{r}</li>
                ))}
                {submissionGate.blockingReasons.length > 8 && (
                  <li className="pl-[1em] -indent-[1em]">・ほか {submissionGate.blockingReasons.length - 8} 件</li>
                )}
              </ul>
            </div>
          </div>
        )}

        {/* 入力のしかた */}
        <div className="callout callout-tint mt-3">
          <Info aria-hidden="true" />
          <div className="min-w-0 space-y-1">
            <p>シフトと差異がある日は<strong className="font-semibold text-warning">申請が必要</strong>です。理由を添えて申請してください。</p>
            <p className="t-footnote text-label-2">
              休憩は<strong className="font-semibold text-label">法定通り自動付与</strong>されます。実態と異なる場合は休憩欄で修正できます（修正は履歴に記録されます）。
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="card mt-6 py-10">
            <Loading message="読み込み中..." />
          </div>
        ) : (
          <>
            {/* 日別の勤怠 */}
            <section className="section" aria-labelledby="attendance-days-heading">
              <h2 id="attendance-days-heading" className="section-header md:sr-only">日別の勤怠</h2>
              {/* 幅の広い画面だけ、列の見出しを出す（各入力欄には個別のラベルがある） */}
              <div aria-hidden="true" className={`hidden gap-x-2 whitespace-nowrap px-4 pb-1.5 t-footnote font-medium text-label-2 md:grid ${DAY_COLS_MD}`}>
                <span>日付</span>
                <span className="text-center">出勤</span>
                <span className="text-center">退勤</span>
                <span className="text-center">休憩（分）</span>
                <span className="text-center">実働</span>
                <span className="pl-3">備考</span>
              </div>
              <div className="list-group">
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
                  const cellDisabled = isLocked || isRefreshing;
                  return (
                    <div
                      key={row.date}
                      role="group"
                      aria-label={`${selectedMonth}/${formatDateLabel(row.date)}`}
                      className={`list-row ${DAY_GRID} items-center gap-x-2 gap-y-2.5 py-3 ${
                        diff && diff.hasIssue && dateApps.length === 0 ? 'bg-warning-fill/50' : ''
                      }`}
                    >
                      {/* 日付・シフト・定時で入力 */}
                      <div className="col-span-4 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 md:col-span-1">
                        <span
                          className={`text-[17px] font-semibold leading-snug tabular md:text-[15px] ${
                            isSunday ? 'text-danger' : isSaturday ? 'text-info' : 'text-label'
                          }`}
                        >
                          <span className="md:hidden">{selectedMonth}/</span>
                          {formatDateLabel(row.date)}
                        </span>
                        <span className="md:order-last md:basis-full">
                          {row.shift ? (
                            <span
                              className={`pill tabular ${
                                row.shift.isTentative
                                  ? 'text-label-2 ring-1 ring-inset ring-separator'
                                  : row.shift.isOff
                                    ? 'pill-neutral'
                                    : 'pill-tint'
                              }`}
                            >
                              {shiftLabel}
                            </span>
                          ) : (
                            <span className="t-caption text-label-3">シフト未登録</span>
                          )}
                        </span>
                        {row.shift && !row.shift.isOff && !row.shift.isTentative && row.shift.startTime && row.shift.endTime && !cellDisabled && (
                          <button
                            type="button"
                            onClick={() => applyScheduledTime(index)}
                            className={`btn btn-sm btn-tinted ml-auto md:px-2.5 ${SMALL_BTN_HIT}`}
                            title="出勤・退勤を定時で埋める"
                          >
                            <span>定時<span className="md:hidden">で入力</span></span>
                          </button>
                        )}
                      </div>

                      <label className="min-w-0">
                        <span className={DAY_CAPTION}>出勤</span>
                        <input
                          type="time"
                          value={row.clockIn}
                          onChange={e => updateRow(index, 'clockIn', e.target.value)}
                          disabled={cellDisabled}
                          className={DAY_INPUT_TIME}
                        />
                      </label>
                      <label className="min-w-0">
                        <span className={DAY_CAPTION}>退勤</span>
                        <input
                          type="time"
                          value={row.clockOut}
                          onChange={e => updateRow(index, 'clockOut', e.target.value)}
                          disabled={cellDisabled}
                          className={DAY_INPUT_TIME}
                        />
                      </label>
                      <label className="min-w-0">
                        <span className={DAY_CAPTION}>休憩（分）</span>
                        <input
                          type="number"
                          min={0}
                          max={480}
                          inputMode="numeric"
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
                          className={`${DAY_INPUT_CENTER} ${
                            row.breakMinutesIsManual ? '!bg-warning-fill font-semibold !text-warning' : ''
                          }`}
                          placeholder="-"
                          title={row.breakMinutesIsManual ? '手動修正済み' : '法定休憩を自動付与'}
                        />
                      </label>
                      <div className="min-w-0">
                        <span className={DAY_CAPTION}>実働{hasOvertime ? '/残業' : ''}</span>
                        <div className="flex h-11 flex-col items-center justify-center leading-tight tabular">
                          <span className={`text-[15px] ${row.workMinutes > 0 ? 'font-semibold text-label' : 'text-label-3'}`}>
                            {formatMinutes(row.workMinutes)}
                          </span>
                          {hasOvertime && (
                            <span className="t-caption2 font-semibold text-warning">
                              残{formatMinutes(row.overtimeMinutes)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 差異 / 申請 */}
                      {diff && diff.hasIssue && (
                        <div className="col-span-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 md:col-span-5 md:col-start-2 md:row-start-2">
                          <span className="t-caption font-medium text-label-2">差異 / 申請</span>
                          {diff.kinds.map(kind => {
                            const matched = findRelevantApp(dateApps, kind);
                            // No application yet → show 申請 button
                            // Rejected (latest) → also show re-apply button alongside the badge
                            if (!matched || matched.status === 'rejected') {
                              return (
                                <div key={kind} className="flex flex-wrap items-center gap-1.5">
                                  <ShiftDiffKindBadge kind={kind} />
                                  {matched && <ApplicationStatusBadge status={matched.status} />}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAppModalDate(row.date);
                                      setAppModalDiff(diff);
                                      setAppModalKind(kind);
                                    }}
                                    disabled={cellDisabled}
                                    className={`btn btn-sm btn-tinted ${SMALL_BTN_HIT}`}
                                  >
                                    <Send aria-hidden="true" />
                                    {matched ? '再申請' : '申請'}
                                  </button>
                                </div>
                              );
                            }
                            return (
                              <div key={kind} className="flex items-center gap-1.5">
                                <ShiftDiffKindBadge kind={kind} />
                                <ApplicationStatusBadge status={matched.status} />
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* 備考 */}
                      <label className="col-span-4 flex min-w-0 items-center gap-3 md:col-span-1 md:col-start-6 md:row-start-1">
                        <span className="flex-shrink-0 t-footnote text-label-2 md:sr-only">備考</span>
                        <input
                          type="text"
                          value={row.remarks}
                          onChange={e => updateRow(index, 'remarks', e.target.value)}
                          disabled={cellDisabled}
                          className={`${DAY_INPUT} min-w-0 flex-1 px-3`}
                          placeholder="-"
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ページ末尾: 今月の合計 + 操作（スクロールした先でも確認・操作できるように） */}
            <section className="section">
              <h2 className="section-header">今月の合計</h2>
              <dl className="list-group">
                <div className="list-row">
                  <dt className="list-row-title t-body">入力済み</dt>
                  <dd className="list-row-detail tabular">
                    {filledRowCount} / {expectedWorkDays}日
                  </dd>
                </div>
                <div className="list-row">
                  <dt className="list-row-title t-body">総労働時間</dt>
                  <dd className="list-row-detail tabular">{formatMinutes(totalWorkMinutes)}</dd>
                </div>
                <div className="list-row">
                  <dt className="list-row-title t-body">残業時間</dt>
                  <dd className={`list-row-detail tabular ${totalOvertimeMinutes > 0 ? 'text-warning' : ''}`}>
                    {formatMinutes(totalOvertimeMinutes)}
                  </dd>
                </div>
                <div className="list-row">
                  <dt className="list-row-title t-body">申請</dt>
                  <dd className="list-row-detail tabular">
                    {applications.length}
                    <span className="ml-1 t-subhead">
                      ({applications.filter(a => a.status === 'approved').length}承認/{applications.filter(a => a.status === 'pending').length}待)
                    </span>
                  </dd>
                </div>
              </dl>
            </section>

            {!isLocked && (
              <div className="mt-6">
                {hasUnsavedChanges && (
                  <p className="mb-3 flex justify-center">
                    <span className="pill pill-warning">
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      未保存の変更あり
                    </span>
                  </p>
                )}
                {actionButtons}
              </div>
            )}
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
        <div className="pt-1">
          <p className="t-body text-label-2">
            <strong className="font-semibold text-label">{selectedYear}年{selectedMonth}月</strong>の勤怠を管理者に提出します。
            提出後は編集できなくなります（差戻時のみ再編集可）。
          </p>
          <label className="mt-5 block">
            <span className="label">備考（任意）</span>
            <textarea
              value={submissionRemarks}
              onChange={e => setSubmissionRemarks(e.target.value)}
              className="input"
              rows={3}
              placeholder="管理者への申し送り事項があれば記入"
            />
          </label>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setShowSubmitModal(false)}
              disabled={isSubmitting}
              className="btn btn-gray"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSubmitMonthly}
              disabled={isSubmitting}
              className="btn btn-filled"
            >
              {isSubmitting ? <Spinner size={18} className="!text-current" /> : <Send aria-hidden="true" />}
              提出する
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
