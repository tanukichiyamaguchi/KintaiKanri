import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Play,
  LogOut,
  Clock as ClockIcon,
  AlertCircle,
  CheckCircle,
  ChevronRight,
  Loader2,
  ListChecks,
  CalendarDays,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { attendanceApi, submissionApi } from '../../api';
import type { ClockType, WorkStatus, ClockRecord, ClockGate } from '../../types';
import { Header, Clock, Loading, Modal, SubmissionDeadlineBanner } from '../../components/common';

export function ClockPage() {
  const navigate = useNavigate();
  const { staff, isAuthenticated } = useAuth();

  const [status, setStatus] = useState<WorkStatus>('not_started');
  const [records, setRecords] = useState<ClockRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClocking, setIsClocking] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [gate, setGate] = useState<ClockGate | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !staff) {
      navigate('/');
    }
  }, [isAuthenticated, staff, navigate]);

  const fetchTodayAttendance = useCallback(async () => {
    if (!staff) return;
    try {
      const [todayRes, gateRes] = await Promise.all([
        attendanceApi.getToday(staff.staffId),
        submissionApi.clockGate(staff.staffId),
      ]);
      if (todayRes.success && todayRes.data) {
        setStatus(todayRes.data.status || 'not_started');
        setRecords(todayRes.data.records || []);
      }
      if (gateRes.success && gateRes.data) {
        setGate(gateRes.data);
      }
    } catch {
      setMessage({ type: 'error', text: '勤怠情報の取得に失敗しました' });
    } finally {
      setIsLoading(false);
    }
  }, [staff]);

  useEffect(() => {
    fetchTodayAttendance();
    // タブに戻ってきた時 / フォーカス時に即時更新（出勤簿提出直後の古いゲート状態を解消）
    const onVisible = () => { if (document.visibilityState === 'visible') fetchTodayAttendance(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', fetchTodayAttendance);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', fetchTodayAttendance);
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
    setIsClocking(true);
    setMessage(null);
    setShowConfirmModal(false);

    try {
      const response = await attendanceApi.clock(staff.staffId, type);
      if (response.success) {
        const label = type === 'clock_in' ? '出勤' : '退勤';
        setMessage({ type: 'success', text: `${label}を記録しました` });
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

  const isWorking = status === 'working';
  const isFinished = status === 'finished';
  const hasClockIn = records.some(r => r.type === 'clock_in');
  const hasClockOut = records.some(r => r.type === 'clock_out');
  // 【撤去】前月出勤簿の未提出による打刻ブロックは廃止。打刻の可否はゲートに依存しない。
  const clockInDisabled = isWorking || isFinished || hasClockIn;
  const clockOutDisabled = !isWorking || isFinished || hasClockOut;

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
    return type === 'clock_in' ? '出勤' : '退勤';
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

      <main className="max-w-lg mx-auto p-3 sm:p-4">
        {/* Clock Display */}
        <div className="card card-gold text-center mb-4 sm:mb-6 relative overflow-hidden !p-5 sm:!p-7">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-primary-200/20 to-transparent rounded-full" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-primary-200/20 to-transparent rounded-full" />
          <div className="relative">
            <Clock size="lg" showDate={true} />
            <div className="mt-4 sm:mt-6 flex justify-center">
              <span className={statusInfo.class}>{statusInfo.text}</span>
            </div>
          </div>
        </div>

        {/* 出勤簿 提出期限アラート / 打刻ブロック通知 */}
        <SubmissionDeadlineBanner gate={gate} />

        {/* Message */}
        {message && (
          <div
            className={`flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-4 rounded-xl mb-4 sm:mb-5 border ${
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
            <p className="font-medium text-sm sm:text-base break-words">{message.text}</p>
          </div>
        )}

        {/* Clock Buttons */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
          <button
            onClick={handleClockIn}
            disabled={clockInDisabled || isClocking}
            className={`relative group flex flex-col items-center justify-center gap-2 h-32 sm:h-28 rounded-2xl font-semibold transition-all duration-300 active:scale-95 ${
              hasClockIn
                ? 'bg-green-50 text-green-700 border-2 border-green-300'
                : 'bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg shadow-green-500/25 hover:shadow-xl hover:shadow-green-500/35 hover:-translate-y-0.5'
            } ${clockInDisabled && !hasClockIn ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Play className="w-8 h-8 sm:w-7 sm:h-7" />
            <span className="text-lg sm:text-lg">出勤</span>
            {hasClockIn && (
              <span className="absolute top-2 right-2 text-xs bg-green-200 text-green-700 px-2.5 py-0.5 rounded-full font-bold">済</span>
            )}
          </button>

          <button
            onClick={handleClockOutClick}
            disabled={clockOutDisabled || isClocking}
            className={`relative group flex flex-col items-center justify-center gap-2 h-32 sm:h-28 rounded-2xl font-semibold transition-all duration-300 active:scale-95 ${
              hasClockOut
                ? 'bg-primary-50 text-primary-700 border-2 border-primary-300'
                : 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/35 hover:-translate-y-0.5'
            } ${clockOutDisabled && !hasClockOut ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <LogOut className="w-8 h-8 sm:w-7 sm:h-7" />
            <span className="text-lg sm:text-lg">退勤</span>
            {hasClockOut && (
              <span className="absolute top-2 right-2 text-xs bg-primary-200 text-primary-700 px-2.5 py-0.5 rounded-full font-bold">済</span>
            )}
          </button>
        </div>

        {/* 補足 */}
        <div className="bg-primary-50/50 border border-primary-200/50 rounded-2xl px-4 sm:px-5 py-3 mb-4 sm:mb-5 text-xs sm:text-sm text-secondary-600 leading-relaxed">
          休憩時間は退勤時に法定通り（拘束9h超→60分 / 6h45m超→45分）自動付与されます。実態と異なる場合は出勤簿で修正してください。
        </div>

        {/* Loading overlay */}
        {isClocking && (
          <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-40 p-4">
            <div className="bg-white p-8 sm:p-10 rounded-3xl shadow-2xl border border-primary-100 flex flex-col items-center gap-4 sm:gap-5">
              <Loader2 className="w-10 h-10 sm:w-12 sm:h-12 text-primary-500 animate-spin" />
              <p className="text-secondary-700 font-semibold text-base sm:text-lg">打刻中...</p>
            </div>
          </div>
        )}

        {/* Today's Records */}
        <div className="card mb-4 !p-5 sm:!p-7">
          <h3 className="font-semibold text-secondary-800 mb-4 sm:mb-5 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
              <ClockIcon className="w-4 h-4 text-primary-600" />
            </div>
            本日の記録
          </h3>

          {records.length === 0 ? (
            <div className="text-center py-8 sm:py-10">
              <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-2xl bg-secondary-50 flex items-center justify-center">
                <ClockIcon className="w-7 h-7 sm:w-8 sm:h-8 text-secondary-300" />
              </div>
              <p className="text-secondary-400 text-sm sm:text-base">まだ打刻がありません</p>
            </div>
          ) : (
            <div className="space-y-2">
              {records.map((record, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-3 sm:py-3.5 px-4 sm:px-5 bg-secondary-50 rounded-xl border border-secondary-100 min-h-11"
                >
                  <span className="text-secondary-700 font-medium text-sm sm:text-base">{getTypeLabel(record.type)}</span>
                  <span className="font-mono text-secondary-900 font-semibold text-base sm:text-lg">{formatTime(record.time)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <div className="space-y-2">
          <Link
            to="/attendance"
            className="flex items-center justify-between w-full p-4 min-h-[56px] bg-white rounded-xl border border-secondary-200 hover:border-primary-300 hover:shadow-md transition-all group active:scale-[0.99]"
          >
            <span className="text-secondary-700 font-medium group-hover:text-primary-600 flex items-center gap-2 sm:gap-2.5 text-sm sm:text-base min-w-0">
              <ListChecks className="w-5 h-5 text-primary-500 flex-shrink-0" />
              <span className="truncate">出勤簿（修正・申請・提出）</span>
            </span>
            <ChevronRight className="w-5 h-5 text-secondary-400 group-hover:text-primary-500 group-hover:translate-x-1 transition-all flex-shrink-0" />
          </Link>
          <Link
            to="/shift-request"
            className="flex items-center justify-between w-full p-4 min-h-[56px] bg-white rounded-xl border border-secondary-200 hover:border-primary-300 hover:shadow-md transition-all group active:scale-[0.99]"
          >
            <span className="text-secondary-700 font-medium group-hover:text-primary-600 flex items-center gap-2 sm:gap-2.5 text-sm sm:text-base min-w-0">
              <CalendarDays className="w-5 h-5 text-primary-500 flex-shrink-0" />
              <span className="truncate">希望シフト申請</span>
            </span>
            <ChevronRight className="w-5 h-5 text-secondary-400 group-hover:text-primary-500 group-hover:translate-x-1 transition-all flex-shrink-0" />
          </Link>
          <Link
            to="/mypage"
            className="flex items-center justify-between w-full p-4 min-h-[56px] bg-white rounded-xl border border-secondary-200 hover:border-primary-300 hover:shadow-md transition-all group active:scale-[0.99]"
          >
            <span className="text-secondary-700 font-medium group-hover:text-primary-600 text-sm sm:text-base">マイページへ</span>
            <ChevronRight className="w-5 h-5 text-secondary-400 group-hover:text-primary-500 group-hover:translate-x-1 transition-all flex-shrink-0" />
          </Link>
        </div>
      </main>

      {/* Confirmation Modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="退勤しますか？"
        size="sm"
      >
        <div className="text-center py-4 sm:py-6">
          <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-5 rounded-2xl bg-primary-50 flex items-center justify-center">
            <LogOut className="w-8 h-8 sm:w-10 sm:h-10 text-primary-600" />
          </div>
          <p className="text-secondary-700 mb-6 sm:mb-8 text-base sm:text-lg">退勤を記録します</p>

          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={() => setShowConfirmModal(false)}
              className="btn btn-secondary flex-1"
            >
              キャンセル
            </button>
            <button
              onClick={() => performClock('clock_out')}
              className="btn btn-primary flex-1"
            >
              退勤
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
