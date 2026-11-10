import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCircle2,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { shiftRequestApi, staffApi, paidLeaveApi } from '../../api';
import { refreshDashboard } from '../../api/dashboardStore';
import type { ShiftRequest, StaffInfo, ShiftRequestOffDay, PaidLeaveRequest } from '../../types';
import { Header, Loading, Modal, Spinner } from '../../components/common';
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

// 日付の文字色（日曜は赤、土曜は青）。表示する曜日とずれないよう、formatDayShort と同じ解釈にそろえる。
function weekdayTextClass(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 'text-label';
  if (d.getDay() === 0) return 'text-danger';
  if (d.getDay() === 6) return 'text-info';
  return 'text-label';
}

// 小さいボタン（高さ 32px）の見た目はそのままに、押せる範囲だけを上下に広げて 44px にする
const SMALL_BUTTON_HIT = 'relative before:absolute before:inset-x-0 before:-inset-y-1.5';

interface PendingReject {
  kind: 'off' | 'paid';
  reqId: string;          // 希望休: 'SR-…' / 有給: 有給申請の ID
  staffId: string;
  targetYearMonth: string;
  date: string;
  staffName: string;
}

/** スタッフ × 月 ごとの「希望休」と「有給」のまとまり */
interface RequestGroup {
  key: string;
  staffId: string;
  staffName: string;
  targetYearMonth: string;
  shiftRequest: ShiftRequest | null;
  paid: PaidLeaveRequest[];
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

  // デフォルトは「全期間」。必要に応じて月絞り込みに切り替える。
  const [rangeMode, setRangeMode] = useState<'all' | 'month'>('all');
  const today0 = new Date();
  const [filterMonth, setFilterMonth] = useState<string>(
    targetCandidates.find(c => c >= `${today0.getFullYear()}-${String(today0.getMonth() + 1).padStart(2, '0')}`)
      || targetCandidates[0]
      || ''
  );
  const [staffFilter, setStaffFilter] = useState<string>('');
  const [staffList, setStaffList] = useState<StaffInfo[]>([]);
  const [allRequests, setAllRequests] = useState<ShiftRequest[]>([]);
  const [allPaid, setAllPaid] = useState<PaidLeaveRequest[]>([]);
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
      // 有給の申請も同時に取得し、同じ画面で承認できるようにする。
      const [res, paidRes] = await Promise.all([
        shiftRequestApi.list({ staffId: staffFilter || undefined }),
        paidLeaveApi.getAll(),
      ]);
      if (res.success && res.data) setAllRequests(res.data);
      else { setError(res.error || '取得に失敗しました'); setAllRequests([]); }
      if (paidRes.success && paidRes.data) {
        setAllPaid(paidRes.data.filter(p => !staffFilter || p.staffId === staffFilter));
      } else {
        setAllPaid([]);
        if (res.success) setError(paidRes.error || '有給の申請を取得できませんでした');
      }
    } catch {
      setError('取得に失敗しました');
      setAllRequests([]);
      setAllPaid([]);
    } finally {
      setIsLoading(false);
    }
  }, [staffFilter]);

  useEffect(() => { reload(); }, [reload]);

  // スタッフ × 月 で希望休と有給をまとめる（有給だけの月もまとまりを作る）
  const groups = useMemo(() => {
    const map = new Map<string, RequestGroup>();
    allRequests.forEach(r => {
      const key = `${r.staffId}|${r.targetYearMonth}`;
      map.set(key, { key, staffId: r.staffId, staffName: r.staffName, targetYearMonth: r.targetYearMonth, shiftRequest: r, paid: [] });
    });
    allPaid.forEach(p => {
      const ym = String(p.leaveDate || '').slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(ym)) return;
      const key = `${p.staffId}|${ym}`;
      const g = map.get(key) || { key, staffId: p.staffId, staffName: p.name, targetYearMonth: ym, shiftRequest: null, paid: [] };
      g.paid.push(p);
      map.set(key, g);
    });
    map.forEach(g => g.paid.sort((a, b) => (a.leaveDate < b.leaveDate ? -1 : 1)));
    return [...map.values()];
  }, [allRequests, allPaid]);

  // 表示対象: rangeMode='month' の場合のみ月で絞り込み
  const requests = useMemo(() => {
    if (rangeMode !== 'month' || !filterMonth) return groups;
    return groups.filter(r => r.targetYearMonth === filterMonth);
  }, [groups, rangeMode, filterMonth]);

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

  const approveDay = async (req: ShiftRequest, date: string) => {
    setActionInFlight(`${req.id}|${date}|approve`);
    setMessage(null);
    try {
      const res = await shiftRequestApi.reviewDay({
        id: req.id,
        staffId: req.staffId,
        targetYearMonth: req.targetYearMonth,
        date,
        status: 'approved',
        reviewedBy: admin?.adminId,
      });
      if (res.success) {
        setMessage({ type: 'success', text: '希望休を承認しました' });
        refreshDashboard(true);
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

  // 有給の承認（「有給休暇」画面と同じ申請。承認で残日数が 1 日減る）
  const approvePaid = async (p: PaidLeaveRequest) => {
    setActionInFlight(`paid|${p.id}|approve`);
    setMessage(null);
    try {
      const res = await paidLeaveApi.updateStatus(p.id, 'approved');
      if (res.success) {
        setMessage({ type: 'success', text: '有給を承認しました（残日数が1日減りました）' });
        refreshDashboard(true);
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
    const isPaid = pendingReject.kind === 'paid';
    setActionInFlight(isPaid ? `paid|${pendingReject.reqId}|reject` : `${pendingReject.reqId}|${pendingReject.date}|reject`);
    setMessage(null);
    try {
      const res = isPaid
        ? await paidLeaveApi.updateStatus(pendingReject.reqId, 'rejected', rejectReason.trim())
        : await shiftRequestApi.reviewDay({
          id: pendingReject.reqId,
          staffId: pendingReject.staffId,
          targetYearMonth: pendingReject.targetYearMonth,
          date: pendingReject.date,
          status: 'rejected',
          rejectionReason: rejectReason.trim(),
          reviewedBy: admin?.adminId,
        });
      if (res.success) {
        setMessage({ type: 'success', text: isPaid ? '有給を却下しました' : '希望休を却下しました' });
        setPendingReject(null);
        setRejectReason('');
        refreshDashboard(true);
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
        <li key={day.date} className="pill pill-success tabular">
          <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
          {formatDayShort(day.date)}
          <span className="font-medium opacity-80">承認済</span>
        </li>
      );
    }
    if (day.status === 'rejected') {
      return (
        <li key={day.date} className="pill pill-danger tabular" title={day.rejectionReason || ''}>
          <X className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
          {formatDayShort(day.date)}
          <span className="font-medium opacity-80">却下</span>
        </li>
      );
    }
    // pending
    return (
      <li key={day.date} className="flex items-center gap-2 py-2.5">
        <span className={`flex-1 min-w-0 t-body font-medium tabular ${weekdayTextClass(day.date)}`}>
          {formatDayShort(day.date)}
        </span>
        <button
          type="button"
          disabled={inFlight}
          onClick={() => approveDay(req, day.date)}
          className={`btn btn-sm btn-tinted ${SMALL_BUTTON_HIT}`}
          aria-label={`${formatDayShort(day.date)}を承認`}
        >
          {inFlight && actionInFlight?.endsWith('|approve') ? <Spinner size={15} className="!text-current" /> : <Check aria-hidden="true" />}
          承認
        </button>
        <button
          type="button"
          disabled={inFlight}
          onClick={() => { setPendingReject({ kind: 'off', reqId: req.id, staffId: req.staffId, targetYearMonth: req.targetYearMonth, date: day.date, staffName: req.staffName }); setRejectReason(''); }}
          className={`btn btn-sm btn-danger-tinted ${SMALL_BUTTON_HIT}`}
          aria-label={`${formatDayShort(day.date)}を却下`}
        >
          <X aria-hidden="true" />
          却下
        </button>
      </li>
    );
  };

  const renderPaidRow = (g: RequestGroup, p: PaidLeaveRequest) => {
    const date = String(p.leaveDate || '').slice(0, 10);
    const inFlight = actionInFlight === `paid|${p.id}|approve` || actionInFlight === `paid|${p.id}|reject`;
    if (p.status === 'approved') {
      return (
        <li key={p.id} className="pill pill-success tabular">
          <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
          {formatDayShort(date)}
          <span className="font-medium opacity-80">有給・承認済</span>
        </li>
      );
    }
    if (p.status === 'rejected') {
      return (
        <li key={p.id} className="pill pill-danger tabular" title={p.remarks || ''}>
          <X className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
          {formatDayShort(date)}
          <span className="font-medium opacity-80">有給・却下</span>
        </li>
      );
    }
    return (
      <li key={p.id} className="flex items-center gap-2 py-2.5">
        <span className={`flex-1 min-w-0 t-body font-medium tabular ${weekdayTextClass(date)}`}>
          {formatDayShort(date)}
        </span>
        <button
          type="button"
          disabled={inFlight}
          onClick={() => approvePaid(p)}
          className={`btn btn-sm btn-tinted ${SMALL_BUTTON_HIT}`}
          aria-label={`${formatDayShort(date)}の有給を承認`}
        >
          {inFlight && actionInFlight?.endsWith('|approve') ? <Spinner size={15} className="!text-current" /> : <Check aria-hidden="true" />}
          承認
        </button>
        <button
          type="button"
          disabled={inFlight}
          onClick={() => { setPendingReject({ kind: 'paid', reqId: p.id, staffId: g.staffId, targetYearMonth: g.targetYearMonth, date, staffName: g.staffName }); setRejectReason(''); }}
          className={`btn btn-sm btn-danger-tinted ${SMALL_BUTTON_HIT}`}
          aria-label={`${formatDayShort(date)}の有給を却下`}
        >
          <X aria-hidden="true" />
          却下
        </button>
      </li>
    );
  };

  return (
    <div className="page">
      <Header title="希望シフト" backTo="/admin/more" backLabel="その他" backMobileOnly />

      <main className="page-content">
        {/* メッセージ */}
        {message && (
          <div
            className={`callout mt-2 ${
              message.type === 'success' ? 'callout-success' : 'callout-danger'
            }`}
            role={message.type === 'error' ? 'alert' : 'status'}
          >
            {message.type === 'success' ? <CheckCircle2 aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
            <p className="font-medium break-words">{message.text}</p>
          </div>
        )}

        {/* Filters */}
        <section className="section">
          <h2 className="section-header">絞り込み</h2>
          <div className="card grid gap-4 md:grid-cols-3">
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
              </div>
            </div>
            <div className={rangeMode === 'month' ? '' : 'opacity-40 pointer-events-none'}>
              <p className="label">対象月</p>
              <div className="flex items-center rounded-[10px] bg-fill">
                <button
                  type="button"
                  onClick={goPrevMonth}
                  className="grid h-11 w-11 flex-shrink-0 place-items-center text-tint active:opacity-60 disabled:text-label-3"
                  aria-label="前月へ"
                  disabled={rangeMode !== 'month'}
                >
                  <ChevronLeft className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
                </button>
                <p className="flex-1 text-center t-body font-semibold tabular">
                  {formatTargetMonthLabel(filterMonth) || '—'}
                </p>
                <button
                  type="button"
                  onClick={goNextMonth}
                  className="grid h-11 w-11 flex-shrink-0 place-items-center text-tint active:opacity-60 disabled:text-label-3"
                  aria-label="翌月へ"
                  disabled={rangeMode !== 'month'}
                >
                  <ChevronRight className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
                </button>
              </div>
            </div>
            <label className="block">
              <span className="label">スタッフ</span>
              <select
                value={staffFilter}
                onChange={e => setStaffFilter(e.target.value)}
                className="input"
              >
                <option value="">全員</option>
                {staffList.map(s => (
                  <option key={s.staffId} value={s.staffId}>{s.name}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {/* List */}
        <section className="section">
          <h2 className="section-header">
            提出された希望休・有給
            <span className="tabular">{sorted.length}件</span>
          </h2>

          {isLoading ? (
            <div className="card py-10"><Loading /></div>
          ) : error ? (
            <div className="callout callout-danger" role="alert">
              <AlertCircle aria-hidden="true" />
              <p className="break-words">{error}</p>
            </div>
          ) : sorted.length === 0 ? (
            <div className="card flex flex-col items-center gap-2 py-10 text-center">
              <CalendarDays className="h-9 w-9 text-label-4" aria-hidden="true" />
              <p className="t-subhead text-label-2">この条件で提出された希望休・有給はありません</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sorted.map(group => {
                const req = group.shiftRequest;
                const offDays = req ? req.offDays : [];
                const pending = offDays.filter(d => d.status === 'pending');
                const approved = offDays.filter(d => d.status === 'approved');
                const rejected = offDays.filter(d => d.status === 'rejected');
                const paidPending = group.paid.filter(p => p.status === 'pending');
                const paidApproved = group.paid.filter(p => p.status === 'approved');
                const paidRejected = group.paid.filter(p => p.status === 'rejected');
                return (
                  <article key={group.key} className="card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="t-headline break-words">{group.staffName}</h3>
                        <p className="t-footnote text-label-2 tabular">{formatTargetMonthLabel(group.targetYearMonth)}</p>
                      </div>
                      {(pending.length > 0 || paidPending.length > 0) && (
                        <span className="pill pill-warning flex-shrink-0 tabular">
                          未承認 {pending.length + paidPending.length}日
                        </span>
                      )}
                    </div>
                    {req && (
                      <p className="mt-1 t-caption text-label-2 tabular">
                        提出: {req.submittedAt ? new Date(req.submittedAt).toLocaleString('ja-JP') : '-'}
                      </p>
                    )}

                    {/* 未承認 */}
                    {pending.length > 0 && (
                      <div className="mt-4">
                        <h4 className="t-footnote font-semibold text-warning">
                          未承認の希望休（{pending.length}日）
                          <span className="font-normal text-label-2">— 各日で承認/却下できます</span>
                        </h4>
                        <ul className="mt-1 divide-y-[0.5px] divide-separator">
                          {req && pending.map(d => renderDayChip(req, d))}
                        </ul>
                      </div>
                    )}

                    {/* 承認済 */}
                    {approved.length > 0 && (
                      <div className="mt-4">
                        <h4 className="t-footnote font-semibold text-success">承認済（{approved.length}日）</h4>
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {req && approved.map(d => renderDayChip(req, d))}
                        </ul>
                      </div>
                    )}

                    {/* 却下 */}
                    {rejected.length > 0 && (
                      <div className="mt-4">
                        <h4 className="t-footnote font-semibold text-danger">却下（{rejected.length}日）</h4>
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {req && rejected.map(d => renderDayChip(req, d))}
                        </ul>
                        {rejected.some(d => d.rejectionReason) && (
                          <ul className="mt-2 space-y-0.5 t-footnote text-danger">
                            {rejected.filter(d => d.rejectionReason).map(d => (
                              <li key={d.date} className="break-words">・{formatDayShort(d.date)}: {d.rejectionReason}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {/* 有給 */}
                    {paidPending.length > 0 && (
                      <div className="mt-4">
                        <h4 className="t-footnote font-semibold text-success">
                          未承認の有給（{paidPending.length}日）
                          <span className="font-normal text-label-2">— 承認すると残日数が1日減ります</span>
                        </h4>
                        <ul className="mt-1 divide-y-[0.5px] divide-separator">
                          {paidPending.map(p => renderPaidRow(group, p))}
                        </ul>
                      </div>
                    )}
                    {(paidApproved.length > 0 || paidRejected.length > 0) && (
                      <div className="mt-4">
                        <h4 className="t-footnote font-semibold text-label-2">有給（承認済 {paidApproved.length}日・却下 {paidRejected.length}日）</h4>
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {[...paidApproved, ...paidRejected].map(p => renderPaidRow(group, p))}
                        </ul>
                        {paidRejected.some(p => p.remarks) && (
                          <ul className="mt-2 space-y-0.5 t-footnote text-danger">
                            {paidRejected.filter(p => p.remarks).map(p => (
                              <li key={p.id} className="break-words">・{formatDayShort(String(p.leaveDate).slice(0, 10))} 有給: {p.remarks}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {/* 備考 */}
                    {req?.remarks && (
                      <div className="mt-4 border-t-[0.5px] border-separator pt-3">
                        <h4 className="t-footnote font-semibold text-label-2">備考</h4>
                        <p className="mt-0.5 t-subhead whitespace-pre-wrap break-words">{req.remarks}</p>
                      </div>
                    )}

                    {pending.length === 0 && approved.length === 0 && rejected.length === 0 && group.paid.length === 0 && !req?.remarks && (
                      <p className="mt-3 t-subhead text-label-2">特に希望はありません</p>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          <p className="section-footer">
            ※ 承認した希望休・有給は、スプレッドシートのシフト_YYYYMM シートへ休みとして転記してください（確定シフトはスプレッドシートで管理する仕様です）。有給はマイページから申請されたものも表示しています。
          </p>
        </section>
      </main>

      {/* 却下モーダル */}
      <Modal
        isOpen={!!pendingReject}
        onClose={() => { setPendingReject(null); setRejectReason(''); }}
        title={pendingReject?.kind === 'paid' ? '有給を却下' : '希望休を却下'}
        size="sm"
      >
        <div className="space-y-4 pt-1">
          {pendingReject && (
            <p className="t-subhead text-label-2">
              <span className="font-semibold text-label">{pendingReject.staffName}</span>{' '}
              <span className={`font-semibold tabular ${weekdayTextClass(pendingReject.date)}`}>{formatDayShort(pendingReject.date)}</span> の{pendingReject.kind === 'paid' ? '有給' : '希望休'}を却下します。
            </p>
          )}
          <label className="block">
            <span className="label">却下理由 <span className="text-danger">*</span></span>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
              className="input min-h-24 resize-y"
              placeholder="理由を入力してください（スタッフに通知されます）"
              autoFocus
            />
          </label>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setPendingReject(null); setRejectReason(''); }}
              className="btn btn-gray"
              disabled={!!actionInFlight}
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={submitReject}
              disabled={!!actionInFlight || !rejectReason.trim()}
              className="btn btn-danger"
            >
              {actionInFlight?.endsWith('|reject') ? <Spinner size={18} className="!text-current" /> : <X aria-hidden="true" />}
              却下する
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
