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
        setStatus(response.data.status);
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
          timeout: 10000,
          maximumAge: 0,
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

    // Get GPS position
    const position = await getGpsPosition();

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
  const getButtonState = (type: ClockType): { disabled: boolean; active: boolean } => {
    const hasClockIn = records.some(r => r.type === 'clock_in');
    const hasClockOut = records.some(r =>
      ['clock_out', 'early_leave_company', 'early_leave_self'].includes(r.type)
    );
    const isOnBreak = status === 'on_break';

    switch (type) {
      case 'clock_in':
        return { disabled: hasClockIn, active: hasClockIn };
      case 'break_start':
        return { disabled: !hasClockIn || hasClockOut || isOnBreak, active: isOnBreak };
      case 'break_end':
        return { disabled: !isOnBreak, active: false };
      case 'clock_out':
      case 'early_leave_company':
      case 'early_leave_self':
        return { disabled: !hasClockIn || hasClockOut || isOnBreak, active: hasClockOut };
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
        return { text: '勤務中', class: 'status-badge status-working' };
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
      <div className="min-h-screen bg-gray-50">
        <Header title="打刻" />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <Loading message="読み込み中..." />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="打刻" />

      <main className="max-w-lg mx-auto p-4">
        {/* Clock Display */}
        <div className="card text-center mb-6">
          <Clock size="lg" showDate={true} />

          {/* Status */}
          <div className="mt-4">
            <span className={statusInfo.class}>{statusInfo.text}</span>
          </div>
        </div>

        {/* GPS Status */}
        <div className="flex items-center justify-center gap-2 mb-4 text-sm">
          <MapPin className={`w-4 h-4 ${gpsError ? 'text-red-500' : 'text-green-500'}`} />
          <span className={gpsError ? 'text-red-600' : 'text-gray-600'}>
            {gpsError || (gpsPosition ? '位置情報取得済み' : '位置情報取得中...')}
          </span>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-lg mb-4 ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <p>{message.text}</p>
          </div>
        )}

        {/* Clock Buttons */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Clock In */}
          <button
            onClick={() => handleClock('clock_in')}
            disabled={getButtonState('clock_in').disabled || isClocking}
            className={`btn btn-large flex-col h-24 ${
              getButtonState('clock_in').active
                ? 'bg-green-100 text-green-700 border-2 border-green-300'
                : 'btn-success'
            }`}
          >
            <Play className="w-6 h-6" />
            <span>出勤</span>
            {getButtonState('clock_in').active && <span className="text-xs">(済)</span>}
          </button>

          {/* Break Start */}
          <button
            onClick={() => handleClock('break_start')}
            disabled={getButtonState('break_start').disabled || isClocking}
            className={`btn btn-large flex-col h-24 ${
              getButtonState('break_start').active
                ? 'bg-yellow-100 text-yellow-700 border-2 border-yellow-300'
                : 'btn-warning'
            }`}
          >
            <Coffee className="w-6 h-6" />
            <span>休憩開始</span>
          </button>

          {/* Break End */}
          <button
            onClick={() => handleClock('break_end')}
            disabled={getButtonState('break_end').disabled || isClocking}
            className="btn btn-large flex-col h-24 btn-secondary"
          >
            <Pause className="w-6 h-6" />
            <span>休憩終了</span>
          </button>

          {/* Clock Out */}
          <button
            onClick={() => handleClock('clock_out')}
            disabled={getButtonState('clock_out').disabled || isClocking}
            className={`btn btn-large flex-col h-24 ${
              getButtonState('clock_out').active
                ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                : 'btn-primary'
            }`}
          >
            <LogOut className="w-6 h-6" />
            <span>退勤</span>
          </button>

          {/* Early Leave - Company */}
          <button
            onClick={() => handleClock('early_leave_company')}
            disabled={getButtonState('early_leave_company').disabled || isClocking}
            className="btn btn-large flex-col h-24 bg-blue-500 text-white hover:bg-blue-600"
          >
            <Building className="w-6 h-6" />
            <span>早上がり</span>
            <span className="text-xs">(会社都合)</span>
          </button>

          {/* Early Leave - Self */}
          <button
            onClick={() => handleClock('early_leave_self')}
            disabled={getButtonState('early_leave_self').disabled || isClocking}
            className="btn btn-large flex-col h-24 btn-danger"
          >
            <User className="w-6 h-6" />
            <span>早退</span>
            <span className="text-xs">(自己都合)</span>
          </button>
        </div>

        {/* Loading overlay */}
        {isClocking && (
          <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-40">
            <div className="bg-white p-6 rounded-xl shadow-xl">
              <Loading message="打刻中..." />
            </div>
          </div>
        )}

        {/* Today's Records */}
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <ClockIcon className="w-5 h-5" />
            本日の記録
          </h3>

          {records.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">まだ打刻がありません</p>
          ) : (
            <div className="space-y-3">
              {records.map((record, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <span className="text-gray-700">{getTypeLabel(record.type)}</span>
                  <span className="font-mono text-gray-900">{formatTime(record.time)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* My Page Link */}
        <div className="mt-6 text-center">
          <Link
            to="/mypage"
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            マイページへ →
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
        <div className="text-center py-4">
          <p className="text-gray-700 mb-6">
            {pendingClockType === 'clock_out' && '退勤しますか？'}
            {pendingClockType === 'early_leave_company' && '早上がり（会社都合）で退勤しますか？'}
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
