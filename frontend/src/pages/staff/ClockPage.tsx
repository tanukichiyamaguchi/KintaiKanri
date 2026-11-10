import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, LogOut, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { attendanceApi, submissionApi, readCache, writeCache, localDateKey } from '../../api';
import type { ClockType, WorkStatus, ClockRecord, ClockGate } from '../../types';
import { Header, Modal, SubmissionDeadlineBanner, Spinner } from '../../components/common';
import { WorkRing } from '../../components/common/WorkRing';
import { computeWorkedMinutes, formatDuration } from '../../utils/workTime';

interface ClockCache {
  status: WorkStatus;
  records: ClockRecord[];
  gate: ClockGate | null;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function ClockPage() {
  const navigate = useNavigate();
  const { staff, isAuthenticated } = useAuth();

  // 今日のこのスタッフの保存内容（前回の表示内容）。あればすぐ表示し、裏で最新を取得する。
  const cacheKey = staff ? `clock:${staff.staffId}:${localDateKey()}` : '';
  const [initialCache] = useState(() => (cacheKey ? readCache<ClockCache>(cacheKey) : undefined));

  const [status, setStatus] = useState<WorkStatus>(initialCache?.status ?? 'not_started');
  const [records, setRecords] = useState<ClockRecord[]>(initialCache?.records ?? []);
  const [isClocking, setIsClocking] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [gate, setGate] = useState<ClockGate | null>(initialCache?.gate ?? null);
  // 初回読込が一度でも成功したか / 失敗中か。失敗中は「状態不明」としてボタンを無効化し、
  // 既定値(未出勤)を正しい状態として見せない（サイレント失敗＋誤操作を防ぐ）。
  // 保存内容がある場合は、それを「今日の状態」として表示・操作できる（サーバーが最終確認する）。
  const [loaded, setLoadedState] = useState(!!initialCache);
  const [loadError, setLoadError] = useState(false);
  // 取得処理の中では常に最新の値を見るため、ref にも持つ
  const loadedRef = useRef(!!initialCache);
  const setLoaded = useCallback((v: boolean) => {
    loadedRef.current = v;
    setLoadedState(v);
  }, []);
  const [now, setNow] = useState(() => new Date());
  // 【高速化 1-D】visibilitychange/focus/pageshow が短時間に連発しても
  // 無駄な往復を出さないよう、直近取得から数秒はスキップするデバウンス。
  const lastFetchAtRef = useRef(0);
  const FETCH_DEBOUNCE_MS = 3000;
  // 打刻より前に始まった取得の結果が、打刻後の状態を古い内容で上書きしないための通し番号
  const generationRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated || !staff) {
      navigate('/');
    }
  }, [isAuthenticated, staff, navigate]);

  // 時計（1 秒ごと）
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const saveCache = useCallback(
    (next: ClockCache) => {
      if (cacheKey) writeCache<ClockCache>(cacheKey, next);
    },
    [cacheKey]
  );

  const fetchTodayAttendance = useCallback(async () => {
    if (!staff) return;
    const generation = generationRef.current;
    try {
      const [todayRes, gateRes] = await Promise.all([
        attendanceApi.getToday(staff.staffId),
        submissionApi.clockGate(staff.staffId),
      ]);
      // 取得中に打刻した場合、この結果は打刻前の古い状態なので捨てる
      if (generation !== generationRef.current) return;
      // apiRequest は失敗時も reject せず {success:false} を返すため、catch ではなく
      // success フラグで判定する（catch は防御的フォールバックとしてのみ残す）。
      const nextGate = gateRes.success && gateRes.data ? gateRes.data : null;
      if (todayRes.success && todayRes.data) {
        const nextStatus = todayRes.data.status || 'not_started';
        const nextRecords = todayRes.data.records || [];
        setStatus(nextStatus);
        setRecords(nextRecords);
        setLoaded(true);
        setLoadError(false);
        saveCache({ status: nextStatus, records: nextRecords, gate: nextGate });
      } else if (!loadedRef.current) {
        // 一度も正しく取得できていない＝状態不明。既定値(未出勤)を正解として見せない。
        setLoadError(true);
        setMessage({ type: 'error', text: todayRes.error || '勤怠情報の取得に失敗しました。通信状況をご確認のうえ画面を更新してください。' });
      }
      if (nextGate) {
        setGate(nextGate);
      }
    } catch {
      if (generation !== generationRef.current) return;
      if (!loadedRef.current) setLoadError(true);
      setMessage({ type: 'error', text: '勤怠情報の取得に失敗しました。通信状況をご確認のうえ画面を更新してください。' });
    }
  }, [staff, saveCache, setLoaded]);

  useEffect(() => {
    fetchTodayAttendance();
    lastFetchAtRef.current = Date.now();

    // 【高速化 1-D】visibilitychange/focus/pageshow が短時間に連発しても
    // 直近取得から FETCH_DEBOUNCE_MS 以内ならスキップする（無駄な往復を抑制）。
    const debouncedFetch = () => {
      const t = Date.now();
      if (t - lastFetchAtRef.current < FETCH_DEBOUNCE_MS) return;
      lastFetchAtRef.current = t;
      fetchTodayAttendance();
    };
    // タブに戻ってきた時 / フォーカス時に即時更新（出勤簿提出直後の古いゲート状態を解消）
    const onVisible = () => { if (document.visibilityState === 'visible') debouncedFetch(); };
    // ブラウザの「戻る」等で bfcache から復元された場合は focus/visibilitychange が
    // 発火しないため、pageshow(persisted) でも必ず再取得する。
    // （出勤簿を提出→戻る で古い「未提出」リマインドが残るのを防ぐ）
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) debouncedFetch(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', debouncedFetch);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', debouncedFetch);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [fetchTodayAttendance]);

  const handleClockIn = async () => {
    if (!staff) return;
    await performClock('clock_in');
  };

  const handleClockOutClick = () => {
    setShowConfirmModal(true);
  };

  const performClock = async (type: ClockType) => {
    if (!staff) return;
    // これより前に始まった取得の結果は使わない
    generationRef.current += 1;

    // 【高速化 1-C: 楽観的更新】サーバ応答を待たず、押した瞬間に画面の状態を
    // 先行更新する（体感を「タップ→即反応」にする）。records は表示用の
    // 簡易エントリを積むだけで、確定値は成功時にサーバの today で上書きする。
    const prevStatus = status;
    const prevRecords = records;
    const optimisticTime = new Date().toISOString();
    setStatus(type === 'clock_in' ? 'working' : 'finished');
    setRecords(prev => [...prev, { type, time: optimisticTime }]);

    setIsClocking(true);
    setMessage(null);
    setShowConfirmModal(false);

    try {
      const response = await attendanceApi.clock(staff.staffId, type);
      if (response.success) {
        const label = type === 'clock_in' ? '出勤' : '退勤';
        setMessage({ type: 'success', text: `${label}を記録しました（${hhmm(new Date(optimisticTime))}）` });
        // 【高速化 1-B】打刻レスポンスに同梱された today/gate があればそれを
        // 正として反映し、追加の getToday/clockGate 往復を省略する
        // （デモモード等で同梱が無い場合のみフォールバックで再取得）。
        if (response.data?.today) {
          const nextStatus = response.data.today.status || 'not_started';
          const nextRecords = response.data.today.records || [];
          setStatus(nextStatus);
          setRecords(nextRecords);
          setLoaded(true);
          setLoadError(false);
          saveCache({ status: nextStatus, records: nextRecords, gate: response.data.gate ?? gate });
        }
        if (response.data?.gate) {
          setGate(response.data.gate);
        }
        if (!response.data?.today || !response.data?.gate) {
          await fetchTodayAttendance();
        }
      } else {
        // 楽観的更新を巻き戻し、サーバの拒否理由を表示。
        setStatus(prevStatus);
        setRecords(prevRecords);
        setMessage({ type: 'error', text: response.error || '打刻に失敗しました' });
        // クライアント状態がサーバとズレて拒否された場合に備え、最新状態へ再同期。
        // （「既に出勤済み」等の拒否時にボタン可否を正しく再計算しソフトロックを防ぐ）
        await fetchTodayAttendance();
      }
    } catch {
      setStatus(prevStatus);
      setRecords(prevRecords);
      setMessage({ type: 'error', text: '打刻に失敗しました' });
      await fetchTodayAttendance();
    } finally {
      setIsClocking(false);
    }
  };

  const isWorking = status === 'working';
  const isFinished = status === 'finished';
  const hasClockIn = records.some(r => r.type === 'clock_in');
  const hasClockOut = records.some(r => r.type === 'clock_out');
  // 【撤去】前月出勤簿の未提出による打刻ブロックは廃止。打刻の可否はゲートに依存しない。
  // 状態不明（初回読込に失敗）のときは、古い既定値で誤操作させないよう両ボタンを無効化する。
  const stateUnknown = loadError && !loaded;
  const clockInDisabled = stateUnknown || isWorking || isFinished || hasClockIn;
  const clockOutDisabled = stateUnknown || !isWorking || isFinished || hasClockOut;
  const waitingFirstLoad = !loaded && !loadError;

  const clockInRecord = records.find(r => r.type === 'clock_in');
  const clockOutRecord = records.find(r => r.type === 'clock_out');
  const clockInAt = clockInRecord ? new Date(clockInRecord.time) : null;
  const clockOutAt = clockOutRecord ? new Date(clockOutRecord.time) : null;
  const workedMinutes = computeWorkedMinutes(clockInAt, clockOutAt ?? (isWorking ? now : null));

  const statusPill = (() => {
    if (waitingFirstLoad) return { text: '確認中', cls: 'pill-neutral' };
    if (stateUnknown) return { text: '状態を確認できません', cls: 'pill-danger' };
    switch (status) {
      case 'working': return { text: '勤務中', cls: 'pill-success' };
      case 'finished': return { text: '退勤済み', cls: 'pill-info' };
      default: return { text: '未出勤', cls: 'pill-neutral' };
    }
  })();

  // 主ボタン: 次に行う打刻だけを大きく出す（出勤前 → 出勤 / 勤務中 → 退勤）
  const primary = (() => {
    if (isClocking) return { label: '記録しています…', icon: <Spinner size={18} className="!text-current" />, onClick: undefined, disabled: true, style: 'btn-filled' };
    if (waitingFirstLoad) return { label: '読み込み中…', icon: <Spinner size={18} className="!text-current" />, onClick: undefined, disabled: true, style: 'btn-gray' };
    if (!clockInDisabled) return { label: '出勤する', icon: <LogIn aria-hidden="true" />, onClick: handleClockIn, disabled: false, style: 'btn-filled' };
    if (!clockOutDisabled) return { label: '退勤する', icon: <LogOut aria-hidden="true" />, onClick: handleClockOutClick, disabled: false, style: 'btn-filled' };
    if (stateUnknown) return { label: '打刻できません', icon: null, onClick: undefined, disabled: true, style: 'btn-gray' };
    return { label: '今日の打刻は完了しています', icon: <CheckCircle2 aria-hidden="true" />, onClick: undefined, disabled: true, style: 'btn-gray' };
  })();

  const dateLabel = `${now.getMonth() + 1}月${now.getDate()}日（${WEEKDAYS[now.getDay()]}）`;

  return (
    <div className="page">
      <Header title="打刻" subtitle={staff ? `${staff.name}さん` : undefined} />

      <main className="page-content">
        {/* 出勤簿 提出期限アラート / 承認待ちのお知らせ */}
        <SubmissionDeadlineBanner gate={gate} />

        {/* 時計と勤務リング */}
        <section className="card !px-4 !pt-6 !pb-5" aria-labelledby="clock-heading">
          <h2 id="clock-heading" className="sr-only">現在時刻と今日の勤務</h2>
          <WorkRing workedMinutes={workedMinutes} active={isWorking}>
            <p className="t-subhead text-label-2">{dateLabel}</p>
            <p className="font-rounded tabular leading-none mt-1.5" aria-live="off">
              <span className="text-[60px] font-semibold tracking-tight">{hhmm(now)}</span>
              <span className="ml-1 text-[22px] font-medium text-label-3">{String(now.getSeconds()).padStart(2, '0')}</span>
            </p>
            <span className={`pill ${statusPill.cls} mt-3`}>{statusPill.text}</span>
          </WorkRing>

          <dl className="mt-5 grid grid-cols-3 text-center">
            <div>
              <dt className="t-footnote text-label-2">出勤</dt>
              <dd className="t-title3 tabular mt-0.5">{clockInAt ? hhmm(clockInAt) : '--:--'}</dd>
            </div>
            <div className="hairline-x">
              <dt className="t-footnote text-label-2">実働</dt>
              <dd className="t-title3 tabular mt-0.5">{clockInAt ? formatDuration(workedMinutes) : '--:--'}</dd>
            </div>
            <div>
              <dt className="t-footnote text-label-2">退勤</dt>
              <dd className="t-title3 tabular mt-0.5">{clockOutAt ? hhmm(clockOutAt) : '--:--'}</dd>
            </div>
          </dl>
        </section>

        {/* 打刻ボタン */}
        <div className="mt-4">
          <button
            type="button"
            onClick={primary.onClick}
            disabled={primary.disabled}
            className={`btn btn-lg btn-block ${primary.style}`}
          >
            {primary.icon}
            {primary.label}
          </button>
        </div>

        {/* 結果のお知らせ */}
        {message && (
          <div
            className={`callout mt-3 ${message.type === 'success' ? 'callout-success' : 'callout-danger'}`}
            role={message.type === 'error' ? 'alert' : 'status'}
          >
            {message.type === 'success' ? <CheckCircle2 aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
            <p className="font-medium break-words">{message.text}</p>
          </div>
        )}

        {/* 今日の記録 */}
        <section className="section">
          <h2 className="section-header">今日の記録</h2>
          <div className="list-group">
            {records.length === 0 ? (
              <div className="list-row">
                <span className="t-body text-label-2">まだ打刻がありません</span>
              </div>
            ) : (
              records.map((record, index) => (
                <div key={index} className="list-row list-row-with-icon">
                  <span className={`row-icon ${record.type === 'clock_in' ? 'bg-icon-green' : 'bg-icon-indigo'}`}>
                    {record.type === 'clock_in' ? <LogIn aria-hidden="true" /> : <LogOut aria-hidden="true" />}
                  </span>
                  <span className="list-row-title t-body">{record.type === 'clock_in' ? '出勤' : '退勤'}</span>
                  <span className="list-row-detail tabular">{hhmm(new Date(record.time))}</span>
                </div>
              ))
            )}
          </div>
          <p className="section-footer">
            休憩は退勤時に自動で入ります（出勤から退勤までが 6 時間を超えると 45 分、8 時間 45 分を超えると 60 分）。実際と違う場合は出勤簿で修正してください。
          </p>
        </section>
      </main>

      {/* 退勤の確認 */}
      <Modal isOpen={showConfirmModal} onClose={() => setShowConfirmModal(false)} title="退勤を記録しますか？" size="sm">
        <div className="pt-2 text-center">
          <p className="t-body text-label-2">
            {hhmm(now)} に退勤として記録します。
            {clockInAt && (
              <>
                <br />
                今日の実働は約 {formatDuration(computeWorkedMinutes(clockInAt, now))} です。
              </>
            )}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setShowConfirmModal(false)} className="btn btn-gray">
              キャンセル
            </button>
            <button type="button" onClick={() => performClock('clock_out')} className="btn btn-filled">
              退勤する
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
