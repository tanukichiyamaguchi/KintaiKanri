import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Inbox,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { applicationApi } from '../../api';
import type { Application, ApplicationStatus } from '../../types';
import {
  Header,
  Loading,
  ApplicationStatusBadge,
  ShiftDiffKindBadge,
} from '../../components/common';

type StatusFilter = 'all' | ApplicationStatus;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '全て' },
  { key: 'pending', label: '承認待ち' },
  { key: 'approved', label: '承認済み' },
  { key: 'rejected', label: '却下' },
];

export function ApplicationsPage() {
  const navigate = useNavigate();
  const { staff, isAuthenticated, isAdmin } = useAuth();

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auth gate: staff only
  useEffect(() => {
    if (!isAuthenticated || isAdmin || !staff) {
      navigate('/');
    }
  }, [isAuthenticated, isAdmin, staff, navigate]);

  const yearMonthStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

  // Disallow future months
  const isFutureMonth = useMemo(() => {
    const today = new Date();
    if (selectedYear > today.getFullYear()) return true;
    if (selectedYear === today.getFullYear() && selectedMonth > today.getMonth() + 1) return true;
    return false;
  }, [selectedYear, selectedMonth]);

  const loadApplications = useCallback(async (background = false) => {
    if (!staff) return;
    // background=true（タブ復帰時の再取得）はローディング表示を出さない。
    // 毎回 isLoading(true) すると一覧が一瞬消えてチラつくため。
    if (!background) setIsLoading(true);
    setError(null);
    try {
      const response = await applicationApi.list({
        staffId: staff.staffId,
        yearMonth: yearMonthStr,
      });
      if (response.success && response.data) {
        setApplications(response.data);
      } else if (!background) {
        // バックグラウンド更新の失敗で今表示中の一覧を消さない
        setError(response.error || '申請の取得に失敗しました');
        setApplications([]);
      }
    } catch {
      if (!background) {
        setError('申請の取得に失敗しました');
        setApplications([]);
      }
    } finally {
      if (!background) setIsLoading(false);
    }
  }, [staff, yearMonthStr]);

  useEffect(() => {
    loadApplications();
    // タブ復帰時に再取得し、承認/却下結果が古いまま残るのを防ぐ
    // （ClockPage の同種対策と揃える。bfcache 復元にも対応）。
    const onVisible = () => { if (document.visibilityState === 'visible') loadApplications(true); };
    const onFocus = () => loadApplications(true);
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) loadApplications(true); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [loadApplications]);

  const handlePreviousMonth = () => {
    if (selectedMonth === 1) {
      setSelectedYear(selectedYear - 1);
      setSelectedMonth(12);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    const today = new Date();
    const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
    const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
    // Block when next selection would be in the future
    if (
      nextYear > today.getFullYear() ||
      (nextYear === today.getFullYear() && nextMonth > today.getMonth() + 1)
    ) {
      return;
    }
    setSelectedYear(nextYear);
    setSelectedMonth(nextMonth);
  };

  const filteredApplications = useMemo(() => {
    const list =
      statusFilter === 'all'
        ? applications
        : applications.filter(a => a.status === statusFilter);
    // Sort by date desc, then submittedAt desc
    return [...list].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.submittedAt < b.submittedAt ? 1 : -1;
    });
  }, [applications, statusFilter]);

  const counts = useMemo(() => {
    return {
      all: applications.length,
      pending: applications.filter(a => a.status === 'pending').length,
      approved: applications.filter(a => a.status === 'approved').length,
      rejected: applications.filter(a => a.status === 'rejected').length,
    };
  }, [applications]);

  const formatDateLabel = (dateStr: string): string => {
    const date = new Date(dateStr);
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    return `${dateStr}（${weekdays[date.getDay()]}）`;
  };

  const formatDateTime = (iso?: string): string => {
    if (!iso) return '-';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
    } catch {
      return iso;
    }
  };

  const formatMinutes = (minutes?: number): string => {
    if (typeof minutes !== 'number' || minutes <= 0) return '-';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}時間${m > 0 ? `${m}分` : ''}` : `${m}分`;
  };

  const renderDetails = (app: Application) => {
    const d = app.details || {};
    const items: { label: string; value: string }[] = [];

    if (d.plannedStart || d.plannedEnd) {
      items.push({
        label: '予定',
        value: `${d.plannedStart || '-'} 〜 ${d.plannedEnd || '-'}`,
      });
    }
    if (d.actualStart || d.actualEnd) {
      items.push({
        label: '実績',
        value: `${d.actualStart || '-'} 〜 ${d.actualEnd || '-'}`,
      });
    }
    if (typeof d.plannedBreak === 'number' || typeof d.actualBreak === 'number') {
      const planned =
        typeof d.plannedBreak === 'number' ? `${d.plannedBreak}分` : '-';
      const actual =
        typeof d.actualBreak === 'number' ? `${d.actualBreak}分` : '-';
      items.push({
        label: '休憩',
        value: `予定 ${planned} / 実績 ${actual}`,
      });
    }
    if (typeof d.overtimeMinutes === 'number' && d.overtimeMinutes > 0) {
      items.push({
        label: '残業',
        value: formatMinutes(d.overtimeMinutes),
      });
    }

    if (items.length === 0) return null;

    return (
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
        {items.map((it, idx) => (
          <div key={idx} className="flex items-baseline gap-2">
            <dt className="t-footnote text-label-2 min-w-[2.5rem] flex-shrink-0">
              {it.label}
            </dt>
            <dd className="t-subhead tabular">{it.value}</dd>
          </div>
        ))}
      </dl>
    );
  };

  // 月の切り替えボタン（‹ ›）
  const monthButtonClass =
    'grid h-11 w-11 flex-shrink-0 place-items-center rounded-[10px] text-tint transition-colors enabled:active:bg-fill disabled:text-label-4 disabled:cursor-not-allowed';

  return (
    <div className="page">
      <Header
        title="申請"
        subtitle={<>{staff?.name} さんの申請履歴</>}
        actions={
          <Link to="/attendance" className="btn btn-plain !font-normal">
            出勤簿へ
          </Link>
        }
      />

      <main className="page-content">
        <section className="section">
          {/* Month Selector */}
          <div className="card !p-1.5 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handlePreviousMonth}
              className={monthButtonClass}
              aria-label="前月"
            >
              <ChevronLeft className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
            </button>
            <h2 className="t-headline tabular text-center">
              {selectedYear}年{selectedMonth}月
            </h2>
            <button
              type="button"
              onClick={handleNextMonth}
              disabled={isFutureMonth}
              className={monthButtonClass}
              aria-label="次月"
            >
              <ChevronRight className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>

          {/* Status Filter Tabs */}
          <div className="segmented mt-3" role="tablist" aria-label="ステータスで絞り込み">
            {STATUS_FILTERS.map(f => {
              const active = statusFilter === f.key;
              const count = counts[f.key];
              return (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStatusFilter(f.key)}
                  className="segmented-item !px-1 whitespace-nowrap"
                >
                  {f.label}
                  <span className="ml-1 tabular font-normal opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Error */}
        {error && (
          <div className="callout callout-danger mt-4" role="alert">
            <AlertCircle aria-hidden="true" />
            <p className="font-medium break-words">{error}</p>
          </div>
        )}

        {/* List */}
        {isLoading ? (
          <div className="card mt-4 py-10">
            <Loading message="読み込み中..." />
          </div>
        ) : filteredApplications.length === 0 ? (
          <div className="card mt-4 py-12 text-center">
            <Inbox className="mx-auto h-11 w-11 text-label-3" strokeWidth={1.5} aria-hidden="true" />
            <p className="t-subhead mt-3 text-label-2">申請はありません</p>
          </div>
        ) : (
          <section className="section">
            <div className="list-group">
              {filteredApplications.map(app => (
                <article key={app.id} className="list-row !block !py-3.5">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="t-headline tabular">
                        {formatDateLabel(app.date)}
                      </span>
                      <ShiftDiffKindBadge kind={app.type} />
                    </div>
                    <span className="flex flex-shrink-0">
                      <ApplicationStatusBadge status={app.status} />
                    </span>
                  </div>

                  {/* Details */}
                  {renderDetails(app) && (
                    <div className="tile mt-2.5 !py-2.5">
                      {renderDetails(app)}
                    </div>
                  )}

                  {/* Reason */}
                  {app.reason && (
                    <div className="mt-2.5">
                      <p className="t-footnote text-label-2">理由</p>
                      <p className="t-subhead whitespace-pre-wrap break-words">
                        {app.reason}
                      </p>
                    </div>
                  )}

                  {/* Rejection reason */}
                  {app.status === 'rejected' && app.rejectionReason && (
                    <div className="callout callout-danger mt-2.5 !py-2.5">
                      <AlertCircle aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="t-footnote font-semibold text-danger">却下理由</p>
                        <p className="t-subhead whitespace-pre-wrap break-words">
                          {app.rejectionReason}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Footer: timestamps */}
                  <div className="mt-2.5 flex flex-col gap-0.5 t-footnote tabular text-label-2 sm:flex-row sm:flex-wrap sm:gap-x-4">
                    <span>申請日時: {formatDateTime(app.submittedAt)}</span>
                    {app.reviewedAt && (
                      <span>
                        確認日時: {formatDateTime(app.reviewedAt)}
                        {app.reviewedBy ? ` (${app.reviewedBy})` : ''}
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
