import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Filter,
  FileText,
  Calendar,
  Clock as ClockIcon,
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

  const loadApplications = useCallback(async () => {
    if (!staff) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await applicationApi.list({
        staffId: staff.staffId,
        yearMonth: yearMonthStr,
      });
      if (response.success && response.data) {
        setApplications(response.data);
      } else {
        setError(response.error || '申請の取得に失敗しました');
        setApplications([]);
      }
    } catch {
      setError('申請の取得に失敗しました');
      setApplications([]);
    } finally {
      setIsLoading(false);
    }
  }, [staff, yearMonthStr]);

  useEffect(() => {
    loadApplications();
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
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        {items.map((it, idx) => (
          <div key={idx} className="flex items-baseline gap-2">
            <dt className="text-xs font-medium text-secondary-500 min-w-[3rem] flex-shrink-0">
              {it.label}
            </dt>
            <dd className="text-secondary-800 font-mono text-sm">{it.value}</dd>
          </div>
        ))}
      </dl>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-secondary-100">
      <Header title="申請一覧" />

      <main className="max-w-3xl mx-auto p-4 sm:p-6">
        {/* Back Links */}
        <div className="flex items-center gap-4 mb-5 flex-wrap">
          <Link
            to="/mypage"
            className="inline-flex items-center gap-1.5 text-secondary-500 hover:text-primary-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">マイページへ戻る</span>
          </Link>
          <Link
            to="/attendance"
            className="inline-flex items-center gap-1.5 text-secondary-500 hover:text-primary-600 transition-colors"
          >
            <FileText className="w-4 h-4" />
            <span className="text-sm font-medium">出勤簿へ</span>
          </Link>
        </div>

        {/* Title + Month Selector */}
        <div className="card mb-5 flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-sm shadow-primary-500/20">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-xs text-secondary-500 mb-0.5">
                {staff?.name} さんの申請履歴
              </div>
              <div className="text-base font-bold text-secondary-800">
                {selectedYear}年{selectedMonth}月
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handlePreviousMonth}
              className="p-2.5 rounded-xl hover:bg-primary-50 transition-colors"
              aria-label="前月"
            >
              <ChevronLeft className="w-5 h-5 text-secondary-600" />
            </button>
            <span className="text-sm font-medium min-w-[110px] text-center text-secondary-700">
              {selectedYear}年{selectedMonth}月
            </span>
            <button
              onClick={handleNextMonth}
              disabled={isFutureMonth}
              className="p-2.5 rounded-xl hover:bg-primary-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              aria-label="次月"
            >
              <ChevronRight className="w-5 h-5 text-secondary-600" />
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 text-red-600 bg-red-50 border border-red-200 px-5 py-4 rounded-xl mb-5">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Status Filter Tabs */}
        <div className="card mb-5 p-3">
          <div className="flex items-center gap-2 mb-3 px-2">
            <Filter className="w-4 h-4 text-secondary-500" />
            <span className="text-xs font-medium text-secondary-500">
              ステータスで絞り込み
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {STATUS_FILTERS.map(f => {
              const active = statusFilter === f.key;
              const count = counts[f.key];
              return (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl whitespace-nowrap transition-all text-sm font-medium ${
                    active
                      ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-md shadow-primary-500/25'
                      : 'bg-white text-secondary-600 hover:bg-primary-50 hover:text-primary-700 border border-secondary-200 hover:border-primary-200'
                  }`}
                >
                  {f.label}
                  <span
                    className={`inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-xs font-semibold ${
                      active
                        ? 'bg-white/25 text-white'
                        : 'bg-secondary-100 text-secondary-500'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="card py-10">
            <Loading message="読み込み中..." />
          </div>
        ) : filteredApplications.length === 0 ? (
          <div className="card py-12 text-center">
            <Inbox className="w-12 h-12 text-secondary-300 mx-auto mb-3" />
            <p className="text-secondary-500 text-sm">申請はありません</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredApplications.map(app => (
              <article
                key={app.id}
                className={`card transition-shadow hover:shadow-md ${
                  app.status === 'rejected' ? 'border-red-200/60' : ''
                }`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Calendar className="w-4 h-4 text-secondary-400 flex-shrink-0" />
                    <span className="text-sm font-semibold text-secondary-800 font-mono">
                      {formatDateLabel(app.date)}
                    </span>
                    <ShiftDiffKindBadge kind={app.type} />
                  </div>
                  <ApplicationStatusBadge status={app.status} />
                </div>

                {/* Details */}
                {renderDetails(app) && (
                  <div className="bg-secondary-50/60 border border-secondary-100 rounded-xl px-4 py-3 mb-3">
                    {renderDetails(app)}
                  </div>
                )}

                {/* Reason */}
                {app.reason && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-secondary-500 mb-1">
                      理由
                    </div>
                    <p className="text-sm text-secondary-800 whitespace-pre-wrap leading-relaxed">
                      {app.reason}
                    </p>
                  </div>
                )}

                {/* Rejection reason */}
                {app.status === 'rejected' && app.rejectionReason && (
                  <div className="mb-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                      <span className="text-xs font-semibold text-red-700">
                        却下理由
                      </span>
                    </div>
                    <p className="text-sm text-red-700 whitespace-pre-wrap leading-relaxed">
                      {app.rejectionReason}
                    </p>
                  </div>
                )}

                {/* Footer: timestamps */}
                <div className="flex items-center gap-4 pt-3 border-t border-secondary-100 text-xs text-secondary-500 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <ClockIcon className="w-3.5 h-3.5" />
                    <span>申請日時: {formatDateTime(app.submittedAt)}</span>
                  </div>
                  {app.reviewedAt && (
                    <div className="flex items-center gap-1.5">
                      <span>
                        確認日時: {formatDateTime(app.reviewedAt)}
                        {app.reviewedBy ? ` (${app.reviewedBy})` : ''}
                      </span>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
