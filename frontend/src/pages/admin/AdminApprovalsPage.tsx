import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  Send,
  Clock,
  Filter,
  ChevronLeft,
  ChevronRight,
  User,
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
  ApplicationStatusBadge,
  SubmissionStatusBadge,
  ShiftDiffKindBadge,
} from '../../components/common';

type Tab = 'applications' | 'submissions';
type AppStatusFilter = 'all' | ApplicationStatus;

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
  const [filterYear, setFilterYear] = useState(today.getFullYear());
  const [filterMonth, setFilterMonth] = useState(today.getMonth() + 1);
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
  const reloadApplications = useCallback(async () => {
    setIsLoadingApps(true);
    try {
      const params: Parameters<typeof applicationApi.list>[0] = {
        yearMonth: yearMonthStr,
      };
      if (appStatusFilter !== 'all') {
        params.status = appStatusFilter;
      }
      if (staffIdFilter) {
        params.staffId = staffIdFilter;
      }
      const res = await applicationApi.list(params);
      if (res.success && res.data) {
        setApplications(res.data);
      } else {
        setApplications([]);
      }
    } catch {
      setApplications([]);
    } finally {
      setIsLoadingApps(false);
    }
  }, [yearMonthStr, appStatusFilter, staffIdFilter]);

  useEffect(() => {
    reloadApplications();
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
    return {
      // 未承認は月フィルタを無視し、ダッシュボードのカウントと一致させる
      submittedSubs: sorted.filter(s => s.status === 'submitted'),
      // 処理済みのみ月フィルタを効かせる（履歴ノイズを抑える）
      processedSubs: sorted.filter(
        s => (s.status === 'approved' || s.status === 'rejected') && s.yearMonth === yearMonthStr
      ),
    };
  }, [submissions, yearMonthStr]);

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
        className={`rounded-2xl border p-4 sm:p-5 transition-all ${
          isPending
            ? 'border-amber-200 bg-amber-50/40'
            : 'border-secondary-200 bg-white'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-secondary-800 font-semibold">
                <User className="w-4 h-4 text-secondary-500" />
                {app.staffName}
              </div>
              <span className="text-secondary-300">·</span>
              <span className="text-secondary-700 text-sm font-medium">
                {formatDateWithDow(app.date)}
              </span>
              <ShiftDiffKindBadge kind={app.type} />
              <ApplicationStatusBadge status={app.status} />
            </div>

            {app.reason && (
              <div className="text-sm text-secondary-700 leading-relaxed">
                <span className="font-semibold text-secondary-600">理由：</span>
                <span className="whitespace-pre-wrap">{app.reason}</span>
              </div>
            )}

            {(app.details.plannedStart ||
              app.details.actualStart ||
              app.details.overtimeMinutes !== undefined ||
              app.details.plannedBreak !== undefined ||
              app.details.actualBreak !== undefined) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-secondary-600 bg-secondary-50 border border-secondary-100 rounded-xl px-3 py-2">
                {app.details.plannedStart && app.details.plannedEnd && (
                  <div>
                    <span className="text-secondary-500">予定:</span>{' '}
                    {app.details.plannedStart} - {app.details.plannedEnd}
                  </div>
                )}
                {app.details.actualStart && app.details.actualEnd && (
                  <div>
                    <span className="text-secondary-500">実績:</span>{' '}
                    {app.details.actualStart} - {app.details.actualEnd}
                  </div>
                )}
                {app.details.overtimeMinutes !== undefined &&
                  app.details.overtimeMinutes > 0 && (
                    <div>
                      <span className="text-secondary-500">残業:</span>{' '}
                      {app.details.overtimeMinutes}分
                    </div>
                  )}
                {app.details.plannedBreak !== undefined && (
                  <div>
                    <span className="text-secondary-500">予定休憩:</span>{' '}
                    {app.details.plannedBreak}分
                  </div>
                )}
                {app.details.actualBreak !== undefined && (
                  <div>
                    <span className="text-secondary-500">実績休憩:</span>{' '}
                    {app.details.actualBreak}分
                  </div>
                )}
              </div>
            )}

            {app.status === 'rejected' && app.rejectionReason && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                <span className="font-semibold">却下理由：</span>
                {app.rejectionReason}
              </div>
            )}

            {app.reviewedAt && (
              <div className="text-xs text-secondary-400">
                処理日時: {new Date(app.reviewedAt).toLocaleString('ja-JP')}
              </div>
            )}
          </div>

          {isPending && (
            <div className="flex sm:flex-col gap-2 sm:w-32 shrink-0">
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
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold shadow-sm transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
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
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-red-200 text-red-600 hover:bg-red-50 text-sm font-semibold transition-colors"
              >
                <XCircle className="w-4 h-4" />
                却下
              </button>
            </div>
          )}
        </div>
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
        className={`rounded-2xl border p-4 sm:p-5 transition-all ${
          isSubmitted
            ? 'border-blue-200 bg-blue-50/40'
            : 'border-secondary-200 bg-white'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-secondary-800 font-semibold">
                <User className="w-4 h-4 text-secondary-500" />
                {sub.staffName}
              </div>
              <span className="text-secondary-300">·</span>
              <span className="text-secondary-700 text-sm font-medium">
                {formatYearMonth(sub.yearMonth)}
              </span>
              <SubmissionStatusBadge status={sub.status} />
            </div>

            {sub.remarks && (
              <div className="text-sm text-secondary-700 leading-relaxed">
                <span className="font-semibold text-secondary-600">備考：</span>
                <span className="whitespace-pre-wrap">{sub.remarks}</span>
              </div>
            )}

            {sub.status === 'rejected' && sub.rejectionReason && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                <span className="font-semibold">差戻し理由：</span>
                {sub.rejectionReason}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 text-xs text-secondary-400">
              {sub.submittedAt && (
                <span>提出: {new Date(sub.submittedAt).toLocaleString('ja-JP')}</span>
              )}
              {sub.reviewedAt && (
                <span>処理: {new Date(sub.reviewedAt).toLocaleString('ja-JP')}</span>
              )}
              <Link
                to={`/admin/attendance/edit?staffId=${sub.staffId}&year=${y}&month=${m}`}
                className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium"
              >
                <FileText className="w-3.5 h-3.5" />
                出勤簿を確認
              </Link>
            </div>
          </div>

          {isSubmitted && (
            <div className="flex sm:flex-col gap-2 sm:w-32 shrink-0">
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
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold shadow-sm transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
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
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-red-200 text-red-600 hover:bg-red-50 text-sm font-semibold transition-colors"
              >
                <Send className="w-4 h-4" />
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
    <div className="min-h-screen bg-gradient-to-b from-white to-secondary-100">
      <Header title="承認管理" />

      <main className="max-w-5xl mx-auto p-4 sm:p-6">
        {/* Back link */}
        <Link
          to="/admin"
          className="inline-flex items-center gap-1 text-secondary-500 hover:text-primary-600 mb-4 text-sm font-medium"
        >
          <ChevronLeft className="w-4 h-4" />
          ダッシュボードへ戻る
        </Link>

        {/* Flash message */}
        {message && (
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-xl mb-4 border ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            )}
            <p className="text-sm">{message.text}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="card mb-4 p-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('applications')}
              className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'applications'
                  ? 'bg-gradient-to-r from-primary-400 to-primary-600 text-white shadow-md shadow-primary-500/20'
                  : 'text-secondary-600 hover:bg-secondary-50'
              }`}
            >
              <FileText className="w-4 h-4" />
              申請一覧
              {pendingApps.length > 0 && activeTab !== 'applications' && (
                <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold border border-amber-200">
                  {pendingApps.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('submissions')}
              className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'submissions'
                  ? 'bg-gradient-to-r from-primary-400 to-primary-600 text-white shadow-md shadow-primary-500/20'
                  : 'text-secondary-600 hover:bg-secondary-50'
              }`}
            >
              <Send className="w-4 h-4" />
              月次提出
              {submittedSubs.length > 0 && activeTab !== 'submissions' && (
                <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold border border-blue-200">
                  {submittedSubs.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="card mb-4">
          <div className="flex items-center gap-2 mb-4 text-secondary-700">
            <Filter className="w-4 h-4 text-primary-500" />
            <span className="text-sm font-semibold">絞り込み</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Month picker */}
            <div>
              <label className="label">対象月</label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={goPrevMonth}
                  className="p-2 rounded-xl hover:bg-secondary-50 border border-secondary-200 transition-colors text-secondary-600"
                  aria-label="前月へ"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex-1 text-center font-semibold text-secondary-800">
                  {filterYear}年{filterMonth}月
                </div>
                <button
                  type="button"
                  onClick={goNextMonth}
                  className="p-2 rounded-xl hover:bg-secondary-50 border border-secondary-200 transition-colors text-secondary-600"
                  aria-label="翌月へ"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Status (apps tab only) */}
            {activeTab === 'applications' && (
              <div>
                <label className="label">ステータス</label>
                <select
                  value={appStatusFilter}
                  onChange={e => setAppStatusFilter(e.target.value as AppStatusFilter)}
                  className="input"
                >
                  <option value="all">全て</option>
                  <option value="pending">承認待ち</option>
                  <option value="approved">承認済み</option>
                  <option value="rejected">却下</option>
                </select>
              </div>
            )}

            {/* Staff (apps tab only) */}
            {activeTab === 'applications' && (
              <div>
                <label className="label">スタッフ</label>
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
              </div>
            )}
          </div>
        </div>

        {/* Applications tab */}
        {activeTab === 'applications' && (
          <>
            <section className="card mb-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-secondary-800 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  承認待ち
                </h2>
                <span className="text-xs text-secondary-500 bg-secondary-50 border border-secondary-100 px-2.5 py-1 rounded-full font-medium">
                  {pendingApps.length}件
                </span>
              </div>

              {isLoadingApps ? (
                <Loading />
              ) : pendingApps.length === 0 ? (
                <div className="text-center py-10 text-secondary-400">
                  <CheckCircle className="w-10 h-10 mx-auto mb-2 text-secondary-300" />
                  <p className="text-sm">承認待ちの申請はありません</p>
                </div>
              ) : (
                <div className="space-y-3">{pendingApps.map(renderApplicationCard)}</div>
              )}
            </section>

            <section className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-secondary-800 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-secondary-500" />
                  処理済み
                </h2>
                <span className="text-xs text-secondary-500 bg-secondary-50 border border-secondary-100 px-2.5 py-1 rounded-full font-medium">
                  {processedApps.length}件
                </span>
              </div>

              {isLoadingApps ? (
                <Loading />
              ) : processedApps.length === 0 ? (
                <div className="text-center py-8 text-secondary-400 text-sm">
                  処理済みの申請はありません
                </div>
              ) : (
                <div className="space-y-3">{processedApps.map(renderApplicationCard)}</div>
              )}
            </section>
          </>
        )}

        {/* Submissions tab */}
        {activeTab === 'submissions' && (
          <>
            <section className="card mb-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-secondary-800 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-600" />
                  確認待ち
                  <span className="text-[11px] text-secondary-400 font-normal">（全期間）</span>
                </h2>
                <span className="text-xs text-secondary-500 bg-secondary-50 border border-secondary-100 px-2.5 py-1 rounded-full font-medium">
                  {submittedSubs.length}件
                </span>
              </div>

              {isLoadingSubs ? (
                <Loading />
              ) : submittedSubs.length === 0 ? (
                <div className="text-center py-10 text-secondary-400">
                  <CheckCircle className="w-10 h-10 mx-auto mb-2 text-secondary-300" />
                  <p className="text-sm">確認待ちの月次提出はありません</p>
                </div>
              ) : (
                <div className="space-y-3">{submittedSubs.map(renderSubmissionCard)}</div>
              )}
            </section>

            <section className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-secondary-800 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-secondary-500" />
                  処理済み
                  <span className="text-[11px] text-secondary-400 font-normal">（{formatYearMonth(yearMonthStr)}）</span>
                </h2>
                <span className="text-xs text-secondary-500 bg-secondary-50 border border-secondary-100 px-2.5 py-1 rounded-full font-medium">
                  {processedSubs.length}件
                </span>
              </div>

              {isLoadingSubs ? (
                <Loading />
              ) : processedSubs.length === 0 ? (
                <div className="text-center py-8 text-secondary-400 text-sm">
                  処理済みの月次提出はありません
                </div>
              ) : (
                <div className="space-y-3">{processedSubs.map(renderSubmissionCard)}</div>
              )}
            </section>
          </>
        )}
      </main>

      {/* Confirmation / Rejection Modal */}
      <Modal isOpen={isModalOpen} onClose={closeModal} title={modalTitle} size="md">
        {pendingAction && (
          <div className="space-y-4 py-1">
            <div className="bg-secondary-50 border border-secondary-100 rounded-xl px-4 py-3 space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-secondary-500" />
                <span className="font-semibold text-secondary-800">
                  {pendingAction.staffName || '-'}
                </span>
              </div>
              {pendingAction.target === 'application' && pendingAction.date && (
                <div className="text-xs text-secondary-600">
                  対象日: {formatDateWithDow(pendingAction.date)}
                </div>
              )}
              {pendingAction.target === 'submission' && pendingAction.yearMonth && (
                <div className="text-xs text-secondary-600">
                  対象月: {formatYearMonth(pendingAction.yearMonth)}
                </div>
              )}
            </div>

            {modalIsApprove ? (
              <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-green-800">
                  {modalIsApplication
                    ? 'この申請を承認します。承認後は取り消せません。'
                    : 'この月次提出を確定します。確定後はスタッフが編集できなくなります。'}
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800">
                    {modalIsApplication
                      ? '却下理由はスタッフに通知されます。具体的に記載してください。'
                      : '差戻し理由はスタッフに通知されます。修正してほしい内容を記載してください。'}
                  </p>
                </div>
                <div>
                  <label className="label">
                    {modalIsApplication ? '却下理由' : '差戻し理由'}
                    <span className="text-red-500 ml-1">*</span>
                  </label>
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
                </div>
              </>
            )}

            {actionError && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">
                <XCircle className="w-4 h-4 flex-shrink-0" />
                <p className="text-sm font-medium">{actionError}</p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={isProcessing}
                className="btn btn-secondary flex-1"
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
                className={`btn flex-1 inline-flex items-center justify-center gap-2 ${
                  modalIsApprove ? 'btn-success' : 'btn-danger'
                }`}
              >
                {modalIsApprove ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    {isProcessing
                      ? '処理中...'
                      : modalIsApplication
                        ? '承認する'
                        : '確定する'}
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
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
