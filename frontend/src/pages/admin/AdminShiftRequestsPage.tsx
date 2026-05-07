import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  CalendarDays,
  Filter,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  User,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { shiftRequestApi, staffApi } from '../../api';
import type { ShiftRequest, StaffInfo, ShiftRequestOffDay } from '../../types';
import { Header, Loading, Modal } from '../../components/common';
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

interface PendingReject {
  reqId: string;
  date: string;
  staffName: string;
}

export function AdminShiftRequestsPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isAdmin, admin } = useAuth();

  const targetCandidates = useMemo(() => {
    const opens = availableTargetYearMonths(new Date());
    const today = new Date();
    const past: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!opens.includes(ym)) past.push(ym);
    }
    return [...opens, ...past].sort();
  }, []);

  const [filterMonth, setFilterMonth] = useState<string>('');
  const [staffFilter, setStaffFilter] = useState<string>('');
  const [staffList, setStaffList] = useState<StaffInfo[]>([]);
  const [allRequests, setAllRequests] = useState<ShiftRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pendingReject, setPendingReject] = useState<PendingReject | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) navigate('/');
  }, [isAuthenticated, isAdmin, navigate]);

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
      // 月フィルタはクライアント側で適用するため、ここでは全月分を取得する。
      // ダッシュボードの未対応件数とフィルタ表示が一致せず、再申請が見つからないバグを防ぐ。
      const res = await shiftRequestApi.list({
        staffId: staffFilter || undefined,
      });
      if (res.success && res.data) setAllRequests(res.data);
      else { setError(res.error || '取得に失敗しました'); setAllRequests([]); }
    } catch {
      setError('取得に失敗しました');
      setAllRequests([]);
    } finally {
      setIsLoading(false);
    }
  }, [staffFilter]);

  useEffect(() => { reload(); }, [reload]);

  // 表示対象: 月フィルタを適用
  const requests = useMemo(() => {
    if (!filterMonth) return allRequests;
    return allRequests.filter(r => r.targetYearMonth === filterMonth);
  }, [allRequests, filterMonth]);

  // 初回ロード後、未承認の希望休がある月へ自動的にフィルタを合わせる
  useEffect(() => {
    if (filterMonth) return;
    if (isLoading) return;
    if (allRequests.length > 0) {
      const counts = new Map<string, number>();
      for (const r of allRequests) {
        const c = (r.offDays || []).filter(d => d.status === 'pending').length;
        if (c > 0) counts.set(r.targetYearMonth, (counts.get(r.targetYearMonth) || 0) + c);
      }
      if (counts.size > 0) {
        const sortedCounts = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        setFilterMonth(sortedCounts[0][0]);
        return;
      }
    }
    const opens = availableTargetYearMonths(new Date());
    setFilterMonth(opens[0] || targetCandidates[0] || '');
  }, [filterMonth, isLoading, allRequests, targetCandidates]);

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

  const approveDay = async (reqId: string, date: string) => {
    setActionInFlight(`${reqId}|${date}|approve`);
    setMessage(null);
    try {
      const res = await shiftRequestApi.reviewDay({
        id: reqId, date, status: 'approved',
        reviewedBy: admin?.adminId,
      });
      if (res.success) {
        setMessage({ type: 'success', text: '承認しました' });
        await reload();
      } else {
        setMessage({ type: 'error', text: res.error || '承認に失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: '承認に失敗しました' });
    } finally {
      setActionInFlight(null);
    }
  };

  const submitReject = async () => {
    if (!pendingReject) return;
    if (!rejectReason.trim()) {
      setMessage({ type: 'error', text: '却下理由を入力してください' });
      return;
    }
    setActionInFlight(`${pendingReject.reqId}|${pendingReject.date}|reject`);
    setMessage(null);
    try {
      const res = await shiftRequestApi.reviewDay({
        id: pendingReject.reqId,
        date: pendingReject.date,
        status: 'rejected',
        rejectionReason: rejectReason.trim(),
        reviewedBy: admin?.adminId,
      });
      if (res.success) {
        setMessage({ type: 'success', text: '却下しました' });
        setPendingReject(null);
        setRejectReason('');
        await reload();
      } else {
        setMessage({ type: 'error', text: res.error || '却下に失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: '却下に失敗しました' });
    } finally {
      setActionInFlight(null);
    }
  };

  const renderDayChip = (req: ShiftRequest, day: ShiftRequestOffDay) => {
    const inFlight = actionInFlight === `${req.id}|${day.date}|approve` || actionInFlight === `${req.id}|${day.date}|reject`;
    if (day.status === 'approved') {
      return (
        <div key={day.date} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
          <CheckCircle className="w-3 h-3" />
          {formatDayShort(day.date)}
          <span className="text-[10px] opacity-80">承認済</span>
        </div>
      );
    }
    if (day.status === 'rejected') {
      return (
        <div key={day.date} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200" title={day.rejectionReason || ''}>
          <XCircle className="w-3 h-3" />
          {formatDayShort(day.date)}
          <span className="text-[10px] opacity-80">却下</span>
        </div>
      );
    }
    // pending
    return (
      <div key={day.date} className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs">
        <span className="font-medium text-amber-700">{formatDayShort(day.date)}</span>
        <button
          type="button"
          disabled={inFlight}
          onClick={() => approveDay(req.id, day.date)}
          className="ml-1 inline-flex items-center justify-center min-w-7 h-7 rounded-full bg-green-100 text-green-700 hover:bg-green-200 transition-colors disabled:opacity-50"
          aria-label="承認"
          title="承認"
        >
          {inFlight && actionInFlight?.endsWith('|approve') ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
        </button>
        <button
          type="button"
          disabled={inFlight}
          onClick={() => { setPendingReject({ reqId: req.id, date: day.date, staffName: req.staffName }); setRejectReason(''); }}
          className="inline-flex items-center justify-center min-w-7 h-7 rounded-full bg-red-100 text-red-700 hover:bg-red-200 transition-colors disabled:opacity-50"
          aria-label="却下"
          title="却下"
        >
          <XCircle className="w-3 h-3" />
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-secondary-100">
      <Header title="希望休" />

      <main className="max-w-5xl mx-auto p-3 sm:p-6">
        <Link to="/admin" className="inline-flex items-center gap-1 text-secondary-500 hover:text-primary-600 mb-4 text-sm font-medium min-h-11">
          <ChevronLeft className="w-4 h-4" />
          ダッシュボードへ戻る
        </Link>

        {/* メッセージ */}
        {message && (
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-4 border ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}>
            {message.type === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            <p className="text-sm font-medium">{message.text}</p>
          </div>
        )}

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
              提出された希望休
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
              この条件で提出された希望休はありません
            </div>
          ) : (
            <div className="space-y-4">
              {sorted.map(req => {
                const pending = req.offDays.filter(d => d.status === 'pending');
                const approved = req.offDays.filter(d => d.status === 'approved');
                const rejected = req.offDays.filter(d => d.status === 'rejected');
                return (
                  <div key={req.id} className="border border-secondary-100 rounded-2xl p-3 sm:p-4 bg-white">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center">
                          <User className="w-4 h-4 text-primary-600" />
                        </div>
                        <div className="font-semibold text-secondary-800">{req.staffName}</div>
                        <span className="text-xs text-secondary-500">{formatTargetMonthLabel(req.targetYearMonth)}</span>
                        {pending.length > 0 && (
                          <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                            未承認 {pending.length}日
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-secondary-400">
                        提出: {req.submittedAt ? new Date(req.submittedAt).toLocaleString('ja-JP') : '-'}
                      </div>
                    </div>

                    {/* 未承認 */}
                    {pending.length > 0 && (
                      <div className="mb-3">
                        <div className="text-xs font-semibold text-amber-700 mb-2">未承認の希望休（{pending.length}日）— 各日で承認/却下できます</div>
                        <div className="flex flex-wrap gap-2">
                          {pending.map(d => renderDayChip(req, d))}
                        </div>
                      </div>
                    )}

                    {/* 承認済 */}
                    {approved.length > 0 && (
                      <div className="mb-3">
                        <div className="text-xs font-semibold text-green-700 mb-2">承認済（{approved.length}日）</div>
                        <div className="flex flex-wrap gap-2">
                          {approved.map(d => renderDayChip(req, d))}
                        </div>
                      </div>
                    )}

                    {/* 却下 */}
                    {rejected.length > 0 && (
                      <div className="mb-3">
                        <div className="text-xs font-semibold text-red-700 mb-2">却下（{rejected.length}日）</div>
                        <div className="flex flex-wrap gap-2">
                          {rejected.map(d => renderDayChip(req, d))}
                        </div>
                        {rejected.some(d => d.rejectionReason) && (
                          <ul className="mt-2 text-xs text-red-700 space-y-0.5">
                            {rejected.filter(d => d.rejectionReason).map(d => (
                              <li key={d.date}>・{formatDayShort(d.date)}: {d.rejectionReason}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {/* 備考 */}
                    {req.remarks && (
                      <div className="mt-2 pt-3 border-t border-secondary-100">
                        <div className="text-xs font-semibold text-secondary-500 mb-1">備考</div>
                        <p className="text-sm text-secondary-700 whitespace-pre-wrap">{req.remarks}</p>
                      </div>
                    )}

                    {pending.length === 0 && approved.length === 0 && rejected.length === 0 && !req.remarks && (
                      <p className="text-sm text-secondary-400">特に希望はありません</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex items-start gap-2 text-xs text-secondary-500">
            <span>※ 承認した希望休は shift_YYYYMM シートへ「休」として転記してください。確定シフトはスプレッドシートで管理する仕様です。</span>
          </div>
        </section>
      </main>

      {/* 却下モーダル */}
      <Modal
        isOpen={!!pendingReject}
        onClose={() => { setPendingReject(null); setRejectReason(''); }}
        title="希望休を却下"
        size="sm"
      >
        <div className="space-y-4 py-2">
          {pendingReject && (
            <div className="text-sm text-secondary-700">
              <span className="font-semibold">{pendingReject.staffName}</span>{' '}
              <span>{formatDayShort(pendingReject.date)}</span> の希望休を却下します。
            </div>
          )}
          <div>
            <label className="label">却下理由 <span className="text-red-500">*</span></label>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
              className="input min-h-24 resize-y"
              placeholder="理由を入力してください（スタッフに通知されます）"
              autoFocus
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setPendingReject(null); setRejectReason(''); }}
              className="btn btn-secondary flex-1"
              disabled={!!actionInFlight}
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={submitReject}
              disabled={!!actionInFlight || !rejectReason.trim()}
              className="btn btn-danger flex-1 flex items-center justify-center gap-2"
            >
              {actionInFlight?.endsWith('|reject') ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              却下する
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
