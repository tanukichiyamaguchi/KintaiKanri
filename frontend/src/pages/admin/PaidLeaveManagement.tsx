import { useState, useEffect, useCallback, useId, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X, AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, Info } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { paidLeaveApi, localDateKey } from '../../api';
import type { PaidLeaveRequest, PaidLeaveOverviewItem, PaidLeaveLedgerEntry } from '../../types';
import { Header, Loading, Modal, Spinner } from '../../components/common';
import { daysBetweenYmd, formatYmdJp, formatYmdSlash, isYmd } from '../../utils/paidLeaveGrant';

// 年 5 日の取得がまだ足りず、期限まで残りこの日数以下なら注意の色で知らせる
const OBLIGATION_WARN_DAYS = 90;

// 小さいボタン（見た目は高さ 32px）の押せる範囲を、上下に広げて 44px にする
const SMALL_BUTTON_HIT = "relative after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']";

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 'YYYY-MM-DD' → '2026年10月21日（水）' */
function formatYmdWithWeekday(ymd: string): string {
  if (!isYmd(ymd)) return ymd;
  const [y, m, d] = ymd.split('-').map(Number);
  return `${formatYmdJp(ymd)}（${WEEKDAYS[new Date(y, m - 1, d).getDay()]}）`;
}

/** 申請日（ISO の日時）→ '2026/11/10'（端末の日付） */
function formatDateTime(value: string): string {
  if (!value) return '';
  if (isYmd(value)) return formatYmdSlash(value);
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

const LEDGER_LABELS: Record<PaidLeaveLedgerEntry['kind'], { text: string; pill: string }> = {
  grant: { text: '付与', pill: 'pill-success' },
  lapse: { text: '時効', pill: 'pill-neutral' },
  start: { text: '開始', pill: 'pill-info' },
  adjust: { text: '調整', pill: 'pill-tint' },
};

type RegisterDraft = { staffId: string; name: string; leaveDate: string; remarks: string; balance: number };

export function PaidLeaveManagement() {
  const navigate = useNavigate();
  const { isAdmin, isAuthenticated } = useAuth();
  const formId = useId();

  const [overview, setOverview] = useState<PaidLeaveOverviewItem[]>([]);
  const [requests, setRequests] = useState<PaidLeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 有給の登録
  const [regStaffId, setRegStaffId] = useState('');
  const [regDate, setRegDate] = useState('');
  const [regRemarks, setRegRemarks] = useState('');
  const [confirmDraft, setConfirmDraft] = useState<RegisterDraft | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const registerSectionRef = useRef<HTMLElement>(null);

  // シフト表で有給なのに未登録の日 → 登録欄にスタッフと日付を入れる（登録は確認してから）
  const prefillRegister = (staffId: string, date: string) => {
    setRegStaffId(staffId);
    setRegDate(date);
    setRegisterError('');
    registerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // 承認済みの取り消し
  const [cancelTarget, setCancelTarget] = useState<PaidLeaveRequest | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // 付与の履歴を開いているスタッフ
  const [openLedger, setOpenLedger] = useState<Set<string>>(new Set());

  // Redirect if not admin
  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      navigate('/');
    }
  }, [isAuthenticated, isAdmin, navigate]);

  const fetchData = useCallback(async () => {
    try {
      const [ovRes, allRes] = await Promise.all([paidLeaveApi.overview(), paidLeaveApi.getAll()]);
      if (ovRes.success && ovRes.data) {
        setOverview(ovRes.data);
      } else {
        setMessage({ type: 'error', text: ovRes.error || 'スタッフ別の有給の取得に失敗しました' });
      }
      if (allRes.success && allRes.data) {
        setRequests(allRes.data);
      } else {
        setMessage({ type: 'error', text: allRes.error || '申請の取得に失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: 'データの取得に失敗しました' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleApprove = async (requestId: string) => {
    try {
      const response = await paidLeaveApi.updateStatus(requestId, 'approved');
      if (response.success) {
        setMessage({ type: 'success', text: '有給休暇を承認しました' });
        await fetchData();
      } else {
        setMessage({ type: 'error', text: response.error || '承認に失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: '承認に失敗しました' });
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      const response = await paidLeaveApi.updateStatus(requestId, 'rejected');
      if (response.success) {
        setMessage({ type: 'success', text: '有給休暇を却下しました' });
        await fetchData();
      } else {
        setMessage({ type: 'error', text: response.error || '却下に失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: '却下に失敗しました' });
    }
  };

  // 登録ボタン → 確認のシートを開く
  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError('');
    const staff = overview.find(s => s.staffId === regStaffId);
    if (!staff) {
      setRegisterError('スタッフを選んでください');
      return;
    }
    if (!isYmd(regDate)) {
      setRegisterError('日付を選んでください');
      return;
    }
    setConfirmDraft({ staffId: staff.staffId, name: staff.name, leaveDate: regDate, remarks: regRemarks.trim(), balance: staff.balance });
  };

  const handleRegisterConfirm = async () => {
    if (!confirmDraft) return;
    setIsRegistering(true);
    try {
      const res = await paidLeaveApi.register(confirmDraft.staffId, confirmDraft.leaveDate, confirmDraft.remarks || undefined);
      if (res.success && res.data) {
        const removed = res.data.removedOffDays > 0 ? '同じ日の希望休を取り消しました。' : '';
        const converted = res.data.convertedPending ? '承認待ちだった申請を承認済みにしました。' : '';
        setMessage({
          type: 'success',
          text: `${confirmDraft.name}さんの${formatYmdJp(confirmDraft.leaveDate)}を有給として登録しました（残り ${res.data.balance} 日）。${converted}${removed}`,
        });
        setConfirmDraft(null);
        setRegDate('');
        setRegRemarks('');
        await fetchData();
      } else {
        setRegisterError(res.error || '登録に失敗しました');
        setConfirmDraft(null);
      }
    } catch {
      setRegisterError('登録に失敗しました');
      setConfirmDraft(null);
    } finally {
      setIsRegistering(false);
    }
  };

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return;
    setIsCancelling(true);
    try {
      const res = await paidLeaveApi.updateStatus(cancelTarget.id, 'rejected', '管理者が取り消し');
      if (res.success) {
        setMessage({ type: 'success', text: `${cancelTarget.name}さんの${formatYmdJp(cancelTarget.leaveDate)}の有給を取り消しました（残日数が 1 日戻りました）` });
        setCancelTarget(null);
        await fetchData();
      } else {
        setMessage({ type: 'error', text: res.error || '取り消しに失敗しました' });
        setCancelTarget(null);
      }
    } catch {
      setMessage({ type: 'error', text: '取り消しに失敗しました' });
      setCancelTarget(null);
    } finally {
      setIsCancelling(false);
    }
  };

  const toggleLedger = (staffId: string) => {
    setOpenLedger(prev => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });
  };

  const getStatusBadge = (status: PaidLeaveRequest['status']) => {
    switch (status) {
      case 'pending':
        return <span className="pill pill-warning flex-shrink-0">申請中</span>;
      case 'approved':
        return <span className="pill pill-success flex-shrink-0">承認済</span>;
      case 'rejected':
        return <span className="pill pill-danger flex-shrink-0">却下</span>;
    }
  };

  const pendingRequests = requests
    .filter(r => r.status === 'pending')
    .sort((a, b) => (a.leaveDate < b.leaveDate ? -1 : 1));
  const processedRequests = requests
    .filter(r => r.status !== 'pending')
    .sort((a, b) => (a.leaveDate < b.leaveDate ? 1 : -1));

  return (
    <div className="page">
      <Header title="有給休暇" backTo="/admin/more" backLabel="その他" backMobileOnly />

      <main className="page-content">
        {/* 結果のお知らせ */}
        {message && (
          <div
            className={`callout mt-2 ${message.type === 'success' ? 'callout-success' : 'callout-danger'}`}
            role={message.type === 'error' ? 'alert' : 'status'}
          >
            {message.type === 'success' ? <CheckCircle2 aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
            <p className="font-medium break-words">{message.text}</p>
          </div>
        )}

        {isLoading ? (
          <div className="card mt-2">
            <Loading message="読み込み中..." />
          </div>
        ) : (
          <>
            {/* 承認待ちの申請（このページで主に行う操作なので先頭に置く） */}
            <section className="section">
              <h2 className="section-header">
                承認待ち申請
                {pendingRequests.length > 0 && <span className="tabular">{pendingRequests.length}件</span>}
              </h2>
              <div className="list-group">
                {pendingRequests.length === 0 ? (
                  <div className="list-row">
                    <span className="t-body text-label-2">承認待ちの申請はありません</span>
                  </div>
                ) : (
                  pendingRequests.map(request => (
                    <div key={request.id} className="list-row">
                      <div className="list-row-title">
                        <p className="t-body truncate">{request.name}</p>
                        <p className="t-footnote text-label-2 tabular">取得希望日: {formatYmdSlash(request.leaveDate)}</p>
                        <p className="t-footnote text-label-2 tabular">申請日: {formatDateTime(request.requestDate)}</p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleApprove(request.id)}
                          className={`btn btn-sm btn-filled ${SMALL_BUTTON_HIT}`}
                        >
                          <Check aria-hidden="true" />
                          承認
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(request.id)}
                          className={`btn btn-sm btn-danger-tinted ${SMALL_BUTTON_HIT}`}
                        >
                          <X aria-hidden="true" />
                          却下
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* 管理者による有給の登録 */}
            <section ref={registerSectionRef} className="section scroll-mt-24" aria-labelledby={`${formId}-title`}>
              <h2 id={`${formId}-title`} className="section-header">有給を登録</h2>
              <form className="card space-y-4" onSubmit={handleRegisterSubmit} noValidate>
                <div>
                  <label htmlFor={`${formId}-staff`} className="label">スタッフ</label>
                  <select
                    id={`${formId}-staff`}
                    value={regStaffId}
                    onChange={e => setRegStaffId(e.target.value)}
                    className="input"
                  >
                    <option value="">選択してください</option>
                    {overview.map(s => (
                      <option key={s.staffId} value={s.staffId}>
                        {s.name}（残り {s.balance} 日）
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`${formId}-date`} className="label">日付</label>
                  <input
                    id={`${formId}-date`}
                    type="date"
                    value={regDate}
                    onChange={e => setRegDate(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label htmlFor={`${formId}-remarks`} className="label">メモ（任意）</label>
                  <input
                    id={`${formId}-remarks`}
                    type="text"
                    value={regRemarks}
                    onChange={e => setRegRemarks(e.target.value)}
                    maxLength={200}
                    placeholder="例: 年末の休み"
                    className="input"
                  />
                </div>
                {registerError && (
                  <div className="callout callout-danger" role="alert">
                    <AlertCircle aria-hidden="true" />
                    <p className="font-medium break-words">{registerError}</p>
                  </div>
                )}
                <button type="submit" className="btn btn-filled btn-block" disabled={!regStaffId || !regDate}>
                  承認済みの有給として登録
                </button>
              </form>
              <p className="section-footer">
                過去の日や、希望休の提出期限を過ぎた月の有給も登録できます。登録すると残日数から 1 日引かれ、同じ日の希望休は取り消されます。
              </p>
            </section>

            {/* スタッフ別 */}
            <section className="section">
              <h2 className="section-header">スタッフ別</h2>
              {overview.length === 0 ? (
                <div className="list-group">
                  <div className="list-row">
                    <span className="t-body text-label-2">在籍中のスタッフがいません</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {overview.map(s => {
                    const isOpen = openLedger.has(s.staffId);
                    const ledgerId = `${formId}-ledger-${s.staffId}`;
                    const ob = s.obligation;
                    const obDone = ob ? ob.taken >= ob.required : false;
                    const obShort = ob ? Math.max(0, ob.required - ob.taken) : 0;
                    const obWarn = !!ob && obShort > 0 && daysBetweenYmd(localDateKey(), ob.periodEnd) <= OBLIGATION_WARN_DAYS;
                    return (
                      <div key={s.staffId} className="list-group">
                        <div className="list-row">
                          <div className="list-row-title">
                            <p className="t-headline truncate">{s.name}</p>
                            <p className="t-footnote text-label-2 tabular">
                              {s.hireDate ? `入社 ${formatYmdSlash(s.hireDate)}` : '入社日が未登録です'}
                            </p>
                          </div>
                          <p className="flex-shrink-0 font-rounded tabular leading-none" aria-label={`残り ${s.balance} 日`}>
                            <span className="text-[28px] font-semibold tracking-tight">{s.balance}</span>
                            <span className="t-subhead ml-0.5 text-label-2">日</span>
                          </p>
                        </div>
                        {s.pending > 0 && (
                          <div className="list-row">
                            <span className="list-row-title t-body">承認待ち</span>
                            <span className="list-row-detail tabular">
                              {s.pending}日（あと {Math.max(0, s.available)} 日申請できる）
                            </span>
                          </div>
                        )}
                        <div className="list-row">
                          <span className="list-row-title t-body">次の付与</span>
                          <span className="list-row-detail tabular">
                            {s.nextGrant
                              ? `${formatYmdSlash(s.nextGrant.date)} に ${s.nextGrant.days}日`
                              : '入社日を登録すると表示されます'}
                          </span>
                        </div>
                        {ob && (
                          <div className="list-row">
                            <div className="list-row-title">
                              <p className="t-body">年5日の取得</p>
                              <p className={`t-footnote tabular ${obWarn ? 'text-warning font-medium' : 'text-label-2'}`}>
                                {formatYmdSlash(ob.periodEnd)} までに {ob.required} 日
                                {obWarn && `（あと ${obShort} 日必要）`}
                              </p>
                            </div>
                            <span
                              className={`list-row-detail tabular ${obDone ? '!text-success' : obWarn ? '!text-warning font-semibold' : ''}`}
                            >
                              {ob.taken} / {ob.required} 日
                            </span>
                          </div>
                        )}
                        {(s.shiftPaidLeaveUnregistered?.length ?? 0) > 0 && (
                          <div className="list-row items-start">
                            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning" aria-hidden="true" />
                            <div className="list-row-title">
                              <p className="t-body">シフト表は有給・まだ未登録</p>
                              <p className="t-footnote text-label-2">
                                残日数は登録したときに減ります。日付を押すと「有給を登録」に入ります。
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {(s.shiftPaidLeaveUnregistered || []).map(d => (
                                  <button
                                    key={d}
                                    type="button"
                                    onClick={() => prefillRegister(s.staffId, d)}
                                    className={`btn btn-sm btn-tinted tabular ${SMALL_BUTTON_HIT}`}
                                    aria-label={`${s.name}さんの${formatYmdSlash(d)}を「有給を登録」に入れる`}
                                  >
                                    {formatYmdSlash(d)}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                        <button
                          type="button"
                          className="list-row"
                          onClick={() => toggleLedger(s.staffId)}
                          aria-expanded={isOpen}
                          aria-controls={ledgerId}
                        >
                          <span className="list-row-title t-body text-tint">付与の履歴</span>
                          <ChevronDown
                            className={`h-4 w-4 flex-shrink-0 text-label-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                            aria-hidden="true"
                          />
                        </button>
                        {isOpen && (
                          <div id={ledgerId}>
                            {s.ledger.length === 0 ? (
                              <div className="list-row">
                                <span className="t-footnote text-label-2">まだ記録はありません（付与日が来ると記録されます）</span>
                              </div>
                            ) : (
                              s.ledger.map((e, i) => {
                                const label = LEDGER_LABELS[e.kind];
                                return (
                                  <div key={`${e.kind}-${e.date}-${i}`} className="list-row items-start">
                                    <span className={`pill ${label.pill} mt-0.5 flex-shrink-0`}>{label.text}</span>
                                    <div className="list-row-title">
                                      <p className="t-subhead tabular">
                                        {formatYmdSlash(e.date)}
                                        {e.kind !== 'start' && (
                                          <span className="ml-2 font-semibold">
                                            {e.days > 0 ? `+${e.days}` : e.days}日
                                          </span>
                                        )}
                                        {e.serviceLength && (
                                          <span className="ml-2 text-label-2">勤続{e.serviceLength}</span>
                                        )}
                                      </p>
                                      {e.kind === 'grant' && e.expiresOn && (
                                        <p className="t-footnote text-label-2 tabular">有効期限 {formatYmdSlash(e.expiresOn)}</p>
                                      )}
                                      {e.remarks && <p className="t-footnote text-label-2 break-words">{e.remarks}</p>}
                                    </div>
                                    {e.balanceAfter !== null && e.balanceAfter !== undefined && (
                                      <span className="t-footnote tabular text-label-2 flex-shrink-0 mt-0.5">残 {e.balanceAfter}日</span>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="callout callout-info mt-3">
                <Info aria-hidden="true" />
                <p className="t-footnote">
                  入社日から6ヶ月で10日、その後1年ごとに11・12・14・16・18・20日を自動で付与します（出勤率8割以上が前提）。付与から2年たって使わなかった分は、古い付与分から先に使ったものとして自動で消えます。週4日以下のパートの方の少ない日数（比例付与）には対応していないため、その場合はスタッフ管理で残日数を調整してください。
                </p>
              </div>
            </section>

            {/* 処理済みの申請 */}
            <section className="section">
              <h2 className="section-header">処理済み申請履歴</h2>
              <div className="list-group">
                {processedRequests.length === 0 ? (
                  <div className="list-row">
                    <span className="t-body text-label-2">処理済みの申請はありません</span>
                  </div>
                ) : (
                  processedRequests.map(request => (
                    <div key={request.id} className="list-row">
                      <div className="list-row-title">
                        <p className="t-body truncate">{request.name}</p>
                        <p className="t-footnote text-label-2 tabular flex flex-wrap gap-x-3">
                          <span>取得日: {formatYmdSlash(request.leaveDate)}</span>
                          <span>申請日: {formatDateTime(request.requestDate)}</span>
                        </p>
                        {request.remarks && <p className="t-footnote text-label-2 break-words">{request.remarks}</p>}
                      </div>
                      <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                        {getStatusBadge(request.status)}
                        {request.status === 'approved' && (
                          <button
                            type="button"
                            onClick={() => setCancelTarget(request)}
                            className={`btn btn-sm btn-plain !px-1 !min-h-0 text-danger ${SMALL_BUTTON_HIT}`}
                            aria-label={`${request.name}さんの${formatYmdSlash(request.leaveDate)}の有給を取り消す`}
                          >
                            取り消す
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </main>

      {/* 登録の確認 */}
      <Modal isOpen={!!confirmDraft} onClose={() => !isRegistering && setConfirmDraft(null)} title="有給を登録しますか？" size="sm">
        {confirmDraft && (
          <div className="space-y-4">
            <div className="list-group">
              <div className="list-row">
                <span className="list-row-title t-body text-label-2">スタッフ</span>
                <span className="t-body font-medium">{confirmDraft.name}</span>
              </div>
              <div className="list-row">
                <span className="list-row-title t-body text-label-2">日付</span>
                <span className="t-body font-medium tabular">{formatYmdWithWeekday(confirmDraft.leaveDate)}</span>
              </div>
              {confirmDraft.remarks && (
                <div className="list-row">
                  <span className="list-row-title t-body text-label-2">メモ</span>
                  <span className="t-body break-words text-right">{confirmDraft.remarks}</span>
                </div>
              )}
            </div>
            <p className="t-footnote text-label-2">
              承認済みの有給として登録し、残日数が {confirmDraft.balance} 日 → {confirmDraft.balance - 1} 日になります。同じ日に希望休がある場合は取り消されます。
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" className="btn btn-gray" onClick={() => setConfirmDraft(null)} disabled={isRegistering}>
                キャンセル
              </button>
              <button type="button" className="btn btn-filled" onClick={handleRegisterConfirm} disabled={isRegistering}>
                {isRegistering ? <Spinner /> : '登録する'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* 取り消しの確認 */}
      <Modal isOpen={!!cancelTarget} onClose={() => !isCancelling && setCancelTarget(null)} title="有給を取り消しますか？" size="sm">
        {cancelTarget && (
          <div className="space-y-4">
            <p className="t-body">
              {cancelTarget.name}さんの{formatYmdWithWeekday(cancelTarget.leaveDate)}の有給を取り消します。残日数が 1 日戻ります。
            </p>
            <p className="t-footnote text-label-2">登録時に取り消した希望休は元に戻りません。必要な場合は希望シフトの画面などで対応してください。</p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" className="btn btn-gray" onClick={() => setCancelTarget(null)} disabled={isCancelling}>
                やめる
              </button>
              <button type="button" className="btn btn-danger" onClick={handleCancelConfirm} disabled={isCancelling}>
                {isCancelling ? <Spinner /> : '取り消す'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
