import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle,
  Send,
  Lock,
  Info,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { shiftRequestApi, paidLeaveApi } from '../../api';
import type { ShiftRequest, ShiftRequestOffDay } from '../../types';
import { Header, Loading, Spinner } from '../../components/common';
import {
  shiftRequestDeadline,
  isShiftRequestOpen,
  availableTargetYearMonths,
  daysInTargetMonth,
  pendingOffDateSet,
} from '../../utils/shiftRequest';
import { paidLeaveMonthState, type PaidLeaveMonthState } from '../../utils/paidLeave';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

type Mode = 'off' | 'paid';

function formatTargetMonthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${y}年${Number(m)}月`;
}

function formatJpDate(date: string): string {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
}

export function ShiftRequestPage() {
  const navigate = useNavigate();
  const { staff, isAuthenticated } = useAuth();

  const targets = useMemo(() => availableTargetYearMonths(new Date()), []);
  const [targetYearMonth, setTargetYearMonth] = useState<string>(targets[0] || '');
  const [existing, setExisting] = useState<ShiftRequest | null>(null);
  // スタッフが現在チェックを入れている希望休の日付セット (pending のみ編集可)
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  // 有給: この月の状況（残日数・承認済み・却下など）と、承認待ちにする日の選択
  // 取得に失敗した場合は null のままにし、有給は送らない（承認待ちの有給を誤って取り下げないため）
  const [paidState, setPaidState] = useState<PaidLeaveMonthState | null>(null);
  const [selectedPaid, setSelectedPaid] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>('off');
  const [remarks, setRemarks] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isOpen = !!targetYearMonth && isShiftRequestOpen(targetYearMonth, new Date());
  const deadline = targetYearMonth ? shiftRequestDeadline(targetYearMonth) : '';

  useEffect(() => {
    if (!isAuthenticated || !staff) navigate('/');
  }, [isAuthenticated, staff, navigate]);

  // 確定済みのうち、approved のみロック（再申請不可）。
  // rejected はスタッフが再選択することで再申請（pending 化）できるようにする。
  const lockedDayMap = useMemo(() => {
    const map = new Map<string, ShiftRequestOffDay>();
    if (existing) {
      for (const d of existing.offDays) {
        if (d.status === 'approved') map.set(d.date, d);
      }
    }
    return map;
  }, [existing]);

  // 過去に却下された日（再申請のため UI 上で識別する）
  const rejectedDayMap = useMemo(() => {
    const map = new Map<string, ShiftRequestOffDay>();
    if (existing) {
      for (const d of existing.offDays) {
        if (d.status === 'rejected') map.set(d.date, d);
      }
    }
    return map;
  }, [existing]);

  const paidApproved = useMemo(() => new Set(paidState?.approvedDates || []), [paidState]);

  const loadForMonth = useCallback(async () => {
    if (!staff || !targetYearMonth) return;
    setIsLoading(true);
    try {
      const [res, paidRes] = await Promise.all([
        shiftRequestApi.list({ staffId: staff.staffId, targetYearMonth }),
        paidLeaveApi.getBalance(staff.staffId),
      ]);
      const found = res.success && res.data && res.data.length > 0 ? res.data[0] : null;
      const offSet = pendingOffDateSet(found?.offDays);
      if (paidRes.success && paidRes.data) {
        const state = paidLeaveMonthState(paidRes.data.balance, paidRes.data.history || [], targetYearMonth);
        setPaidState(state);
        setSelectedPaid(new Set(state.pendingDates));
        // 同じ日が希望休と有給の両方になっている場合は有給を優先（サーバーと同じ扱い）
        state.pendingDates.forEach(d => offSet.delete(d));
      } else {
        setPaidState(null);
        setSelectedPaid(new Set());
        setMode('off');
      }
      setExisting(found);
      setSelectedDates(offSet);
      setRemarks(found?.remarks || '');
    } catch {
      setMessage({ type: 'error', text: '希望シフトの読込に失敗しました' });
    } finally {
      setIsLoading(false);
    }
  }, [staff, targetYearMonth]);

  useEffect(() => { loadForMonth(); }, [loadForMonth]);

  const paidLimit = paidState?.limitForMonth ?? 0;
  const paidRemainingToPick = Math.max(0, paidLimit - selectedPaid.size);

  const toggleDate = (date: string) => {
    if (lockedDayMap.has(date) || paidApproved.has(date)) return; // 承認済み（希望休・有給）は変更不可
    if (!isOpen || isSubmitting) return;

    if (mode === 'off') {
      if (selectedPaid.has(date)) {
        // 有給 → 希望休 に切り替え
        setSelectedPaid(prev => { const next = new Set(prev); next.delete(date); return next; });
        setSelectedDates(prev => new Set(prev).add(date));
        return;
      }
      setSelectedDates(prev => {
        const next = new Set(prev);
        if (next.has(date)) next.delete(date);
        else next.add(date);
        return next;
      });
      return;
    }

    // 有給モード
    if (!paidState) return;
    if (selectedPaid.has(date)) {
      setSelectedPaid(prev => { const next = new Set(prev); next.delete(date); return next; });
      return;
    }
    if (selectedPaid.size >= paidLimit) {
      setMessage({
        type: 'error',
        text: `有給の残り日数が足りません（残り ${paidState.balance} 日${paidState.pendingOtherMonths ? `・ほかの月の承認待ち ${paidState.pendingOtherMonths} 日` : ''}）`,
      });
      return;
    }
    setSelectedDates(prev => {
      if (!prev.has(date)) return prev;
      const next = new Set(prev);
      next.delete(date); // 希望休 → 有給 に切り替え
      return next;
    });
    setSelectedPaid(prev => new Set(prev).add(date));
  };

  const handleSubmit = async () => {
    if (!staff) return;
    if (!isOpen) {
      setMessage({ type: 'error', text: `提出期限を過ぎています（期限: ${deadline}）` });
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    try {
      const offDays: ShiftRequestOffDay[] = Array.from(selectedDates).sort().map(date => ({
        date,
        status: 'pending',
      }));
      const res = await shiftRequestApi.submit({
        staffId: staff.staffId,
        targetYearMonth,
        offDays,
        // 有給の状況を取得できたときだけ送る（取得できていないのに空で送ると承認待ちを取り下げてしまうため）
        ...(paidState ? { paidLeaveDates: Array.from(selectedPaid).sort() } : {}),
        remarks,
      });
      if (res.success) {
        const paid = res.data?.paidLeave;
        const paidNote = paid && (paid.added || paid.withdrawn)
          ? `（有給: ${[paid.added ? `${paid.added}日申請` : '', paid.withdrawn ? `${paid.withdrawn}日取り下げ` : ''].filter(Boolean).join('・')}）`
          : '';
        setMessage({ type: 'success', text: `送信しました${paidNote}` });
        await loadForMonth();
      } else {
        setMessage({ type: 'error', text: res.error || '送信に失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: '送信に失敗しました' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const days = daysInTargetMonth(targetYearMonth);
  const approvedCount = existing ? existing.offDays.filter(d => d.status === 'approved').length : 0;
  const rejectedOff = existing ? existing.offDays.filter(d => d.status === 'rejected' && !selectedDates.has(d.date)) : [];
  const rejectedPaid = paidState ? [...paidState.rejected.entries()].filter(([date]) => !selectedPaid.has(date)) : [];

  if (!targetYearMonth) {
    return (
      <div className="page">
        <Header title="希望休" />
        <main className="page-content">
          <div className="card mt-2 py-10 text-center">
            <Lock className="mx-auto h-10 w-10 text-label-3" strokeWidth={1.75} aria-hidden="true" />
            <p className="t-headline mt-3">提出可能な対象月がありません</p>
            <p className="t-subhead mt-1 text-label-2">
              希望休は対象月の2ヶ月前の7日までに提出してください。
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="page">
      <Header title="希望休" />

      <main className="page-content">
        {/* 対象月 */}
        <section className="section">
          <div className="list-group">
            <div className="list-row !py-[3px] !pr-2">
              <label htmlFor="shift-request-target-month" className="list-row-title t-body">
                対象月
              </label>
              <select
                id="shift-request-target-month"
                value={targetYearMonth}
                onChange={e => setTargetYearMonth(e.target.value)}
                className="input !w-auto !min-h-11 !bg-transparent !py-0 !pl-2 text-label-2 tabular"
                disabled={isSubmitting}
              >
                {targets.map(ym => (
                  <option key={ym} value={ym}>{formatTargetMonthLabel(ym)}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="section-footer">
            対象月の2ヶ月前の7日までに提出（例: 7月分は5/7まで）
          </p>
        </section>

        {/* ステータス */}
        <section className="section">
          <div className="card">
            <dl className="grid grid-cols-3 gap-2">
              <div className="tile">
                <dt className="t-footnote text-label-2">提出期限</dt>
                <dd className={`t-headline tabular mt-0.5 ${isOpen ? '' : 'text-danger'}`}>{deadline.slice(5).replace('-', '/')}</dd>
                <dd className={`t-caption mt-0.5 ${isOpen ? 'text-label-2' : 'text-danger'}`}>{isOpen ? deadline.slice(0, 4) + '年' : '期限切れ'}</dd>
              </div>
              <div className="tile">
                <dt className="t-footnote text-label-2">希望休</dt>
                <dd className="t-headline tabular mt-0.5 text-tint">{selectedDates.size}日</dd>
                <dd className="t-caption tabular mt-0.5 text-label-2">承認 {approvedCount}日</dd>
              </div>
              <div className="tile">
                <dt className="t-footnote text-label-2">有給</dt>
                <dd className="t-headline tabular mt-0.5 text-success">{paidState ? `${selectedPaid.size}日` : '–'}</dd>
                <dd className="t-caption tabular mt-0.5 text-label-2">{paidState ? `残り ${paidState.balance}日` : '取得できません'}</dd>
              </div>
            </dl>
            {existing && (
              <p className="t-footnote tabular text-label-2 mt-3">
                前回提出: {new Date(existing.submittedAt).toLocaleString('ja-JP')}
              </p>
            )}
          </div>
        </section>

        {/* メッセージ */}
        {message && (
          <div
            className={`callout mt-4 ${message.type === 'success' ? 'callout-success' : 'callout-danger'}`}
            role={message.type === 'error' ? 'alert' : 'status'}
          >
            {message.type === 'success' ? <CheckCircle aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
            <p className="font-medium break-words">{message.text}</p>
          </div>
        )}

        {/* 入力ガイド */}
        <div className="callout callout-tint mt-4">
          <Info aria-hidden="true" />
          <div className="space-y-1">
            <p>「希望休」か「有給」を選んでから、日付をタップしてください（複数選択可）。もう一度タップすると取り消せます。</p>
            <p>承認済みの日は変更できません。却下された日も、もう一度選べば再申請できます。</p>
          </div>
        </div>

        {/* 却下理由のサマリ */}
        {(rejectedOff.length > 0 || rejectedPaid.length > 0) && (
          <div className="callout callout-danger mt-3">
            <AlertCircle aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-semibold">却下された日</p>
              <ul className="t-footnote mt-1 space-y-0.5">
                {rejectedOff.map(d => (
                  <li key={`off-${d.date}`} className="break-words">
                    ・{formatJpDate(d.date)} 希望休{d.rejectionReason ? `: ${d.rejectionReason}` : ''}
                  </li>
                ))}
                {rejectedPaid.map(([date, r]) => (
                  <li key={`paid-${date}`} className="break-words">
                    ・{formatJpDate(date)} 有給{r.remarks ? `: ${r.remarks}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* カレンダー型 多選択 */}
        {isLoading ? (
          <div className="card mt-4 py-8"><Loading message="読み込み中..." /></div>
        ) : (
          <div className="card mt-4 !px-2 !py-3 sm:!p-4">
            {/* 種類の切り替え */}
            <div className="px-1 pb-3">
              <div className="segmented" role="tablist" aria-label="選ぶ種類">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'off'}
                  onClick={() => setMode('off')}
                  className="segmented-item"
                >
                  希望休
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'paid'}
                  onClick={() => setMode('paid')}
                  disabled={!paidState}
                  className="segmented-item disabled:text-label-3"
                >
                  有給
                </button>
              </div>
              <p className="t-footnote mt-2 px-1 text-label-2" aria-live="polite">
                {mode === 'off'
                  ? '休みを希望する日をタップしてください。'
                  : paidState
                    ? <>有給の残り <span className="tabular font-semibold text-label">{paidState.balance}日</span>
                        {paidState.pendingOtherMonths > 0 && <>（ほかの月の承認待ち <span className="tabular">{paidState.pendingOtherMonths}日</span>）</>}
                        ・この月はあと <span className={`tabular font-semibold ${paidRemainingToPick === 0 ? 'text-danger' : 'text-success'}`}>{paidRemainingToPick}日</span> 選べます</>
                    : '有給の残り日数を取得できませんでした。画面を更新してください。'}
              </p>
            </div>

            {/* 曜日ヘッダー */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-1">
              {WEEKDAYS.map((dow, i) => (
                <div
                  key={dow}
                  className={`text-center t-caption font-semibold py-1 ${
                    i === 0 ? 'text-danger' : i === 6 ? 'text-info' : 'text-label-2'
                  }`}
                >
                  {dow}
                </div>
              ))}
            </div>

            {/* 月初の前パディング */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {(() => {
                const firstDow = days.length > 0 ? new Date(days[0]).getDay() : 0;
                return Array.from({ length: firstDow }).map((_, i) => (
                  <div key={`pad-${i}`} />
                ));
              })()}
              {days.map(date => {
                const d = new Date(date);
                const day = d.getDate();
                const dow = d.getDay();
                const isApprovedOff = lockedDayMap.get(date)?.status === 'approved';
                const isApprovedPaid = !isApprovedOff && paidApproved.has(date);
                const isOff = selectedDates.has(date);
                const isPaid = selectedPaid.has(date);
                const wasRejected = rejectedDayMap.has(date) || !!paidState?.rejected.has(date);
                const isLocked = isApprovedOff || isApprovedPaid;
                const cellDisabled = isLocked || !isOpen || isSubmitting;

                let cellClass = 'min-h-[52px] sm:min-h-14 rounded-[10px] p-1 flex flex-col items-center justify-center transition-colors relative ';
                let caption = '';
                let srText = '';
                if (isApprovedOff) {
                  cellClass += 'bg-tint-fill text-tint cursor-not-allowed';
                  caption = '承認';
                  srText = ' 希望休・承認済み';
                } else if (isApprovedPaid) {
                  cellClass += 'bg-success-fill text-success cursor-not-allowed';
                  caption = '承認';
                  srText = ' 有給・承認済み';
                } else if (isPaid) {
                  cellClass += `bg-success text-on-success${wasRejected ? ' ring-2 ring-inset ring-danger' : ''}`;
                  caption = wasRejected ? '再申請' : '有給';
                  srText = wasRejected ? ' 有給・再申請' : ' 有給';
                } else if (isOff) {
                  cellClass += `bg-tint-solid text-on-tint${wasRejected ? ' ring-2 ring-inset ring-danger' : ''}`;
                  caption = wasRejected ? '再申請' : '希望';
                  srText = wasRejected ? ' 希望休・再申請' : ' 希望休';
                } else if (wasRejected) {
                  cellClass += 'bg-danger-fill text-danger active:opacity-60 cursor-pointer';
                  caption = '却下';
                  srText = ' 却下';
                } else if (!isOpen || isSubmitting) {
                  cellClass += 'text-label-3 cursor-not-allowed';
                } else {
                  cellClass += `${dow === 0 ? 'text-danger' : dow === 6 ? 'text-info' : 'text-label'} hover:bg-fill active:bg-fill-2 cursor-pointer`;
                }

                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => toggleDate(date)}
                    disabled={cellDisabled}
                    className={cellClass}
                    aria-label={`${formatJpDate(date)}${srText}`}
                    aria-pressed={isOff || isPaid}
                  >
                    <span className="t-headline tabular leading-none">{day}</span>
                    {caption && <span className="t-caption2 mt-1 leading-none font-semibold">{caption}</span>}
                  </button>
                );
              })}
            </div>

            {/* 凡例 */}
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 px-1 t-caption text-label-2" aria-label="色の意味">
              <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[4px] bg-tint-solid" aria-hidden="true" />希望休</li>
              <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[4px] bg-success" aria-hidden="true" />有給</li>
              <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[4px] bg-tint-fill ring-1 ring-inset ring-tint-line" aria-hidden="true" />承認済み（金: 希望休・緑: 有給）</li>
              <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[4px] bg-danger-fill" aria-hidden="true" />却下</li>
            </ul>
          </div>
        )}

        {/* 備考 */}
        <section className="section">
          <label htmlFor="shift-request-remarks" className="section-header">備考</label>
          <div className="list-group">
            <textarea
              id="shift-request-remarks"
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              rows={3}
              className="block w-full min-h-24 resize-y bg-transparent px-4 py-3 t-body outline-none placeholder:text-label-3 disabled:text-label-3"
              placeholder="連絡事項があれば入力してください"
              disabled={!isOpen || isSubmitting}
            />
          </div>
        </section>

        {/* 送信ボタン */}
        <div className="sticky bottom-[calc(var(--tabbar-height)+var(--safe-bottom))] lg:bottom-0 z-20 -mx-4 mt-6 px-4 py-3 material-bar hairline-top">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isOpen || isSubmitting || isLoading}
            className="btn btn-filled btn-lg btn-block"
          >
            {isSubmitting ? <Spinner size={18} className="!text-current" /> : <Send aria-hidden="true" />}
            希望休・有給を送信する
          </button>
          {!isOpen && (
            <p className="mt-2 text-center t-footnote text-danger">
              {formatTargetMonthLabel(targetYearMonth)}分の提出期限（{deadline}）を過ぎています。
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
