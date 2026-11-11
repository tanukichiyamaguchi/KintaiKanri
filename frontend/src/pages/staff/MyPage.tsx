import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Palmtree,
  Wallet,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  CheckCircle,
  CalendarDays,
  FileText,
  Download,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { attendanceApi, paidLeaveApi, salaryApi, submissionApi } from '../../api';
import type { AttendanceRecord, PaidLeaveBalance, MonthlySubmission, ClockGate } from '../../types';
import { Header, Loading, Modal, SubmissionStatusBadge, SubmissionDeadlineBanner } from '../../components/common';
import { formatLocalDate, formatLocalDateTime, formatMinutesAsTime } from '../../utils/calculations';
import { formatYmdJp } from '../../utils/paidLeaveGrant';

type Tab = 'attendance' | 'paidLeave' | 'salary';

export function MyPage() {
  const navigate = useNavigate();
  const { staff, isAuthenticated, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>('attendance');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [paidLeave, setPaidLeave] = useState<PaidLeaveBalance | null>(null);
  const [submission, setSubmission] = useState<MonthlySubmission | null>(null);
  const [gate, setGate] = useState<ClockGate | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Paid leave request modal
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveDate, setLeaveDate] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated || !staff) {
      navigate('/');
    }
  }, [isAuthenticated, staff, navigate]);

  // 前月出勤簿の提出期限アラート / 打刻ブロック状態を取得（タブや月に依存しない）
  // 出勤簿の提出直後にバナーが消えるよう、フォーカス・タブ復帰でも再取得する
  useEffect(() => {
    if (!staff) return;
    const staffId = staff.staffId;
    const fetchGate = async () => {
      try {
        const res = await submissionApi.clockGate(staffId);
        if (res.success && res.data) setGate(res.data);
      } catch {
        // 非クリティカル: バナーが出ないだけ
      }
    };
    fetchGate();
    const onVisible = () => { if (document.visibilityState === 'visible') fetchGate(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', fetchGate);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', fetchGate);
    };
  }, [staff]);

  // Fetch attendance data
  useEffect(() => {
    if (!staff || activeTab !== 'attendance') return;
    const staffId = staff.staffId;

    async function fetchAttendance() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await attendanceApi.getMonthly(staffId, selectedYear, selectedMonth);
        if (response.success && response.data) {
          setAttendance(response.data);
        } else {
          setError(response.error || '勤怠データの取得に失敗しました');
        }
      } catch {
        setError('勤怠データの取得に失敗しました');
      } finally {
        setIsLoading(false);
      }
    }

    fetchAttendance();
  }, [staff, selectedYear, selectedMonth, activeTab]);

  // Fetch submission status for selected month
  useEffect(() => {
    if (!staff || activeTab !== 'attendance') return;
    const staffId = staff.staffId;

    async function fetchSubmission() {
      const yearMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
      try {
        const response = await submissionApi.getStatus(staffId, yearMonth);
        if (response.success && response.data) {
          setSubmission(response.data);
        } else {
          setSubmission(null);
        }
      } catch {
        setSubmission(null);
      }
    }

    fetchSubmission();
  }, [staff, selectedYear, selectedMonth, activeTab]);

  // Fetch paid leave data
  useEffect(() => {
    if (!staff || activeTab !== 'paidLeave') return;
    const staffId = staff.staffId;

    async function fetchPaidLeave() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await paidLeaveApi.getBalance(staffId);
        if (response.success && response.data) {
          setPaidLeave(response.data);
        } else {
          setError(response.error || '有給情報の取得に失敗しました');
        }
      } catch {
        setError('有給情報の取得に失敗しました');
      } finally {
        setIsLoading(false);
      }
    }

    fetchPaidLeave();
  }, [staff, activeTab]);

  const handlePreviousMonth = () => {
    if (selectedMonth === 1) {
      setSelectedYear(selectedYear - 1);
      setSelectedMonth(12);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedYear(selectedYear + 1);
      setSelectedMonth(1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const handleRequestPaidLeave = async () => {
    if (!staff || !leaveDate) return;

    setIsRequesting(true);
    try {
      const response = await paidLeaveApi.request(staff.staffId, leaveDate);
      if (response.success) {
        setMessage({ type: 'success', text: '有給休暇を申請しました' });
        setShowLeaveModal(false);
        setLeaveDate('');
        // Refresh data
        const balanceResponse = await paidLeaveApi.getBalance(staff.staffId);
        if (balanceResponse.success && balanceResponse.data) {
          setPaidLeave(balanceResponse.data);
        }
      } else {
        setMessage({ type: 'error', text: response.error || '申請に失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: '申請に失敗しました' });
    } finally {
      setIsRequesting(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!staff) return;
    const url = salaryApi.getPdf(staff.staffId, selectedYear, selectedMonth);
    window.open(url, '_blank');
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    return `${date.getDate()}日（${weekdays[date.getDay()]}）`;
  };

  const formatTime = (timeStr?: string): string => {
    if (!timeStr) return '-';
    const date = new Date(timeStr);
    return date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  // 日付の文字色（日曜は赤・土曜は青）
  const weekdayColor = (dateStr: string): string => {
    const day = new Date(dateStr).getDay();
    return day === 0 ? 'text-danger' : day === 6 ? 'text-info' : '';
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'attendance', label: '勤怠履歴' },
    { key: 'paidLeave', label: '有給休暇' },
    { key: 'salary', label: '給与明細' },
  ];

  // 月の切り替えボタン（‹ ›）
  const monthButtonClass =
    'grid h-11 w-11 flex-shrink-0 place-items-center rounded-[10px] text-tint transition-colors enabled:active:bg-fill';
  // 日別の表のセル
  const thClass = 't-footnote font-medium text-label-2 py-2.5 px-1.5 text-right first:pl-4 first:text-left last:pr-4';
  const tdClass = 'whitespace-nowrap py-2.5 px-1.5 text-right first:pl-4 first:text-left last:pr-4';

  return (
    <div className="page">
      <Header title="マイページ" />

      <main className="page-content">
        {/* 出勤簿 提出期限アラート / 打刻ブロック通知 */}
        <SubmissionDeadlineBanner gate={gate} />

        {/* Tabs */}
        <div className="segmented mt-2" role="tablist" aria-label="表示する内容">
          {tabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => { setActiveTab(tab.key); setError(null); setMessage(null); }}
              className="segmented-item"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Message */}
        {message && (
          <div
            className={`callout mt-4 ${message.type === 'success' ? 'callout-success' : 'callout-danger'}`}
            role={message.type === 'error' ? 'alert' : 'status'}
          >
            {message.type === 'success' ? (
              <CheckCircle aria-hidden="true" />
            ) : (
              <AlertCircle aria-hidden="true" />
            )}
            <p className="font-medium break-words">{message.text}</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="callout callout-danger mt-4" role="alert">
            <AlertCircle aria-hidden="true" />
            <p className="font-medium break-words">{error}</p>
          </div>
        )}

        {/* 勤怠履歴: Month Selector */}
        {activeTab === 'attendance' && (
          <section className="section">
            <div className="card !p-1.5 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handlePreviousMonth}
                className={monthButtonClass}
                aria-label="前月"
              >
                <ChevronLeft className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
              </button>
              <h2 className="t-headline tabular text-center">
                {selectedYear}年{selectedMonth}月
              </h2>
              <button
                type="button"
                onClick={handleNextMonth}
                className={monthButtonClass}
                aria-label="次月"
              >
                <ChevronRight className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>
          </section>
        )}

        {/* Submission Status (attendance tab only) */}
        {activeTab === 'attendance' && submission && (
          <section className="section">
            <div className="list-group">
              <div className="list-row">
                <span className="list-row-title t-body">
                  {selectedYear}年{selectedMonth}月の提出状況
                </span>
                <SubmissionStatusBadge status={submission.status} />
              </div>
              {submission.status === 'rejected' && submission.rejectionReason && (
                <div className="list-row">
                  <p className="list-row-title t-subhead text-danger break-words">
                    差戻理由: {submission.rejectionReason}
                  </p>
                </div>
              )}
            </div>
            {(submission.status === 'submitted' || submission.status === 'approved') && (
              <p className="section-footer">編集ロック中</p>
            )}
          </section>
        )}

        {/* 勤怠履歴: Content */}
        {activeTab === 'attendance' && (
          isLoading ? (
            <div className="card mt-4 py-8">
              <Loading message="読み込み中..." />
            </div>
          ) : attendance.length === 0 ? (
            <div className="card mt-4 py-8 text-center">
              <p className="t-subhead text-label-2">この月の勤怠データはありません</p>
            </div>
          ) : (
            <>
              {/* Summary */}
              <section className="section">
                <div className="card grid grid-cols-2 gap-3">
                  <div className="tile">
                    <p className="t-footnote text-label-2">出勤日数</p>
                    <p className="t-title2 tabular mt-1">
                      {attendance.filter(r => r.workMinutes > 0).length}
                      <span className="t-subhead ml-0.5 font-normal text-label-2">日</span>
                    </p>
                  </div>
                  <div className="tile">
                    <p className="t-footnote text-label-2">総労働時間</p>
                    <p className="t-title2 tabular mt-1">
                      {formatMinutesAsTime(
                        attendance.reduce((sum, r) => sum + r.workMinutes, 0)
                      )}
                    </p>
                  </div>
                </div>
              </section>

              {/* Records */}
              <section className="section">
                <div className="card !p-0 overflow-x-auto">
                  <table className="w-full t-subhead tabular">
                    <thead>
                      <tr>
                        <th scope="col" className={thClass}>日付</th>
                        <th scope="col" className={thClass}>出勤</th>
                        <th scope="col" className={thClass}>退勤</th>
                        <th scope="col" className={thClass}>休憩</th>
                        <th scope="col" className={thClass}>実働</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.map(record => (
                        <tr key={record.date} className="border-t-[0.5px] border-separator">
                          <td className={`${tdClass} ${weekdayColor(record.date)}`}>{formatDate(record.date)}</td>
                          <td className={tdClass}>{formatTime(record.clockIn)}</td>
                          <td className={tdClass}>
                            {formatTime(record.clockOut)}
                          </td>
                          <td className={tdClass}>
                            {record.breakMinutes > 0 ? `${record.breakMinutes}分` : '-'}
                          </td>
                          <td className={`${tdClass} font-medium`}>
                            {record.workMinutes > 0 ? formatMinutesAsTime(record.workMinutes) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )
        )}

        {activeTab === 'paidLeave' && (
          <>
            {/* Balance Card */}
            <section className="section">
              <div className="card !pt-6 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-icon-green text-white">
                  <Palmtree className="h-7 w-7" aria-hidden="true" />
                </span>
                <p className="t-subhead mt-3 text-label-2">有給休暇残日数</p>
                <p className="mt-1.5 font-rounded tabular leading-none">
                  <span className="text-[48px] font-semibold tracking-tight">
                    {isLoading ? '-' : paidLeave?.balance ?? 0}
                  </span>
                  <span className="t-title3 ml-1 text-label-2">日</span>
                </p>
                {!isLoading && paidLeave?.nextGrant && (
                  <p className="t-footnote mt-3 text-label-2 tabular">
                    次の付与: {formatYmdJp(paidLeave.nextGrant.date)}に{paidLeave.nextGrant.days}日
                  </p>
                )}

                {/* Request Button */}
                <button
                  type="button"
                  onClick={() => setShowLeaveModal(true)}
                  className="btn btn-filled btn-block mt-6"
                >
                  有給休暇を申請する
                </button>
              </div>
            </section>

            {/* History */}
            <section className="section">
              <h2 className="section-header">取得履歴</h2>
              <div className="list-group">
                {isLoading ? (
                  <div className="py-6">
                    <Loading />
                  </div>
                ) : !paidLeave?.history || paidLeave.history.length === 0 ? (
                  <div className="list-row">
                    <span className="t-body text-label-2">取得履歴はありません</span>
                  </div>
                ) : (
                  paidLeave.history.map(request => (
                    <div key={request.id} className="list-row">
                      <div className="list-row-title">
                        <p className="t-body tabular truncate">{request.leaveDate}</p>
                        <p className="t-footnote tabular text-label-2 truncate">
                          申請日: {formatLocalDateTime(request.requestDate)}
                        </p>
                      </div>
                      <span
                        className={`pill flex-shrink-0 ${
                          request.status === 'approved'
                            ? 'pill-success'
                            : request.status === 'rejected'
                            ? 'pill-danger'
                            : 'pill-warning'
                        }`}
                      >
                        {request.status === 'approved'
                          ? '承認済'
                          : request.status === 'rejected'
                          ? '却下'
                          : '申請中'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}

        {activeTab === 'salary' && (
          <>
            {/* Month Selector */}
            <section className="section">
              <div className="card !p-1.5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handlePreviousMonth}
                  className={monthButtonClass}
                  aria-label="前月"
                >
                  <ChevronLeft className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
                </button>
                <h2 className="t-headline tabular text-center">
                  {selectedYear}年{selectedMonth}月分
                </h2>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className={monthButtonClass}
                  aria-label="次月"
                >
                  <ChevronRight className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
                </button>
              </div>
            </section>

            <section className="section">
              <div className="card py-8 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-icon-purple text-white">
                  <Wallet className="h-7 w-7" aria-hidden="true" />
                </span>
                <p className="t-subhead mt-3 text-label-2">
                  給与明細をPDFでダウンロードできます
                </p>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="btn btn-filled mt-5"
                >
                  <Download aria-hidden="true" />
                  PDFをダウンロード
                </button>
              </div>
            </section>
          </>
        )}

        {/* 出勤簿・申請一覧へ */}
        <section className="section">
          <div className="list-group">
            <Link to="/attendance" className="list-row list-row-with-icon">
              <span className="row-icon bg-icon-blue">
                <CalendarDays aria-hidden="true" />
              </span>
              <span className="list-row-title t-body">出勤簿</span>
              <ChevronRight className="list-chevron !w-4 !h-4" strokeWidth={2.5} aria-hidden="true" />
            </Link>
            <Link to="/applications" className="list-row list-row-with-icon">
              <span className="row-icon bg-icon-orange">
                <FileText aria-hidden="true" />
              </span>
              <span className="list-row-title t-body">申請一覧</span>
              <ChevronRight className="list-chevron !w-4 !h-4" strokeWidth={2.5} aria-hidden="true" />
            </Link>
          </div>
        </section>

        {/* アカウント */}
        <section className="section">
          <h2 className="section-header">アカウント</h2>
          <div className="list-group">
            <div className="list-row">
              <span className="list-row-title t-body truncate">{staff?.name}</span>
              <span className="t-subhead text-label-2 truncate max-w-[55%]">{staff?.email}</span>
            </div>
            <button type="button" onClick={logout} className="list-row justify-center text-danger">
              <LogOut className="h-5 w-5" aria-hidden="true" />
              <span className="t-body">ログアウト</span>
            </button>
          </div>
        </section>
      </main>

      {/* Paid Leave Request Modal */}
      <Modal
        isOpen={showLeaveModal}
        onClose={() => { setShowLeaveModal(false); setLeaveDate(''); }}
        title="有給休暇申請"
        size="sm"
      >
        <div className="pt-2">
          <label className="block">
            <span className="label">取得希望日</span>
            <input
              type="date"
              value={leaveDate}
              onChange={e => setLeaveDate(e.target.value)}
              className="input"
              min={formatLocalDate(new Date())}
            />
          </label>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => { setShowLeaveModal(false); setLeaveDate(''); }}
              className="btn btn-gray"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleRequestPaidLeave}
              disabled={!leaveDate || isRequesting}
              className="btn btn-filled"
            >
              {isRequesting ? '申請中...' : '申請する'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
