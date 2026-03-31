import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Palmtree,
  Wallet,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  CheckCircle,
  ClipboardList,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { attendanceApi, paidLeaveApi, salaryApi } from '../../api';
import type { AttendanceRecord, PaidLeaveBalance } from '../../types';
import { Header, Loading, Modal } from '../../components/common';
import { formatMinutesAsTime } from '../../utils/calculations';

type Tab = 'attendance' | 'paidLeave' | 'salary';

export function MyPage() {
  const navigate = useNavigate();
  const { staff, isAuthenticated } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>('attendance');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [paidLeave, setPaidLeave] = useState<PaidLeaveBalance | null>(null);
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

  // Fetch attendance data
  useEffect(() => {
    if (!staff || activeTab !== 'attendance') return;

    async function fetchAttendance() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await attendanceApi.getMonthly(staff!.staffId, selectedYear, selectedMonth);
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

  // Fetch paid leave data
  useEffect(() => {
    if (!staff || activeTab !== 'paidLeave') return;

    async function fetchPaidLeave() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await paidLeaveApi.getBalance(staff!.staffId);
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

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'attendance', label: '勤怠履歴', icon: <Calendar className="w-5 h-5" /> },
    { key: 'paidLeave', label: '有給休暇', icon: <Palmtree className="w-5 h-5" /> },
    { key: 'salary', label: '給与明細', icon: <Wallet className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-secondary-100">
      <Header title="マイページ" />

      <main className="max-w-2xl mx-auto p-4 sm:p-6">
        {/* Back Link + Bulk Entry */}
        <div className="flex items-center justify-between mb-5">
          <Link
            to="/clock"
            className="inline-flex items-center gap-1.5 text-secondary-500 hover:text-primary-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">打刻画面へ戻る</span>
          </Link>
          <Link
            to="/bulk-entry"
            className="btn btn-primary !py-2 !px-4 !text-sm !rounded-xl"
          >
            <ClipboardList className="w-4 h-4" />
            勤怠一括入力
          </Link>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`flex items-center gap-3 px-5 py-4 rounded-xl mb-5 border ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <p className="text-sm font-medium">{message.text}</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 text-red-600 bg-red-50 border border-red-200 px-5 py-4 rounded-xl mb-5">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setError(null); setMessage(null); }}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl whitespace-nowrap transition-all text-sm font-medium ${
                activeTab === tab.key
                  ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/25'
                  : 'bg-white text-secondary-600 hover:bg-primary-50 hover:text-primary-700 border border-secondary-200 hover:border-primary-200'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {activeTab === 'attendance' && (
          <div className="card">
            {/* Month Selector */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={handlePreviousMonth}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <h2 className="text-lg font-semibold">
                {selectedYear}年{selectedMonth}月
              </h2>
              <button
                onClick={handleNextMonth}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {isLoading ? (
              <div className="py-8">
                <Loading message="読み込み中..." />
              </div>
            ) : attendance.length === 0 ? (
              <p className="text-center text-gray-500 py-8">
                この月の勤怠データはありません
              </p>
            ) : (
              <div className="space-y-2">
                {/* Header */}
                <div className="grid grid-cols-5 gap-2 text-xs font-medium text-gray-500 pb-2 border-b">
                  <div>日付</div>
                  <div>出勤</div>
                  <div>退勤</div>
                  <div>休憩</div>
                  <div>実働</div>
                </div>

                {/* Records */}
                {attendance.map(record => (
                  <div
                    key={record.date}
                    className="grid grid-cols-5 gap-2 text-sm py-2 border-b border-gray-100 last:border-0"
                  >
                    <div className="font-medium">{formatDate(record.date)}</div>
                    <div className="text-gray-700">{formatTime(record.clockIn)}</div>
                    <div className="text-gray-700">
                      {formatTime(record.clockOut)}
                      {record.clockOutType === 'early_company' && (
                        <span className="ml-1 text-xs text-blue-600">早上</span>
                      )}
                      {record.clockOutType === 'early_self' && (
                        <span className="ml-1 text-xs text-red-600">早退</span>
                      )}
                    </div>
                    <div className="text-gray-700">
                      {record.breakMinutes > 0 ? `${record.breakMinutes}分` : '-'}
                    </div>
                    <div className="text-gray-900 font-medium">
                      {record.workMinutes > 0 ? formatMinutesAsTime(record.workMinutes) : '-'}
                    </div>
                  </div>
                ))}

                {/* Summary */}
                <div className="pt-4 mt-4 border-t-2 border-gray-200">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">出勤日数</span>
                    <span className="font-medium">
                      {attendance.filter(r => r.workMinutes > 0).length}日
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-gray-600">総労働時間</span>
                    <span className="font-medium">
                      {formatMinutesAsTime(
                        attendance.reduce((sum, r) => sum + r.workMinutes, 0)
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'paidLeave' && (
          <div>
            {/* Balance Card */}
            <div className="card mb-4 text-center">
              <Palmtree className="w-12 h-12 text-green-500 mx-auto mb-2" />
              <p className="text-gray-600 mb-1">有給休暇残日数</p>
              <p className="text-4xl font-bold text-gray-800">
                {isLoading ? '-' : paidLeave?.balance ?? 0}
                <span className="text-lg ml-1">日</span>
              </p>
            </div>

            {/* Request Button */}
            <button
              onClick={() => setShowLeaveModal(true)}
              className="btn btn-primary w-full mb-4"
            >
              有給休暇を申請する
            </button>

            {/* History */}
            <div className="card">
              <h3 className="font-semibold text-gray-800 mb-4">取得履歴</h3>

              {isLoading ? (
                <Loading />
              ) : !paidLeave?.history || paidLeave.history.length === 0 ? (
                <p className="text-center text-gray-500 py-4">
                  取得履歴はありません
                </p>
              ) : (
                <div className="space-y-2">
                  {paidLeave.history.map(request => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                    >
                      <div>
                        <p className="font-medium">{request.leaveDate}</p>
                        <p className="text-xs text-gray-500">
                          申請日: {request.requestDate}
                        </p>
                      </div>
                      <span
                        className={`status-badge ${
                          request.status === 'approved'
                            ? 'status-working'
                            : request.status === 'rejected'
                            ? 'bg-red-100 text-red-800'
                            : 'status-break'
                        }`}
                      >
                        {request.status === 'approved'
                          ? '承認済'
                          : request.status === 'rejected'
                          ? '却下'
                          : '申請中'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'salary' && (
          <div className="card">
            {/* Month Selector */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={handlePreviousMonth}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <h2 className="text-lg font-semibold">
                {selectedYear}年{selectedMonth}月分
              </h2>
              <button
                onClick={handleNextMonth}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="text-center py-8">
              <Wallet className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">
                給与明細をPDFでダウンロードできます
              </p>
              <button
                onClick={handleDownloadPdf}
                className="btn btn-primary"
              >
                PDFをダウンロード
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Paid Leave Request Modal */}
      <Modal
        isOpen={showLeaveModal}
        onClose={() => { setShowLeaveModal(false); setLeaveDate(''); }}
        title="有給休暇申請"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="label">取得希望日</label>
            <input
              type="date"
              value={leaveDate}
              onChange={e => setLeaveDate(e.target.value)}
              className="input"
              min={new Date().toISOString().split('T')[0]}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => { setShowLeaveModal(false); setLeaveDate(''); }}
              className="btn btn-secondary flex-1"
            >
              キャンセル
            </button>
            <button
              onClick={handleRequestPaidLeave}
              disabled={!leaveDate || isRequesting}
              className="btn btn-primary flex-1"
            >
              {isRequesting ? '申請中...' : '申請する'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
