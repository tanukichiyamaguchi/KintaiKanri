import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  CalendarDays,
  Filter,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  User,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { shiftRequestApi, staffApi } from '../../api';
import type { ShiftRequest, StaffInfo } from '../../types';
import { Header, Loading } from '../../components/common';
import { availableTargetYearMonths } from '../../utils/shiftRequest';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function formatTargetMonthLabel(ym: string): string {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return `${y}年${Number(m)}月`;
}

function formatDayShort(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
}

export function AdminShiftRequestsPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isAdmin } = useAuth();

  const targetCandidates = useMemo(() => {
    const opens = availableTargetYearMonths(new Date());
    // 過去1ヶ月分も含めて表示できるようにする
    const today = new Date();
    const past: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!opens.includes(ym)) past.push(ym);
    }
    return [...opens, ...past].sort();
  }, []);

  const [filterMonth, setFilterMonth] = useState<string>(targetCandidates[0] || '');
  const [staffFilter, setStaffFilter] = useState<string>('');
  const [staffList, setStaffList] = useState<StaffInfo[]>([]);
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) navigate('/');
  }, [isAuthenticated, isAdmin, navigate]);

  // Load staff list
  useEffect(() => {
    (async () => {
      const res = await staffApi.getList();
      if (res.success && res.data) setStaffList(res.data);
    })();
  }, []);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await shiftRequestApi.list({
        targetYearMonth: filterMonth || undefined,
        staffId: staffFilter || undefined,
      });
      if (res.success && res.data) {
        setRequests(res.data);
      } else {
        setError(res.error || '取得に失敗しました');
        setRequests([]);
      }
    } catch {
      setError('取得に失敗しました');
      setRequests([]);
    } finally {
      setIsLoading(false);
    }
  }, [filterMonth, staffFilter]);

  useEffect(() => { reload(); }, [reload]);

  const sorted = useMemo(() => {
    return [...requests].sort((a, b) => {
      if (a.targetYearMonth !== b.targetYearMonth)
        return a.targetYearMonth < b.targetYearMonth ? 1 : -1;
      return (a.staffName || '').localeCompare(b.staffName || '', 'ja');
    });
  }, [requests]);

  const goPrevMonth = () => {
    if (!filterMonth) return;
    const [y, m] = filterMonth.split('-').map(Number);
    let nM = m - 1;
    let nY = y;
    if (nM < 1) { nM += 12; nY -= 1; }
    setFilterMonth(`${nY}-${String(nM).padStart(2, '0')}`);
  };
  const goNextMonth = () => {
    if (!filterMonth) return;
    const [y, m] = filterMonth.split('-').map(Number);
    let nM = m + 1;
    let nY = y;
    if (nM > 12) { nM -= 12; nY += 1; }
    setFilterMonth(`${nY}-${String(nM).padStart(2, '0')}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-secondary-100">
      <Header title="希望シフト" />

      <main className="max-w-5xl mx-auto p-3 sm:p-6">
        <Link to="/admin" className="inline-flex items-center gap-1 text-secondary-500 hover:text-primary-600 mb-4 text-sm font-medium min-h-11">
          <ChevronLeft className="w-4 h-4" />
          ダッシュボードへ戻る
        </Link>

        {/* Filters */}
        <div className="card mb-4">
          <div className="flex items-center gap-2 mb-4 text-secondary-700">
            <Filter className="w-4 h-4 text-primary-500" />
            <span className="text-sm font-semibold">絞り込み</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">対象月</label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={goPrevMonth}
                  className="h-11 w-11 rounded-xl hover:bg-secondary-50 border border-secondary-200 transition-colors text-secondary-600 flex items-center justify-center flex-shrink-0"
                  aria-label="前月へ"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex-1 text-center font-semibold text-secondary-800">
                  {formatTargetMonthLabel(filterMonth)}
                </div>
                <button
                  type="button"
                  onClick={goNextMonth}
                  className="h-11 w-11 rounded-xl hover:bg-secondary-50 border border-secondary-200 transition-colors text-secondary-600 flex items-center justify-center flex-shrink-0"
                  aria-label="翌月へ"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div>
              <label className="label">スタッフ</label>
              <select
                value={staffFilter}
                onChange={e => setStaffFilter(e.target.value)}
                className="input min-h-11"
              >
                <option value="">全員</option>
                {staffList.map(s => (
                  <option key={s.staffId} value={s.staffId}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* List */}
        <section className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-secondary-800 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary-500" />
              提出された希望シフト
            </h2>
            <span className="text-xs text-secondary-500 bg-secondary-50 border border-secondary-100 px-2.5 py-1 rounded-full font-medium">
              {sorted.length}件
            </span>
          </div>

          {isLoading ? (
            <div className="py-10"><Loading /></div>
          ) : error ? (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          ) : sorted.length === 0 ? (
            <div className="py-10 text-center text-secondary-400 text-sm">
              この条件で提出された希望シフトはありません
            </div>
          ) : (
            <div className="space-y-4">
              {sorted.map(req => {
                const offDays = req.days.filter(d => d.kind === 'off');
                const timeDays = req.days.filter(d => d.kind === 'time');
                return (
                  <div key={req.id} className="border border-secondary-100 rounded-2xl p-3 sm:p-4 bg-white">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center">
                          <User className="w-4 h-4 text-primary-600" />
                        </div>
                        <div className="font-semibold text-secondary-800">{req.staffName}</div>
                        <span className="text-xs text-secondary-500">{formatTargetMonthLabel(req.targetYearMonth)}</span>
                      </div>
                      <div className="text-xs text-secondary-400">
                        提出: {req.submittedAt ? new Date(req.submittedAt).toLocaleString('ja-JP') : '-'}
                      </div>
                    </div>

                    {/* 休み希望 */}
                    {offDays.length > 0 && (
                      <div className="mb-3">
                        <div className="text-xs font-semibold text-amber-700 mb-1.5">休み希望（{offDays.length}日）</div>
                        <div className="flex flex-wrap gap-1.5">
                          {offDays.map(d => (
                            <span key={d.date} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              {formatDayShort(d.date)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 時刻指定 */}
                    {timeDays.length > 0 && (
                      <div className="mb-3">
                        <div className="text-xs font-semibold text-primary-700 mb-1.5">時刻指定（{timeDays.length}日）</div>
                        <div className="flex flex-wrap gap-1.5">
                          {timeDays.map(d => (
                            <span key={d.date} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700 border border-primary-200">
                              {formatDayShort(d.date)} {d.startTime || ''}-{d.endTime || ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 備考 */}
                    {req.remarks && (
                      <div className="mt-2 pt-3 border-t border-secondary-100">
                        <div className="text-xs font-semibold text-secondary-500 mb-1">備考</div>
                        <p className="text-sm text-secondary-700 whitespace-pre-wrap">{req.remarks}</p>
                      </div>
                    )}

                    {/* 件数なしの場合 */}
                    {offDays.length === 0 && timeDays.length === 0 && !req.remarks && (
                      <p className="text-sm text-secondary-400">特に希望はありません</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex items-center gap-2 text-xs text-secondary-500">
            <Loader2 className="w-3 h-3 hidden" />
            <span>※ 希望シフトは shift_YYYYMM シートへの転記用の参考情報です。確定シフトはスプレッドシートで管理してください。</span>
          </div>
        </section>
      </main>
    </div>
  );
}
