import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Check,
  X,
  Undo2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { applicationApi, submissionApi, staffApi } from '../../api';
import type {
  Application,
  ApplicationStatus,
  MonthlySubmission,
  StaffInfo,
} from '../../types';
import {
  Header,
  Loading,
  Modal,
  Spinner,
  ApplicationStatusBadge,
  SubmissionStatusBadge,
  ShiftDiffKindBadge,
} from '../../components/common';

// 小さいボタン（高さ 32px）の見た目はそのままに、押せる範囲だけを上下に広げて 44px にする
const SMALL_BUTTON_HIT = 'relative before:absolute before:inset-x-0 before:-inset-y-1.5';

type Tab = 'applications' | 'submissions';
type AppStatusFilter = 'all' | ApplicationStatus;
type RangeMode = 'all' | 'month' | 'range';

// 期間モードのデフォルトの from/to を初期化（過去6ヶ月分）
function defaultRangeFrom(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  d.setDate(1);
  return formatLocalDateOnly(d);
}
function defaultRangeTo(): string {
  const d = new Date();
  return formatLocalDateOnly(d);
}
function formatLocalDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

interface PendingAction {
  kind: 'approve' | 'reject';
  target: 'application' | 'submission';
  applicationId?: string;
  staffId?: string;
  staffName?: string;
  yearMonth?: string;
  date?: string;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function formatDateWithDow(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const dow = WEEKDAYS[d.getDay()];
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} (${dow})`;
}

function formatYearMonth(ym: string): string {
  const [y, m] = ym.split('-');
  if (!y || !m) return ym;
  return `${y}年${Number(m)}月`;
}

export function AdminApprovalsPage() {
  const navigate = useNavigate();
  const { admin, isAdmin, isAuthenticated } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>('applications');

  // Auth guard
  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      navigate('/');
    }
  }, [isAuthenticated, isAdmin, navigate]);

  // Filters
  const today = new Date();
  // デフォルトは「全期間」。ユーザー要望により、月単位・期間指定での絞り込みも選べる。
  const [rangeMode, setRangeMode] = useState<RangeMode>('all');
  const [filterYear, setFilterYear] = useState(today.getFullYear());
  const [filterMonth, setFilterMonth] = useState(today.getMonth() + 1);
  const [rangeFrom, setRangeFrom] = useState<string>(defaultRangeFrom());
  const [rangeTo, setRangeTo] = useState<string>(defaultRangeTo());
  const [appStatusFilter, setAppStatusFilter] = useState<AppStatusFilter>('all');
  const [staffIdFilter, setStaffIdFilter] = useState<string>('');

  // Data
  const [staffList, setStaffList] = useState<StaffInfo[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [submissions, setSubmissions] = useState<MonthlySubmission[]>([]);

  const [isLoadingStaff, setIsLoadingStaff] = useState(true);
  const [isLoadingApps, setIsLoadingApps] = useState(true);
  const [isLoadingSubs, setIsLoadingSubs] = useState(true);

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modals
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const yearMonthStr = `${filterYear}-${String(filterMonth).padStart(2, '0')}`;

  const reviewedBy = admin?.adminId || '';

  // Load staff list
  useEffect(() => {
    (async () => {
      setIsLoadingStaff(true);
      try {
        const res = await staffApi.getList();
        if (res.success && res.data) {
          setStaffList(res.data);
        }
      } catch {
        // Non-blocking
      } finally {
        setIsLoadingStaff(false);
      }
    })();
  }, []);

  // Load applications based on filters
  // rangeMode='month' の場合のみ API レベルで yearMonth を絞る。
  // 'all' / 'range' は全件取得して、必要なら client 側で from-to で絞る。
  const reloadApplications = useCallback(async () => {
    setIsLoadingApps(true);
    try {
      const params: Parameters<typeof applicationApi.list>[0] = {};
      if (rangeMode === 'month') {
        params.yearMonth = yearMonthStr;
      }
      if (appStatusFilter !== 'all') {
        params.status = appStatusFilter;
      }
      if (staffIdFilter) {
        params.staffId = staffIdFilter;
      }
      const res = await applicationApi.list(params);
      let list = res.success && res.data ? res.data : [];
      if (rangeMode === 'range') {
        list = list.filter(a => a.date >= rangeFrom && a.date <= rangeTo);
      }
      setApplications(list);
    } catch {
      setApplications([]);
    } finally {
      setIsLoadingApps(false);
    }
  }, [rangeMode, yearMonthStr, appStatusFilter, staffIdFilter, rangeFrom, rangeTo]);

  useEffect(() => {
    reloadApplications();
    // 30 秒ごとに自動再フェッチ + タブ復帰時に即時更新
    const intervalId = setInterval(reloadApplications, 30 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') reloadApplications(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', reloadApplications);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', reloadApplications);
    };
  }, [reloadApplications]);

  // 月次提出はダッシュボードのカウントと整合させるため、未承認は全月を対象に取得する。
  // 月フィルタは「処理済み」一覧の絞り込みにのみ効かせる。
  const reloadSubmissions = useCallback(async () => {
    setIsLoadingSubs(true);
    try {
      const res = await submissionApi.list();
      if (res.success && res.data) {
        setSubmissions(res.data);
      } else {
        setSubmissions([]);
      }
    } catch {
      setSubmissions([]);
    } finally {
      setIsLoadingSubs(false);
    }
  }, []);

  useEffect(() => {
    reloadSubmissions();
    // 30 秒ごとに自動再フェッチ + タブ復帰 / フォーカス時に即時更新
    // （スタッフの新規月次提出が管理者画面にリアルタイム反映されるよう）
    const intervalId = setInterval(reloadSubmissions, 30 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') reloadSubmissions(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', reloadSubmissions);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', reloadSubmissions);
    };
  }, [reloadSubmissions]);

  // Month navigation
  const goPrevMonth = () => {
    if (filterMonth === 1) {
      setFilterYear(y => y - 1);
      setFilterMonth(12);
    } else {
      setFilterMonth(m => m - 1);
    }
  };
  const goNextMonth = () => {
    if (filterMonth === 12) {
      setFilterYear(y => y + 1);
      setFilterMonth(1);
    } else {
      setFilterMonth(m => m + 1);
    }
  };

  // Sorted application groups
  const { pendingApps, processedApps } = useMemo(() => {
    const sorted = [...applications].sort((a, b) => (a.date < b.date ? 1 : -1));
    return {
      pendingApps: sorted.filter(a => a.status === 'pending'),
      processedApps: sorted.filter(a => a.status !== 'pending'),
    };
  }, [applications]);

  const { submittedSubs, processedSubs } = useMemo(() => {
    const sorted = [...submissions].sort((a, b) => {
      // 直近月優先 → スタッフ名昇順
      if (a.yearMonth !== b.yearMonth) return a.yearMonth < b.yearMonth ? 1 : -1;
      const an = a.staffName || '';
      const bn = b.staffName || '';
      return an.localeCompare(bn, 'ja');
    });

    // 期間モードに応じた処理済みフィルタ:
    //   - all:   全件
    //   - month: yearMonth が選択月と一致
    //   - range: yearMonth 月の初日が from-to の範囲内
    const passProcessed = (sub: MonthlySubmission): boolean => {
      if (sub.status !== 'approved' && sub.status !== 'rejected') return false;
      if (rangeMode === 'all') return true;
      if (rangeMode === 'month') return sub.yearMonth === yearMonthStr;
      // range
      const monthStart = sub.yearMonth + '-01';
      return monthStart >= rangeFrom && monthStart <= rangeTo;
    };

    return {
      // 未承認は常に全期間表示（ダッシュボードのカウントと一致させる）
      submittedSubs: sorted.filter(s => s.status === 'submitted'),
      processedSubs: sorted.filter(passProcessed),
    };
  }, [submissions, rangeMode, yearMonthStr, rangeFrom, rangeTo]);

  // Action handlers
  const openApprove = (action: PendingAction) => {
    setPendingAction(action);
    setRejectionReason('');
    setActionError(null);
  };

  const openReject = (action: PendingAction) => {
    setPendingAction(action);
    setRejectionReason('');
    setActionError(null);
  };

  const closeModal = () => {
    if (isProcessing) return;
    setPendingAction(null);
    setRejectionReason('');
    setActionError(null);
  };

  const handleConfirm = async () => {
    if (!pendingAction) return;
    setActionError(null);
    setIsProcessing(true);
    try {
      if (pendingAction.target === 'application') {
        const id = pendingAction.applicationId;
        if (!id) throw new Error('申請IDが不正です');
        if (pendingAction.kind === 'approve') {
          const res = await applicationApi.approve(id, reviewedBy);
          if (!res.success) {
            setActionError(res.error || '承認に失敗しました');
            return;
          }
          setMessage({ type: 'success', text: '申請を承認しました' });
        } else {
          if (!rejectionReason.trim()) {
            setActionError('却下理由を入力してください');
            return;
          }
          const res = await applicationApi.reject(id, reviewedBy, rejectionReason.trim());
          if (!res.success) {
            setActionError(res.error || '却下に失敗しました');
            return;
          }
          setMessage({ type: 'success', text: '申請を却下しました' });
        }
        await reloadApplications();
      } else {
        const sId = pendingAction.staffId;
        const ym = pendingAction.yearMonth;
        if (!sId || !ym) throw new Error('対象が不正です');
        if (pendingAction.kind === 'approve') {
          const res = await submissionApi.approve(sId, ym, reviewedBy);
          if (!res.success) {
            setActionError(res.error || '確定に失敗しました');
            return;
          }
          setMessage({ type: 'success', text: '月次提出を確定しました' });
        } else {
          if (!rejectionReason.trim()) {
            setActionError('差戻し理由を入力してください');
            return;
          }
          const res = await submissionApi.reject(sId, ym, reviewedBy, rejectionReason.trim());
          if (!res.success) {
            setActionError(res.error || '差戻しに失敗しました');
            return;
          }
          setMessage({ type: 'success', text: '月次提出を差し戻しました' });
        }
        await reloadSubmissions();
      }
      setPendingAction(null);
      setRejectionReason('');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '処理に失敗しました');
    } finally {
      setIsProcessing(false);
    }
  };

  // Auto-clear flash message
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 3500);
    return () => clearTimeout(t);
  }, [message]);

  // ===== UI =====
  const renderApplicationCard = (app: Application) => {
    const isPending = app.status === 'pending';
    return (
      <div
        key={app.id}
        className="list-row flex-col items-stretch gap-3 py-3.5 sm:flex-row sm:items-start sm:gap-4"
      >
        <div className="min-w-0 flex-1 space-y-2.5">
          <div>
            <p className="t-headline break-words">{app.staffName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="t-footnote text-label-2 tabular">
                {formatDateWithDow(app.date)}
              </span>
              <ShiftDiffKindBadge kind={app.type} />
              <ApplicationStatusBadge status={app.status} />
            </div>
          </div>

          {app.reason && (
            <p className="t-subhead">
              <span className="text-label-2">理由：</span>
              <span className="whitespace-pre-wrap break-words">{app.reason}</span>
            </p>
          )}

          {(app.details.plannedStart ||
            app.details.actualStart ||
            app.details.overtimeMinutes !== undefined ||
            app.details.plannedBreak !== undefined ||
            app.details.actualBreak !== undefined) && (
            <dl className="tile grid grid-cols-2 gap-x-4 gap-y-2 !py-2.5 sm:grid-cols-3">
              {app.details.plannedStart && app.details.plannedEnd && (
                <div>
                  <dt className="t-caption text-label-2">予定</dt>
                  <dd className="t-subhead tabular">
                    {app.details.plannedStart} - {app.details.plannedEnd}
                  </dd>
                </div>
              )}
              {app.details.actualStart && app.details.actualEnd && (
                <div>
                  <dt className="t-caption text-label-2">実績</dt>
                  <dd className="t-subhead tabular">
                    {app.details.actualStart} - {app.details.actualEnd}
                  </dd>
                </div>
              )}
              {app.details.overtimeMinutes !== undefined &&
                app.details.overtimeMinutes > 0 && (
                  <div>
                    <dt className="t-caption text-label-2">残業</dt>
                    <dd className="t-subhead tabular">{app.details.overtimeMinutes}分</dd>
                  </div>
                )}
              {app.details.plannedBreak !== undefined && (
                <div>
                  <dt className="t-caption text-label-2">予定休憩</dt>
                  <dd className="t-subhead tabular">{app.details.plannedBreak}分</dd>
                </div>
              )}
              {app.details.actualBreak !== undefined && (
                <div>
                  <dt className="t-caption text-label-2">実績休憩</dt>
                  <dd className="t-subhead tabular">{app.details.actualBreak}分</dd>
                </div>
              )}
            </dl>
          )}

          {app.status === 'rejected' && app.rejectionReason && (
            <div className="callout callout-danger">
              <XCircle aria-hidden="true" />
              <p className="break-words">
                <span className="font-semibold">却下理由：</span>
                {app.rejectionReason}
              </p>
            </div>
          )}

          {app.reviewedAt && (
            <p className="t-caption text-label-2 tabular">
              処理日時: {new Date(app.reviewedAt).toLocaleString('ja-JP')}
            </p>
          )}
        </div>

        {isPending && (
          <div className="flex justify-end gap-2 sm:shrink-0">
            <button
              type="button"
              onClick={() =>
                openApprove({
                  kind: 'approve',
                  target: 'application',
                  applicationId: app.id,
                  staffName: app.staffName,
                  date: app.date,
                })
              }
              className={`btn btn-sm btn-filled ${SMALL_BUTTON_HIT}`}
            >
              <Check aria-hidden="true" />
              承認
            </button>
            <button
              type="button"
              onClick={() =>
                openReject({
                  kind: 'reject',
                  target: 'application',
                  applicationId: app.id,
                  staffName: app.staffName,
                  date: app.date,
                })
              }
              className={`btn btn-sm btn-danger-tinted ${SMALL_BUTTON_HIT}`}
            >
              <X aria-hidden="true" />
              却下
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderSubmissionCard = (sub: MonthlySubmission) => {
    const isSubmitted = sub.status === 'submitted';
    const [yStr, mStr] = sub.yearMonth.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    return (
      <div
        key={`${sub.staffId}-${sub.yearMonth}`}
        className="list-row flex-col items-stretch gap-3 py-3.5 sm:flex-row sm:items-center sm:gap-4"
      >
        <div className="min-w-0 flex-1 space-y-2.5">
          <div>
            <p className="t-headline break-words">{sub.staffName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="t-footnote text-label-2 tabular">
                {formatYearMonth(sub.yearMonth)}
              </span>
              <SubmissionStatusBadge status={sub.status} />
            </div>
          </div>

          {sub.remarks && (
            <p className="t-subhead">
              <span className="text-label-2">備考：</span>
              <span className="whitespace-pre-wrap break-words">{sub.remarks}</span>
            </p>
          )}

          {sub.status === 'rejected' && sub.rejectionReason && (
            <div className="callout callout-danger">
              <Undo2 aria-hidden="true" />
              <p className="break-words">
                <span className="font-semibold">差戻し理由：</span>
                {sub.rejectionReason}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 t-caption text-label-2 tabular">
            {sub.submittedAt && (
              <span>提出: {new Date(sub.submittedAt).toLocaleString('ja-JP')}</span>
            )}
            {sub.reviewedAt && (
              <span>処理: {new Date(sub.reviewedAt).toLocaleString('ja-JP')}</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap">
          <Link
            to={`/admin/attendance/edit?staffId=${sub.staffId}&year=${y}&month=${m}`}
            className={`btn btn-sm btn-gray ${SMALL_BUTTON_HIT}`}
          >
            <FileText aria-hidden="true" />
            出勤簿を確認
          </Link>

          {isSubmitted && (
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() =>
                  openApprove({
                    kind: 'approve',
                    target: 'submission',
                    staffId: sub.staffId,
                    staffName: sub.staffName,
                    yearMonth: sub.yearMonth,
                  })
                }
                className={`btn btn-sm btn-filled ${SMALL_BUTTON_HIT}`}
              >
                <Check aria-hidden="true" />
                確定
              </button>
              <button
                type="button"
                onClick={() =>
                  openReject({
                    kind: 'reject',
                    target: 'submission',
                    staffId: sub.staffId,
                    staffName: sub.staffName,
                    yearMonth: sub.yearMonth,
                  })
                }
                className={`btn btn-sm btn-danger-tinted ${SMALL_BUTTON_HIT}`}
              >
                <Undo2 aria-hidden="true" />
                差戻し
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const isModalOpen = pendingAction !== null;
  const modalIsApprove = pendingAction?.kind === 'approve';
  const modalIsApplication = pendingAction?.target === 'application';

  const modalTitle = modalIsApprove
    ? modalIsApplication
      ? '申請を承認しますか？'
      : '月次提出を確定しますか？'
    : modalIsApplication
      ? '申請を却下'
      : '月次提出を差戻し';

  return (
    <div className="page">
      <Header title="承認" />

      <main className="page-content">
        {/* Flash message */}
        {message && (
          <div
            className={`callout mt-2 mb-3 ${
              message.type === 'success' ? 'callout-success' : 'callout-danger'
            }`}
            role={message.type === 'error' ? 'alert' : 'status'}
          >
            {message.type === 'success' ? (
              <CheckCircle2 aria-hidden="true" />
            ) : (
              <AlertTriangle aria-hidden="true" />
            )}
            <p className="font-medium break-words">{message.text}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="segmented mt-2" role="tablist" aria-label="承認する内容">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'applications'}
            onClick={() => setActiveTab('applications')}
            className="segmented-item flex items-center justify-center gap-1.5"
          >
            申請一覧
            {pendingApps.length > 0 && activeTab !== 'applications' && (
              <span className="count-badge">{pendingApps.length}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'submissions'}
            onClick={() => setActiveTab('submissions')}
            className="segmented-item flex items-center justify-center gap-1.5"
          >
            月次提出
            {submittedSubs.length > 0 && activeTab !== 'submissions' && (
              <span className="count-badge">{submittedSubs.length}</span>
            )}
          </button>
        </div>

        {/* Filters */}
        <section className="section">
          <h2 className="section-header">絞り込み</h2>
          <div className="card grid gap-4 md:grid-cols-2">
            {/* 期間モード */}
            <div>
              <p className="label">期間</p>
              <div className="segmented" role="tablist" aria-label="期間">
                <button
                  type="button"
                  role="tab"
                  aria-selected={rangeMode === 'all'}
                  onClick={() => setRangeMode('all')}
                  className="segmented-item"
                >
                  全期間
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={rangeMode === 'month'}
                  onClick={() => setRangeMode('month')}
                  className="segmented-item"
                >
                  月で指定
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={rangeMode === 'range'}
                  onClick={() => setRangeMode('range')}
                  className="segmented-item"
                >
                  期間で指定
                </button>
              </div>
            </div>

            {/* 月指定モード: 月ピッカー */}
            {rangeMode === 'month' && (
              <div>
                <p className="label">対象月</p>
                <div className="flex items-center rounded-[10px] bg-fill">
                  <button
                    type="button"
                    onClick={goPrevMonth}
                    className="grid h-11 w-11 flex-shrink-0 place-items-center text-tint active:opacity-60"
                    aria-label="前月へ"
                  >
                    <ChevronLeft className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
                  </button>
                  <p className="flex-1 text-center t-body font-semibold tabular">
                    {filterYear}年{filterMonth}月
                  </p>
                  <button
                    type="button"
                    onClick={goNextMonth}
                    className="grid h-11 w-11 flex-shrink-0 place-items-center text-tint active:opacity-60"
                    aria-label="翌月へ"
                  >
                    <ChevronRight className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}

            {/* 期間指定モード: from / to */}
            {rangeMode === 'range' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block min-w-0">
                  <span className="label">開始日</span>
                  <input
                    type="date"
                    value={rangeFrom}
                    max={rangeTo}
                    onChange={e => setRangeFrom(e.target.value)}
                    className="input"
                  />
                </label>
                <label className="block min-w-0">
                  <span className="label">終了日</span>
                  <input
                    type="date"
                    value={rangeTo}
                    min={rangeFrom}
                    onChange={e => setRangeTo(e.target.value)}
                    className="input"
                  />
                </label>
              </div>
            )}

            {/* ステータス (申請一覧タブのみ) */}
            {activeTab === 'applications' && (
              <div>
                <p className="label">ステータス</p>
                <div className="segmented" role="tablist" aria-label="ステータス">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={appStatusFilter === 'all'}
                    onClick={() => setAppStatusFilter('all')}
                    className="segmented-item"
                  >
                    全て
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={appStatusFilter === 'pending'}
                    onClick={() => setAppStatusFilter('pending')}
                    className="segmented-item"
                  >
                    承認待ち
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={appStatusFilter === 'approved'}
                    onClick={() => setAppStatusFilter('approved')}
                    className="segmented-item"
                  >
                    承認済み
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={appStatusFilter === 'rejected'}
                    onClick={() => setAppStatusFilter('rejected')}
                    className="segmented-item"
                  >
                    却下
                  </button>
                </div>
              </div>
            )}

            {/* スタッフ (申請一覧タブのみ) */}
            {activeTab === 'applications' && (
              <label className="block">
                <span className="label">スタッフ</span>
                <select
                  value={staffIdFilter}
                  onChange={e => setStaffIdFilter(e.target.value)}
                  className="input"
                  disabled={isLoadingStaff}
                >
                  <option value="">全員</option>
                  {staffList.map(s => (
                    <option key={s.staffId} value={s.staffId}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </section>

        {/* Applications tab */}
        {activeTab === 'applications' && (
          <>
            <section className="section">
              <h2 className="section-header">
                承認待ち
                <span className="tabular">{pendingApps.length}件</span>
              </h2>
              <div className="list-group">
                {isLoadingApps ? (
                  <div className="list-row justify-center py-6">
                    <Loading />
                  </div>
                ) : pendingApps.length === 0 ? (
                  <div className="list-row flex-col gap-2 py-8 text-center">
                    <CheckCircle2 className="h-9 w-9 text-label-4" aria-hidden="true" />
                    <p className="t-subhead text-label-2">承認待ちの申請はありません</p>
                  </div>
                ) : (
                  pendingApps.map(renderApplicationCard)
                )}
              </div>
            </section>

            <section className="section">
              <h2 className="section-header">
                処理済み
                <span className="tabular">{processedApps.length}件</span>
              </h2>
              <div className="list-group">
                {isLoadingApps ? (
                  <div className="list-row justify-center py-6">
                    <Loading />
                  </div>
                ) : processedApps.length === 0 ? (
                  <div className="list-row justify-center py-6 text-center">
                    <p className="t-subhead text-label-2">処理済みの申請はありません</p>
                  </div>
                ) : (
                  processedApps.map(renderApplicationCard)
                )}
              </div>
            </section>
          </>
        )}

        {/* Submissions tab */}
        {activeTab === 'submissions' && (
          <>
            <section className="section">
              <h2 className="section-header">
                <span>確認待ち（全期間）</span>
                <span className="flex-shrink-0 tabular">{submittedSubs.length}件</span>
              </h2>
              <div className="list-group">
                {isLoadingSubs ? (
                  <div className="list-row justify-center py-6">
                    <Loading />
                  </div>
                ) : submittedSubs.length === 0 ? (
                  <div className="list-row flex-col gap-2 py-8 text-center">
                    <CheckCircle2 className="h-9 w-9 text-label-4" aria-hidden="true" />
                    <p className="t-subhead text-label-2">確認待ちの月次提出はありません</p>
                  </div>
                ) : (
                  submittedSubs.map(renderSubmissionCard)
                )}
              </div>
            </section>

            <section className="section">
              <h2 className="section-header">
                <span className="min-w-0 tabular">
                  処理済み（{rangeMode === 'all' ? '全期間' : rangeMode === 'month' ? formatYearMonth(yearMonthStr) : `${rangeFrom} 〜 ${rangeTo}`}）
                </span>
                <span className="flex-shrink-0 tabular">{processedSubs.length}件</span>
              </h2>
              <div className="list-group">
                {isLoadingSubs ? (
                  <div className="list-row justify-center py-6">
                    <Loading />
                  </div>
                ) : processedSubs.length === 0 ? (
                  <div className="list-row justify-center py-6 text-center">
                    <p className="t-subhead text-label-2">処理済みの月次提出はありません</p>
                  </div>
                ) : (
                  processedSubs.map(renderSubmissionCard)
                )}
              </div>
            </section>
          </>
        )}
      </main>

      {/* Confirmation / Rejection Modal */}
      <Modal isOpen={isModalOpen} onClose={closeModal} title={modalTitle} size="md">
        {pendingAction && (
          <div className="space-y-4 pt-1">
            <div className="tile">
              <p className="t-headline break-words">{pendingAction.staffName || '-'}</p>
              {pendingAction.target === 'application' && pendingAction.date && (
                <p className="mt-0.5 t-footnote text-label-2 tabular">
                  対象日: {formatDateWithDow(pendingAction.date)}
                </p>
              )}
              {pendingAction.target === 'submission' && pendingAction.yearMonth && (
                <p className="mt-0.5 t-footnote text-label-2 tabular">
                  対象月: {formatYearMonth(pendingAction.yearMonth)}
                </p>
              )}
            </div>

            {modalIsApprove ? (
              <div className="callout callout-success">
                <CheckCircle2 aria-hidden="true" />
                <p>
                  {modalIsApplication
                    ? 'この申請を承認します。承認後は取り消せません。'
                    : 'この月次提出を確定します。確定後はスタッフが編集できなくなります。'}
                </p>
              </div>
            ) : (
              <>
                <div className="callout callout-danger">
                  <AlertTriangle aria-hidden="true" />
                  <p>
                    {modalIsApplication
                      ? '却下理由はスタッフに通知されます。具体的に記載してください。'
                      : '差戻し理由はスタッフに通知されます。修正してほしい内容を記載してください。'}
                  </p>
                </div>
                <label className="block">
                  <span className="label">
                    {modalIsApplication ? '却下理由' : '差戻し理由'}
                    <span className="ml-1 text-danger">*</span>
                  </span>
                  <textarea
                    value={rejectionReason}
                    onChange={e => setRejectionReason(e.target.value)}
                    placeholder={
                      modalIsApplication
                        ? '例: 該当日のシフトと一致しないため。'
                        : '例: 3/15 の遅刻申請に未承認のものがあります。'
                    }
                    className="input min-h-[100px] resize-y"
                    rows={4}
                  />
                </label>
              </>
            )}

            {actionError && (
              <div className="callout callout-danger" role="alert">
                <XCircle aria-hidden="true" />
                <p className="font-medium break-words">{actionError}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={isProcessing}
                className="btn btn-gray"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={
                  isProcessing ||
                  (!modalIsApprove && !rejectionReason.trim())
                }
                className={`btn ${modalIsApprove ? 'btn-filled' : 'btn-danger'}`}
              >
                {modalIsApprove ? (
                  <>
                    {isProcessing ? <Spinner size={18} className="!text-current" /> : <Check aria-hidden="true" />}
                    {isProcessing
                      ? '処理中...'
                      : modalIsApplication
                        ? '承認する'
                        : '確定する'}
                  </>
                ) : (
                  <>
                    {isProcessing ? (
                      <Spinner size={18} className="!text-current" />
                    ) : modalIsApplication ? (
                      <X aria-hidden="true" />
                    ) : (
                      <Undo2 aria-hidden="true" />
                    )}
                    {isProcessing
                      ? '処理中...'
                      : modalIsApplication
                        ? '却下する'
                        : '差戻す'}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
