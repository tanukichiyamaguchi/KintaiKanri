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
import { shiftRequestApi, staffApi } from '../../api';
import type { ShiftRequest, StaffInfo, ShiftRequestOffDay } from '../../types';
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
  reqId: string;
  staffId: string;
  targetYearMonth: string;
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

  // 表示対象: rangeMode='month' の場合のみ月で絞り込み
  const requests = useMemo(() => {
    if (rangeMode !== 'month' || !filterMonth) return allRequests;
    return allRequests.filter(r => r.targetYearMonth === filterMonth);
  }, [allRequests, rangeMode, filterMonth]);

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
        staffId: pendingReject.staffId,
        targetYearMonth: pendingReject.targetYearMonth,
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
          onClick={() => { setPendingReject({ reqId: req.id, staffId: req.staffId, targetYearMonth: req.targetYearMonth, date: day.date, staffName: req.staffName }); setRejectReason(''); }}
          className={`btn btn-sm btn-danger-tinted ${SMALL_BUTTON_HIT}`}
          aria-label={`${formatDayShort(day.date)}を却下`}
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
            提出された希望休
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
              <p className="t-subhead text-label-2">この条件で提出された希望休はありません</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sorted.map(req => {
                const pending = req.offDays.filter(d => d.status === 'pending');
                const approved = req.offDays.filter(d => d.status === 'approved');
                const rejected = req.offDays.filter(d => d.status === 'rejected');
                return (
                  <article key={req.id} className="card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="t-headline break-words">{req.staffName}</h3>
                        <p className="t-footnote text-label-2 tabular">{formatTargetMonthLabel(req.targetYearMonth)}</p>
                      </div>
                      {pending.length > 0 && (
                        <span className="pill pill-warning flex-shrink-0 tabular">
                          未承認 {pending.length}日
                        </span>
                      )}
                    </div>
                    <p className="mt-1 t-caption text-label-2 tabular">
                      提出: {req.submittedAt ? new Date(req.submittedAt).toLocaleString('ja-JP') : '-'}
                    </p>

                    {/* 未承認 */}
                    {pending.length > 0 && (
                      <div className="mt-4">
                        <h4 className="t-footnote font-semibold text-warning">
                          未承認の希望休（{pending.length}日）
                          <span className="font-normal text-label-2">— 各日で承認/却下できます</span>
                        </h4>
                        <ul className="mt-1 divide-y-[0.5px] divide-separator">
                          {pending.map(d => renderDayChip(req, d))}
                        </ul>
                      </div>
                    )}

                    {/* 承認済 */}
                    {approved.length > 0 && (
                      <div className="mt-4">
                        <h4 className="t-footnote font-semibold text-success">承認済（{approved.length}日）</h4>
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {approved.map(d => renderDayChip(req, d))}
                        </ul>
                      </div>
                    )}

                    {/* 却下 */}
                    {rejected.length > 0 && (
                      <div className="mt-4">
                        <h4 className="t-footnote font-semibold text-danger">却下（{rejected.length}日）</h4>
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {rejected.map(d => renderDayChip(req, d))}
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

                    {/* 備考 */}
                    {req.remarks && (
                      <div className="mt-4 border-t-[0.5px] border-separator pt-3">
                        <h4 className="t-footnote font-semibold text-label-2">備考</h4>
                        <p className="mt-0.5 t-subhead whitespace-pre-wrap break-words">{req.remarks}</p>
                      </div>
                    )}

                    {pending.length === 0 && approved.length === 0 && rejected.length === 0 && !req.remarks && (
                      <p className="mt-3 t-subhead text-label-2">特に希望はありません</p>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          <p className="section-footer">
            ※ 承認した希望休は shift_YYYYMM シートへ「休」として転記してください。確定シフトはスプレッドシートで管理する仕様です。
          </p>
        </section>
      </main>

      {/* 却下モーダル */}
      <Modal
        isOpen={!!pendingReject}
        onClose={() => { setPendingReject(null); setRejectReason(''); }}
        title="希望休を却下"
        size="sm"
      >
        <div className="space-y-4 pt-1">
          {pendingReject && (
            <p className="t-subhead text-label-2">
              <span className="font-semibold text-label">{pendingReject.staffName}</span>{' '}
              <span className={`font-semibold tabular ${weekdayTextClass(pendingReject.date)}`}>{formatDayShort(pendingReject.date)}</span> の希望休を却下します。
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
