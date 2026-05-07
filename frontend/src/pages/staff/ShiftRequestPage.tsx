import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  CalendarDays,
  Send,
  Loader2,
  Lock,
  Info,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { shiftRequestApi } from '../../api';
import type { ShiftRequest, ShiftRequestOffDay } from '../../types';
import { Header, Loading } from '../../components/common';
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

  // 確定済み (approved / rejected) は自動的に表示されてロックされる。
  // pending は selectedDates として編集可能。
  const lockedDayMap = useMemo(() => {
    const map = new Map<string, ShiftRequestOffDay>();
    if (existing) {
      for (const d of existing.offDays) {
        if (d.status === 'approved' || d.status === 'rejected') {
          map.set(d.date, d);
        }
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
      <div className="min-h-screen bg-gradient-to-b from-white to-secondary-100">
        <Header title="希望休" />
        <main className="max-w-3xl mx-auto p-3 sm:p-6">
          <Link to="/clock" className="inline-flex items-center gap-1.5 text-secondary-500 hover:text-primary-600 mb-4 text-sm font-medium min-h-11">
            <ArrowLeft className="w-4 h-4" /> 打刻画面へ戻る
          </Link>
          <div className="card text-center py-10">
            <Lock className="w-10 h-10 mx-auto mb-3 text-secondary-300" />
            <p className="font-semibold text-secondary-700 mb-1">提出可能な対象月がありません</p>
            <p className="text-sm text-secondary-500">
              希望休は対象月の2ヶ月前の7日までに提出してください。
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-secondary-100">
      <Header title="希望休" />

      <main className="max-w-3xl mx-auto p-3 sm:p-6">
        <Link to="/clock" className="inline-flex items-center gap-1.5 text-secondary-500 hover:text-primary-600 mb-4 text-sm font-medium min-h-11">
          <ArrowLeft className="w-4 h-4" />
          <span>打刻画面へ戻る</span>
        </Link>

        {/* ヘッダーカード */}
        <div className="card mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <CalendarDays className="w-5 h-5 text-primary-500" />
                <h2 className="text-lg font-bold text-secondary-800">希望休 申請</h2>
              </div>
              <p className="text-xs text-secondary-500">
                対象月の2ヶ月前の7日までに提出（例: 7月分は5/7まで）
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <label className="text-xs text-secondary-500">対象月</label>
              <select
                value={targetYearMonth}
                onChange={e => setTargetYearMonth(e.target.value)}
                className="input min-h-11 sm:w-44"
                disabled={isSubmitting}
              >
                {targets.map(ym => (
                  <option key={ym} value={ym}>{formatTargetMonthLabel(ym)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ステータス */}
        <div className="card mb-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <div className="text-xs text-secondary-500 mb-1">提出期限</div>
              <div className={`text-sm font-semibold ${isOpen ? 'text-secondary-800' : 'text-red-600'}`}>{deadline}</div>
              {!isOpen && <div className="text-xs text-red-600 mt-0.5">期限切れ</div>}
            </div>
            <div>
              <div className="text-xs text-secondary-500 mb-1">未承認</div>
              <div className="text-sm font-semibold text-amber-600">{pendingCount}日</div>
            </div>
            <div>
              <div className="text-xs text-secondary-500 mb-1">承認済</div>
              <div className="text-sm font-semibold text-green-600">{approvedCount}日</div>
            </div>
            <div>
              <div className="text-xs text-secondary-500 mb-1">却下</div>
              <div className="text-sm font-semibold text-red-600">{rejectedCount}日</div>
            </div>
          </div>
          {existing && (
            <div className="mt-3 text-xs text-secondary-500">
              前回提出: {new Date(existing.submittedAt).toLocaleString('ja-JP')}
            </div>
          )}
        </div>

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

        {/* 入力ガイド */}
        <div className="bg-primary-50/60 border border-primary-200/60 rounded-2xl px-4 py-3 mb-4 flex items-start gap-3 text-sm">
          <Info className="w-4 h-4 text-primary-600 flex-shrink-0 mt-1" />
          <div className="text-secondary-700 space-y-1">
            <p>休みを希望する日をタップして選択してください（複数選択可）。</p>
            <p>承認済み・却下済みの日は固定で表示されます（変更不可）。</p>
          </div>
        </div>

        {/* 却下理由のサマリ */}
        {existing && existing.offDays.some(d => d.status === 'rejected') && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-4">
            <div className="font-semibold text-red-700 text-sm mb-2">却下された日</div>
            <ul className="text-xs text-red-700 space-y-1">
              {existing.offDays.filter(d => d.status === 'rejected').map(d => (
                <li key={d.date}>
                  ・{formatJpDate(d.date)}{d.rejectionReason ? `: ${d.rejectionReason}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* カレンダー型 多選択 */}
        {isLoading ? (
          <div className="card"><Loading message="読み込み中..." /></div>
        ) : (
          <div className="card !p-3 sm:!p-4">
            {/* 曜日ヘッダー */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
              {WEEKDAYS.map((dow, i) => (
                <div
                  key={dow}
                  className={`text-center text-xs font-semibold py-1 ${
                    i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-secondary-500'
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
                const isRejected = locked?.status === 'rejected';
                const isSelected = selectedDates.has(date);
                const isLocked = !!locked;
                const cellDisabled = isLocked || !isOpen || isSubmitting;

                let cellClass = 'min-h-12 sm:min-h-14 rounded-xl border-2 p-1 flex flex-col items-center justify-center transition-all relative ';
                if (isApproved) {
                  cellClass += 'bg-green-50 border-green-300 text-green-700 cursor-not-allowed';
                } else if (isRejected) {
                  cellClass += 'bg-red-50 border-red-300 text-red-700 cursor-not-allowed';
                } else if (isSelected) {
                  cellClass += 'bg-amber-100 border-amber-400 text-amber-700 shadow-sm shadow-amber-500/20';
                } else if (cellDisabled) {
                  cellClass += 'bg-secondary-50 border-secondary-100 text-secondary-300 cursor-not-allowed';
                } else {
                  cellClass += 'bg-white border-secondary-200 text-secondary-700 hover:border-amber-300 hover:bg-amber-50/40 active:scale-95 cursor-pointer';
                }

                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => toggleDate(date)}
                    disabled={cellDisabled}
                    className={cellClass}
                    aria-label={`${formatJpDate(date)}${isSelected ? ' 選択中' : ''}${isApproved ? ' 承認済' : ''}${isRejected ? ' 却下' : ''}`}
                  >
                    <div className={`text-xs font-medium ${
                      dow === 0 ? 'text-red-400' : dow === 6 ? 'text-blue-400' : ''
                    }`}>
                      {WEEKDAYS[dow]}
                    </div>
                    <div className="text-base font-bold">{day}</div>
                    {isApproved && <div className="text-[9px] mt-0.5 leading-none">承認</div>}
                    {isRejected && <div className="text-[9px] mt-0.5 leading-none">却下</div>}
                    {isSelected && !isLocked && <div className="text-[9px] mt-0.5 leading-none">希望</div>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 備考 */}
        <div className="card mt-4">
          <label className="label">備考</label>
          <textarea
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            rows={3}
            className="input min-h-24 resize-y"
            placeholder="連絡事項があれば入力してください"
            disabled={!isOpen || isSubmitting}
          />
        </div>

        {/* 送信ボタン */}
        <div className="sticky bottom-0 left-0 right-0 mt-4 bg-gradient-to-t from-white via-white to-transparent pt-4 pb-2">
          <button
            onClick={handleSubmit}
            disabled={!isOpen || isSubmitting || isLoading}
            className="btn btn-primary w-full sm:w-auto sm:px-12 mx-auto flex items-center justify-center gap-2 min-h-12"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {existing ? '希望休を更新する' : '希望休を提出する'}
          </button>
          {!isOpen && (
            <p className="mt-2 text-center text-xs text-red-600">
              {formatTargetMonthLabel(targetYearMonth)}分の提出期限（{deadline}）を過ぎています。
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
