import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Play,
  Pause,
  Coffee,
  LogOut,
  Clock as ClockIcon,
  MapPin,
  AlertCircle,
  CheckCircle,
  User,
  Building,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { attendanceApi } from '../../api';
import type { ClockType, WorkStatus, ClockRecord } from '../../types';
import { Header, Clock, Loading, Modal } from '../../components/common';

interface GpsPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export function ClockPage() {
  const navigate = useNavigate();
  const { staff, isAuthenticated } = useAuth();

  const [status, setStatus] = useState<WorkStatus>('not_started');
  const [records, setRecords] = useState<ClockRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClocking, setIsClocking] = useState(false);
  const [gpsPosition, setGpsPosition] = useState<GpsPosition | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingClockType, setPendingClockType] = useState<ClockType | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated || !staff) {
      navigate('/');
    }
  }, [isAuthenticated, staff, navigate]);

  // Fetch today's attendance
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

  // Get GPS position
  const getGpsPosition = useCallback((): Promise<GpsPosition | null> => {
    return new Promise(resolve => {
      if (!navigator.geolocation) {
        setGpsError('位置情報がサポートされていません');
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        position => {
          const pos = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };
          setGpsPosition(pos);
          setGpsError(null);
          resolve(pos);
        },
        error => {
          let errorMsg = '位置情報の取得に失敗しました';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMsg = '位置情報の許可が必要です';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMsg = '位置情報を取得できません';
              break;
            case error.TIMEOUT:
              errorMsg = '位置情報の取得がタイムアウトしました';
              break;
          }
          setGpsError(errorMsg);
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 60000,
        }
      );
    });
  }, []);

  // Request GPS permission on mount
  useEffect(() => {
    getGpsPosition();
  }, [getGpsPosition]);

  // Handle clock action
  const handleClock = async (type: ClockType) => {
    if (!staff) return;

    // For leave types, show confirmation modal
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

    // Use cached GPS position (non-blocking) - GPS is fetched on mount
    const position = gpsPosition;

    try {
      const response = await attendanceApi.clock(
        staff.staffId,
        type,
        position?.latitude,
        position?.longitude
      );

      if (response.success) {
        const typeLabels: Record<ClockType, string> = {
          clock_in: '出勤',
          break_start: '休憩開始',
          break_end: '休憩終了',
          clock_out: '退勤',
          early_leave_company: '早上がり',
          early_leave_self: '早退',
        };

        setMessage({
          type: 'success',
          text: `${typeLabels[type]}を記録しました`,
        });

        // Refresh attendance data
        await fetchTodayAttendance();
      } else {
        setMessage({
          type: 'error',
          text: response.error || '打刻に失敗しました',
        });
      }
    } catch {
      setMessage({ type: 'error', text: '打刻に失敗しました' });
    } finally {
      setIsClocking(false);
    }
  };

  // Get button state based on current status
  // Use status as the primary indicator (more reliable than records)
  const getButtonState = (type: ClockType): { disabled: boolean; active: boolean } => {
    // Status-based logic (primary)
    const isWorking = status === 'working';
    const isOnBreak = status === 'on_break';
    const isFinished = status === 'finished';

    // Also check records as backup
    const hasClockIn = records.some(r => r.type === 'clock_in');
    const hasClockOut = records.some(r =>
      ['clock_out', 'early_leave_company', 'early_leave_self'].includes(r.type)
    );

    // Determine if clocked in (either by status or records)
    const clockedIn = isWorking || isOnBreak || isFinished || hasClockIn;
    const clockedOut = isFinished || hasClockOut;

    switch (type) {
      case 'clock_in':
        // Can only clock in if not started
        return { disabled: clockedIn, active: clockedIn };
      case 'break_start':
        // Can start break if working (not on break, not finished)
        return { disabled: !isWorking, active: isOnBreak };
      case 'break_end':
        // Can end break only if on break
        return { disabled: !isOnBreak, active: false };
      case 'clock_out':
      case 'early_leave_company':
      case 'early_leave_self':
        // Can clock out if working (not on break, not already finished)
        return { disabled: !isWorking || clockedOut, active: clockedOut };
      default:
        return { disabled: false, active: false };
    }
  };

  // Format time from ISO string
  const formatTime = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  // Get status label
  const getStatusLabel = (s: WorkStatus): { text: string; class: string } => {
    switch (s) {
      case 'not_started':
        return { text: '未出勤', class: 'status-badge status-off' };
      case 'working':
        return { text: '勤務中', class: 'status-badge status-working pulse-gold' };
      case 'on_break':
        return { text: '休憩中', class: 'status-badge status-break' };
      case 'finished':
        return { text: '退勤済み', class: 'status-badge status-finished' };
      default:
        return { text: '', class: '' };
    }
  };

  // Get type label for record
  const getTypeLabel = (type: ClockType): string => {
    const labels: Record<ClockType, string> = {
      clock_in: '出勤',
      break_start: '休憩開始',
      break_end: '休憩終了',
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
        {/* Clock Display Card */}
        <div className="card card-gold text-center mb-6 relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-primary-200/20 to-transparent rounded-full" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-primary-200/20 to-transparent rounded-full" />

          <div className="relative">
            <Clock size="lg" showDate={true} />

            {/* Status Badge */}
            <div className="mt-6 flex justify-center">
              <span className={statusInfo.class}>{statusInfo.text}</span>
            </div>
          </div>
        </div>

        {/* GPS Status */}
        <div className={`flex items-center justify-center gap-2.5 mb-5 px-5 py-3 rounded-full text-sm font-medium border ${
          gpsError
            ? 'bg-red-50 border-red-200 text-red-600'
            : gpsPosition
            ? 'bg-green-50 border-green-200 text-green-600'
            : 'bg-secondary-50 border-secondary-200 text-secondary-500'
        }`}>
          <MapPin className={`w-4 h-4 ${gpsError ? 'text-red-500' : gpsPosition ? 'text-green-500' : 'text-secondary-400'}`} />
          <span>
            {gpsError || (gpsPosition ? '位置情報取得済み' : '位置情報取得中...')}
          </span>
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
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Clock In */}
          <button
            onClick={() => handleClock('clock_in')}
            disabled={getButtonState('clock_in').disabled || isClocking}
            className={`relative group flex flex-col items-center justify-center gap-2 h-28 rounded-2xl font-semibold transition-all duration-300 ${
              getButtonState('clock_in').active
                ? 'bg-green-50 text-green-700 border-2 border-green-300'
                : 'bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg shadow-green-500/25 hover:shadow-xl hover:shadow-green-500/35 hover:-translate-y-0.5'
            } ${getButtonState('clock_in').disabled && !getButtonState('clock_in').active ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Play className="w-7 h-7" />
            <span className="text-lg">出勤</span>
            {getButtonState('clock_in').active && (
              <span className="absolute top-2 right-2 text-xs bg-green-200 text-green-700 px-2.5 py-0.5 rounded-full font-bold">済</span>
            )}
          </button>

          {/* Break Start */}
          <button
            onClick={() => handleClock('break_start')}
            disabled={getButtonState('break_start').disabled || isClocking}
            className={`relative group flex flex-col items-center justify-center gap-2 h-28 rounded-2xl font-semibold transition-all duration-300 ${
              getButtonState('break_start').active
                ? 'bg-amber-50 text-amber-700 border-2 border-amber-300'
                : 'bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/25 hover:shadow-xl hover:shadow-amber-500/35 hover:-translate-y-0.5'
            } ${getButtonState('break_start').disabled && !getButtonState('break_start').active ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Coffee className="w-7 h-7" />
            <span className="text-lg">休憩開始</span>
          </button>

          {/* Break End */}
          <button
            onClick={() => handleClock('break_end')}
            disabled={getButtonState('break_end').disabled || isClocking}
            className={`group flex flex-col items-center justify-center gap-2 h-28 rounded-2xl font-semibold transition-all duration-300 bg-white text-secondary-600 border-2 border-secondary-200 hover:border-primary-300 hover:text-primary-600 ${
              getButtonState('break_end').disabled ? 'opacity-50 cursor-not-allowed' : 'hover:-translate-y-0.5 hover:shadow-lg'
            }`}
          >
            <Pause className="w-7 h-7" />
            <span className="text-lg">休憩終了</span>
          </button>

          {/* Clock Out */}
          <button
            onClick={() => handleClock('clock_out')}
            disabled={getButtonState('clock_out').disabled || isClocking}
            className={`relative group flex flex-col items-center justify-center gap-2 h-28 rounded-2xl font-semibold transition-all duration-300 ${
              getButtonState('clock_out').active
                ? 'bg-primary-50 text-primary-700 border-2 border-primary-300'
                : 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/35 hover:-translate-y-0.5'
            } ${getButtonState('clock_out').disabled && !getButtonState('clock_out').active ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <LogOut className="w-7 h-7" />
            <span className="text-lg">退勤</span>
          </button>

          {/* Early Leave - Company */}
          <button
            onClick={() => handleClock('early_leave_company')}
            disabled={getButtonState('early_leave_company').disabled || isClocking}
            className={`group flex flex-col items-center justify-center gap-1 h-28 rounded-2xl font-semibold transition-all duration-300 bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/35 hover:-translate-y-0.5 ${
              getButtonState('early_leave_company').disabled ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <Building className="w-6 h-6" />
            <span className="text-base">早上がり</span>
            <span className="text-xs opacity-80">(会社都合)</span>
          </button>

          {/* Early Leave - Self */}
          <button
            onClick={() => handleClock('early_leave_self')}
            disabled={getButtonState('early_leave_self').disabled || isClocking}
            className={`group flex flex-col items-center justify-center gap-1 h-28 rounded-2xl font-semibold transition-all duration-300 bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:shadow-red-500/35 hover:-translate-y-0.5 ${
              getButtonState('early_leave_self').disabled ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <User className="w-6 h-6" />
            <span className="text-base">早退</span>
            <span className="text-xs opacity-80">(自己都合)</span>
          </button>
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
        <div className="card">
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

        {/* My Page Link */}
        <div className="mt-6">
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
