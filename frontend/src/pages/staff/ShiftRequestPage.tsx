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
import type { ShiftRequest, ShiftRequestDay, ShiftRequestKind } from '../../types';
import { Header, Loading } from '../../components/common';
import {
  shiftRequestDeadline,
  isShiftRequestOpen,
  availableTargetYearMonths,
  daysInTargetMonth,
  makeEmptyShiftRequestDays,
  mergeShiftRequestDays,
} from '../../utils/shiftRequest';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function formatTargetMonthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${y}年${Number(m)}月`;
}

function formatDayLabel(date: string): { day: string; dow: string; isSunday: boolean; isSaturday: boolean } {
  const d = new Date(date);
  const dow = d.getDay();
  return {
    day: String(d.getDate()),
    dow: WEEKDAYS[dow],
    isSunday: dow === 0,
    isSaturday: dow === 6,
  };
}

export function ShiftRequestPage() {
  const navigate = useNavigate();
  const { staff, isAuthenticated } = useAuth();

  const targets = useMemo(() => availableTargetYearMonths(new Date()), []);
  const [targetYearMonth, setTargetYearMonth] = useState<string>(targets[0] || '');
  const [days, setDays] = useState<ShiftRequestDay[]>([]);
  const [remarks, setRemarks] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [existing, setExisting] = useState<ShiftRequest | null>(null);

  const isOpen = !!targetYearMonth && isShiftRequestOpen(targetYearMonth, new Date());
  const deadline = targetYearMonth ? shiftRequestDeadline(targetYearMonth) : '';

  useEffect(() => {
    if (!isAuthenticated || !staff) navigate('/');
  }, [isAuthenticated, staff, navigate]);

  // 対象月切替時に既存申請を読み込み + 日付配列初期化
  const loadForMonth = useCallback(async () => {
    if (!staff || !targetYearMonth) return;
    setIsLoading(true);
    try {
      const res = await shiftRequestApi.list({ staffId: staff.staffId, targetYearMonth });
      const found = res.success && res.data && res.data.length > 0 ? res.data[0] : null;
      setExisting(found);
      const empty = makeEmptyShiftRequestDays(targetYearMonth);
      setDays(mergeShiftRequestDays(empty, found));
      setRemarks(found?.remarks || '');
    } catch {
      setMessage({ type: 'error', text: '希望シフトの読込に失敗しました' });
    } finally {
      setIsLoading(false);
    }
  }, [staff, targetYearMonth]);

  useEffect(() => { loadForMonth(); }, [loadForMonth]);

  const updateDay = useCallback((index: number, patch: Partial<ShiftRequestDay>) => {
    setDays(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      // kind が time 以外なら時刻を消す
      if (next[index].kind !== 'time') {
        next[index].startTime = undefined;
        next[index].endTime = undefined;
      }
      return next;
    });
  }, []);

  const handleKindChange = (index: number, kind: ShiftRequestKind) => {
    updateDay(index, { kind });
  };

  const handleSubmit = async () => {
    if (!staff) return;
    if (!isOpen) {
      setMessage({ type: 'error', text: `提出期限を過ぎています（期限: ${deadline}）` });
      return;
    }
    // バリデーション: 時刻指定の日は HH:MM が両方入っているか
    const invalid = days.find(d => d.kind === 'time' && (!d.startTime || !d.endTime));
    if (invalid) {
      setMessage({ type: 'error', text: `${invalid.date} の時刻が入力されていません` });
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    try {
      const res = await shiftRequestApi.submit({
        staffId: staff.staffId,
        targetYearMonth,
        days,
        remarks,
      });
      if (res.success) {
        setMessage({ type: 'success', text: '希望シフトを送信しました' });
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

  const offCount = days.filter(d => d.kind === 'off').length;
  const timeCount = days.filter(d => d.kind === 'time').length;

  if (!targetYearMonth) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-secondary-100">
        <Header title="希望シフト" />
        <main className="max-w-3xl mx-auto p-3 sm:p-6">
          <Link to="/clock" className="inline-flex items-center gap-1.5 text-secondary-500 hover:text-primary-600 mb-4 text-sm font-medium min-h-11">
            <ArrowLeft className="w-4 h-4" /> 打刻画面へ戻る
          </Link>
          <div className="card text-center py-10">
            <Lock className="w-10 h-10 mx-auto mb-3 text-secondary-300" />
            <p className="font-semibold text-secondary-700 mb-1">提出可能な対象月がありません</p>
            <p className="text-sm text-secondary-500">
              希望シフトは対象月の2ヶ月前の7日までに提出してください。
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-secondary-100">
      <Header title="希望シフト" />

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
                <h2 className="text-lg font-bold text-secondary-800">希望シフト申請</h2>
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
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-secondary-500 mb-1">提出期限</div>
              <div className={`text-sm font-semibold ${isOpen ? 'text-secondary-800' : 'text-red-600'}`}>{deadline}</div>
              {!isOpen && <div className="text-xs text-red-600 mt-0.5">期限切れ</div>}
            </div>
            <div>
              <div className="text-xs text-secondary-500 mb-1">休み希望</div>
              <div className="text-sm font-semibold text-secondary-800">{offCount}日</div>
            </div>
            <div>
              <div className="text-xs text-secondary-500 mb-1">時刻指定</div>
              <div className="text-sm font-semibold text-secondary-800">{timeCount}日</div>
            </div>
          </div>
          {existing && (
            <div className="mt-3 text-xs text-secondary-500">
              前回提出: {new Date(existing.submittedAt).toLocaleString('ja-JP')}（再送で上書きされます）
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
          <p className="text-secondary-700">
            日ごとに「指定なし」「休み希望」「時刻指定」を選んでください。時刻指定の場合は希望時刻も入力してください。
          </p>
        </div>

        {/* 日別入力 */}
        {isLoading ? (
          <div className="card"><Loading message="読み込み中..." /></div>
        ) : (
          <div className="space-y-2">
            {daysInTargetMonth(targetYearMonth).map((date, index) => {
              const day = days[index];
              if (!day) return null;
              const dl = formatDayLabel(date);
              const cellDisabled = !isOpen || isSubmitting;
              return (
                <div
                  key={date}
                  className={`card !p-3 sm:!p-4 ${
                    dl.isSunday ? 'bg-red-50/30' : dl.isSaturday ? 'bg-blue-50/30' : ''
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    {/* 日付 */}
                    <div className={`flex items-center gap-2 sm:w-24 sm:flex-shrink-0 ${
                      dl.isSunday ? 'text-red-500' : dl.isSaturday ? 'text-blue-500' : 'text-secondary-700'
                    }`}>
                      <span className="text-base font-bold">{dl.day}</span>
                      <span className="text-sm">（{dl.dow}）</span>
                    </div>

                    {/* 種別 */}
                    <div className="grid grid-cols-3 gap-1.5 sm:flex-1">
                      <button
                        type="button"
                        disabled={cellDisabled}
                        onClick={() => handleKindChange(index, 'none')}
                        className={`min-h-11 px-2 py-2 rounded-xl text-xs font-medium border-2 transition-all ${
                          day.kind === 'none'
                            ? 'border-secondary-400 bg-secondary-50 text-secondary-700'
                            : 'border-secondary-200 bg-white text-secondary-500 hover:border-secondary-300'
                        } ${cellDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        指定なし
                      </button>
                      <button
                        type="button"
                        disabled={cellDisabled}
                        onClick={() => handleKindChange(index, 'off')}
                        className={`min-h-11 px-2 py-2 rounded-xl text-xs font-medium border-2 transition-all ${
                          day.kind === 'off'
                            ? 'border-amber-400 bg-amber-50 text-amber-700'
                            : 'border-secondary-200 bg-white text-secondary-500 hover:border-amber-300'
                        } ${cellDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        休み希望
                      </button>
                      <button
                        type="button"
                        disabled={cellDisabled}
                        onClick={() => handleKindChange(index, 'time')}
                        className={`min-h-11 px-2 py-2 rounded-xl text-xs font-medium border-2 transition-all ${
                          day.kind === 'time'
                            ? 'border-primary-400 bg-primary-50 text-primary-700'
                            : 'border-secondary-200 bg-white text-secondary-500 hover:border-primary-300'
                        } ${cellDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        時刻指定
                      </button>
                    </div>

                    {/* 時刻入力 */}
                    {day.kind === 'time' && (
                      <div className="grid grid-cols-2 gap-2 sm:w-56 sm:flex-shrink-0">
                        <input
                          type="time"
                          value={day.startTime || ''}
                          onChange={e => updateDay(index, { startTime: e.target.value })}
                          disabled={cellDisabled}
                          className="input min-h-11 text-sm"
                          aria-label="希望開始時刻"
                        />
                        <input
                          type="time"
                          value={day.endTime || ''}
                          onChange={e => updateDay(index, { endTime: e.target.value })}
                          disabled={cellDisabled}
                          className="input min-h-11 text-sm"
                          aria-label="希望終了時刻"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
            placeholder="その他の希望や連絡事項があれば入力してください"
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
            {existing ? '希望シフトを更新する' : '希望シフトを提出する'}
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
