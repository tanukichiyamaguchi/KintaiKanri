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
import { shiftRequestApi } from '../../api';
import type { ShiftRequest, ShiftRequestOffDay } from '../../types';
import { Header, Loading, Spinner } from '../../components/common';
import {
  shiftRequestDeadline,
  isShiftRequestOpen,
  availableTargetYearMonths,
  daysInTargetMonth,
  pendingOffDateSet,
} from '../../utils/shiftRequest';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

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

  const loadForMonth = useCallback(async () => {
    if (!staff || !targetYearMonth) return;
    setIsLoading(true);
    try {
      const res = await shiftRequestApi.list({ staffId: staff.staffId, targetYearMonth });
      const found = res.success && res.data && res.data.length > 0 ? res.data[0] : null;
      setExisting(found);
      setSelectedDates(pendingOffDateSet(found?.offDays));
      setRemarks(found?.remarks || '');
    } catch {
      setMessage({ type: 'error', text: '希望シフトの読込に失敗しました' });
    } finally {
      setIsLoading(false);
    }
  }, [staff, targetYearMonth]);

  useEffect(() => { loadForMonth(); }, [loadForMonth]);

  const toggleDate = (date: string) => {
    if (lockedDayMap.has(date)) return;     // 確定済みは変更不可
    if (!isOpen || isSubmitting) return;
    setSelectedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
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
        remarks,
      });
      if (res.success) {
        setMessage({ type: 'success', text: '希望休を送信しました' });
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
  const pendingCount = selectedDates.size;
  const approvedCount = existing ? existing.offDays.filter(d => d.status === 'approved').length : 0;
  const rejectedCount = existing ? existing.offDays.filter(d => d.status === 'rejected').length : 0;

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
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="tile">
                <dt className="t-footnote text-label-2">提出期限</dt>
                <dd className={`t-headline tabular mt-0.5 ${isOpen ? '' : 'text-danger'}`}>{deadline}</dd>
                {!isOpen && <dd className="t-caption text-danger mt-0.5">期限切れ</dd>}
              </div>
              <div className="tile">
                <dt className="t-footnote text-label-2">未承認</dt>
                <dd className="t-headline tabular mt-0.5 text-warning">{pendingCount}日</dd>
              </div>
              <div className="tile">
                <dt className="t-footnote text-label-2">承認済</dt>
                <dd className="t-headline tabular mt-0.5 text-success">{approvedCount}日</dd>
              </div>
              <div className="tile">
                <dt className="t-footnote text-label-2">却下</dt>
                <dd className="t-headline tabular mt-0.5 text-danger">{rejectedCount}日</dd>
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
            <p>休みを希望する日をタップして選択してください（複数選択可）。</p>
            <p>承認済みの日は変更できません。却下された日も再度タップすれば再申請できます。</p>
          </div>
        </div>

        {/* 却下理由のサマリ */}
        {existing && existing.offDays.some(d => d.status === 'rejected') && (
          <div className="callout callout-danger mt-3">
            <AlertCircle aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-semibold">却下された日</p>
              <ul className="t-footnote mt-1 space-y-0.5">
                {existing.offDays.filter(d => d.status === 'rejected').map(d => (
                  <li key={d.date} className="break-words">
                    ・{formatJpDate(d.date)}{d.rejectionReason ? `: ${d.rejectionReason}` : ''}
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
                const locked = lockedDayMap.get(date);
                const isApproved = locked?.status === 'approved';
                const wasRejected = rejectedDayMap.has(date);
                const isSelected = selectedDates.has(date);
                const isLocked = !!locked; // approved のみ
                const cellDisabled = isLocked || !isOpen || isSubmitting;

                let cellClass = 'min-h-[52px] sm:min-h-14 rounded-[10px] p-1 flex flex-col items-center justify-center transition-colors relative ';
                if (isApproved) {
                  cellClass += 'bg-success-fill text-success cursor-not-allowed';
                } else if (wasRejected && isSelected) {
                  // 再申請中（却下→再選択）
                  cellClass += 'bg-tint-solid text-on-tint ring-2 ring-inset ring-danger';
                } else if (wasRejected) {
                  cellClass += 'bg-danger-fill text-danger active:opacity-60 cursor-pointer';
                } else if (isSelected) {
                  cellClass += 'bg-tint-solid text-on-tint';
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
                    aria-label={`${formatJpDate(date)}${isSelected ? ' 選択中' : ''}${isApproved ? ' 承認済' : ''}${wasRejected ? ' 却下' : ''}`}
                  >
                    <span className="t-headline tabular leading-none">{day}</span>
                    {isApproved && <span className="t-caption2 mt-1 leading-none">承認</span>}
                    {wasRejected && isSelected && <span className="t-caption2 mt-1 leading-none font-semibold">再申請</span>}
                    {wasRejected && !isSelected && <span className="t-caption2 mt-1 leading-none">却下</span>}
                    {!wasRejected && isSelected && !isLocked && <span className="t-caption2 mt-1 leading-none">希望</span>}
                  </button>
                );
              })}
            </div>
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
            {existing ? '希望休を更新する' : '希望休を提出する'}
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
