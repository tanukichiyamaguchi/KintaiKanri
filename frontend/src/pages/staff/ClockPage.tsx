import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Play,
  LogOut,
  Clock as ClockIcon,
  AlertCircle,
  CheckCircle,
  Building,
  User,
  ChevronRight,
  Loader2,
  ListChecks,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { attendanceApi } from '../../api';
import type { ClockType, WorkStatus, ClockRecord } from '../../types';
import { Header, Clock, Loading, Modal } from '../../components/common';

export function ClockPage() {
  const navigate = useNavigate();
  const { staff, isAuthenticated } = useAuth();

  const [status, setStatus] = useState<WorkStatus>('not_started');
  const [records, setRecords] = useState<ClockRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClocking, setIsClocking] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingClockType, setPendingClockType] = useState<ClockType | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated || !staff) {
      navigate('/');
    }
  }, [isAuthenticated, staff, navigate]);

  const fetchTodayAttendance = useCallback(async () => {
    if (!staff) return;
    try {
      const response = await attendanceApi.getToday(staff.staffId);
      if (response.success && response.data) {
        setStatus(response.data.status || 'not_started');
        setRecords(response.data.records || []);
      }
    } catch {
      setMessage({ type: 'error', text: '勤怠情報の取得に失敗しました' });
    } finally {
      setIsLoading(false);
    }
  }, [staff]);

  useEffect(() => {
    fetchTodayAttendance();
  }, [fetchTodayAttendance]);

  const handleClock = async (type: ClockType) => {
    if (!staff) return;
    if (type === 'clock_out' || type === 'early_leave_company' || type === 'early_leave_self') {
      setPendingClockType(type);
      setShowConfirmModal(true);
      return;
    }
    await performClock(type);
  };

  const performClock = async (type: ClockType) => {
    if (!staff) return;
    setIsClocking(true);
    setMessage(null);
    setShowConfirmModal(false);
    setPendingClockType(null);

    try {
      const response = await attendanceApi.clock(staff.staffId, type);
      if (response.success) {
        const typeLabels: Record<ClockType, string> = {
          clock_in: '出勤',
          clock_out: '退勤',
          early_leave_company: '早上がり',
          early_leave_self: '早退',
        };
        setMessage({ type: 'success', text: `${typeLabels[type]}を記録しました` });
        await fetchTodayAttendance();
      } else {
        setMessage({ type: 'error', text: response.error || '打刻に失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: '打刻に失敗しました' });
    } finally {
      setIsClocking(false);
    }
  };

  const getButtonState = (type: ClockType): { disabled: boolean; active: boolean } => {
    const isWorking = status === 'working';
    const isFinished = status === 'finished';
    const hasClockIn = records.some(r => r.type === 'clock_in');
    const hasClockOut = records.some(r =>
      ['clock_out', 'early_leave_company', 'early_leave_self'].includes(r.type)
    );
    const clockedIn = isWorking || isFinished || hasClockIn;
    const clockedOut = isFinished || hasClockOut;

    switch (type) {
      case 'clock_in':
        return { disabled: clockedIn, active: clockedIn };
      case 'clock_out':
      case 'early_leave_company':
      case 'early_leave_self':
        return { disabled: !isWorking || clockedOut, active: clockedOut };
      default:
        return { disabled: false, active: false };
    }
  };

  const formatTime = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('ja-JP', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  };

  const getStatusLabel = (s: WorkStatus): { text: string; class: string } => {
    switch (s) {
      case 'not_started': return { text: '未出勤', class: 'status-badge status-off' };
      case 'working': return { text: '勤務中', class: 'status-badge status-working pulse-gold' };
      case 'finished': return { text: '退勤済み', class: 'status-badge status-finished' };
      default: return { text: '', class: '' };
    }
  };

  const getTypeLabel = (type: ClockType): string => {
    const labels: Record<ClockType, string> = {
      clock_in: '出勤',
      clock_out: '退勤',
      early_leave_company: '早上がり',
      early_leave_self: '早退',
    };
    return labels[type] || type;
  };

  const statusInfo = getStatusLabel(status);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-secondary-100">
        <Header title="打刻" />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <Loading message="読み込み中..." />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-secondary-100">
      <Header title="打刻" />

      <main className="max-w-lg mx-auto p-4">
        {/* Clock Display */}
        <div className="card card-gold text-center mb-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-primary-200/20 to-transparent rounded-full" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-primary-200/20 to-transparent rounded-full" />
          <div className="relative">
            <Clock size="lg" showDate={true} />
            <div className="mt-6 flex justify-center">
              <span className={statusInfo.class}>{statusInfo.text}</span>
            </div>
          </div>
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
            <p className="font-medium">{message.text}</p>
          </div>
        )}

        {/* Clock Buttons */}
        <div className="grid grid-cols-1 gap-4 mb-6">
          {/* 出勤 - full width */}
          <button
            onClick={() => handleClock('clock_in')}
            disabled={getButtonState('clock_in').disabled || isClocking}
            className={`relative group flex items-center justify-center gap-3 h-24 rounded-2xl font-semibold transition-all duration-300 ${
              getButtonState('clock_in').active
                ? 'bg-green-50 text-green-700 border-2 border-green-300'
                : 'bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg shadow-green-500/25 hover:shadow-xl hover:shadow-green-500/35 hover:-translate-y-0.5'
            } ${getButtonState('clock_in').disabled && !getButtonState('clock_in').active ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Play className="w-7 h-7" />
            <span className="text-xl">出勤</span>
            {getButtonState('clock_in').active && (
              <span className="absolute top-2 right-2 text-xs bg-green-200 text-green-700 px-2.5 py-0.5 rounded-full font-bold">済</span>
            )}
          </button>

          {/* 退勤系 3種 */}
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => handleClock('clock_out')}
              disabled={getButtonState('clock_out').disabled || isClocking}
              className={`relative flex flex-col items-center justify-center gap-1 h-24 rounded-2xl font-semibold transition-all duration-300 ${
                getButtonState('clock_out').active
                  ? 'bg-primary-50 text-primary-700 border-2 border-primary-300'
                  : 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/35 hover:-translate-y-0.5'
              } ${getButtonState('clock_out').disabled && !getButtonState('clock_out').active ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <LogOut className="w-6 h-6" />
              <span className="text-base">退勤</span>
            </button>

            <button
              onClick={() => handleClock('early_leave_company')}
              disabled={getButtonState('early_leave_company').disabled || isClocking}
              className={`flex flex-col items-center justify-center gap-1 h-24 rounded-2xl font-semibold transition-all duration-300 bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/35 hover:-translate-y-0.5 ${
                getButtonState('early_leave_company').disabled ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <Building className="w-5 h-5" />
              <span className="text-sm">早上がり</span>
              <span className="text-[10px] opacity-80">(会社都合)</span>
            </button>

            <button
              onClick={() => handleClock('early_leave_self')}
              disabled={getButtonState('early_leave_self').disabled || isClocking}
              className={`flex flex-col items-center justify-center gap-1 h-24 rounded-2xl font-semibold transition-all duration-300 bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:shadow-red-500/35 hover:-translate-y-0.5 ${
                getButtonState('early_leave_self').disabled ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <User className="w-5 h-5" />
              <span className="text-sm">早退</span>
              <span className="text-[10px] opacity-80">(自己都合)</span>
            </button>
          </div>
        </div>

        {/* 補足: 休憩は法定通り自動付与 */}
        <div className="bg-primary-50/50 border border-primary-200/50 rounded-2xl px-5 py-3 mb-5 text-sm text-secondary-600">
          休憩時間は退勤時に法定通り（拘束9h超→60分 / 6h45m超→45分）自動付与されます。実態と異なる場合は出勤簿で修正してください。
        </div>

        {/* Loading overlay */}
        {isClocking && (
          <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-40">
            <div className="bg-white p-10 rounded-3xl shadow-2xl border border-primary-100 flex flex-col items-center gap-5">
              <Loader2 className="w-12 h-12 text-primary-500 animate-spin" />
              <p className="text-secondary-700 font-semibold text-lg">打刻中...</p>
            </div>
          </div>
        )}

        {/* Today's Records */}
        <div className="card mb-4">
          <h3 className="font-semibold text-secondary-800 mb-5 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
              <ClockIcon className="w-4 h-4 text-primary-600" />
            </div>
            本日の記録
          </h3>

          {records.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-secondary-50 flex items-center justify-center">
                <ClockIcon className="w-8 h-8 text-secondary-300" />
              </div>
              <p className="text-secondary-400">まだ打刻がありません</p>
            </div>
          ) : (
            <div className="space-y-2">
              {records.map((record, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-3.5 px-5 bg-secondary-50 rounded-xl border border-secondary-100"
                >
                  <span className="text-secondary-700 font-medium">{getTypeLabel(record.type)}</span>
                  <span className="font-mono text-secondary-900 font-semibold text-lg">{formatTime(record.time)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <div className="space-y-2">
          <Link
            to="/attendance"
            className="flex items-center justify-between w-full p-4 bg-white rounded-xl border border-secondary-200 hover:border-primary-300 hover:shadow-md transition-all group"
          >
            <span className="text-secondary-700 font-medium group-hover:text-primary-600 flex items-center gap-2.5">
              <ListChecks className="w-5 h-5 text-primary-500" />
              出勤簿（修正・申請・提出）
            </span>
            <ChevronRight className="w-5 h-5 text-secondary-400 group-hover:text-primary-500 group-hover:translate-x-1 transition-all" />
          </Link>
          <Link
            to="/mypage"
            className="flex items-center justify-between w-full p-4 bg-white rounded-xl border border-secondary-200 hover:border-primary-300 hover:shadow-md transition-all group"
          >
            <span className="text-secondary-700 font-medium group-hover:text-primary-600">マイページへ</span>
            <ChevronRight className="w-5 h-5 text-secondary-400 group-hover:text-primary-500 group-hover:translate-x-1 transition-all" />
          </Link>
        </div>
      </main>

      {/* Confirmation Modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => {
          setShowConfirmModal(false);
          setPendingClockType(null);
        }}
        title="確認"
        size="sm"
      >
        <div className="text-center py-6">
          <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-primary-50 flex items-center justify-center">
            <LogOut className="w-10 h-10 text-primary-600" />
          </div>
          <p className="text-secondary-700 mb-8 whitespace-pre-line text-lg">
            {pendingClockType === 'clock_out' && '退勤しますか？'}
            {pendingClockType === 'early_leave_company' && '早上がり（会社都合）で\n退勤しますか？'}
            {pendingClockType === 'early_leave_self' && '早退（自己都合）で退勤しますか？\n※控除の対象となります'}
          </p>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowConfirmModal(false);
                setPendingClockType(null);
              }}
              className="btn btn-secondary flex-1"
            >
              キャンセル
            </button>
            <button
              onClick={() => pendingClockType && performClock(pendingClockType)}
              className={`btn flex-1 ${
                pendingClockType === 'early_leave_self' ? 'btn-danger' : 'btn-primary'
              }`}
            >
              確定
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
