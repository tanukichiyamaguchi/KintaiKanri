import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Users,
  Calendar,
  Palmtree,
  Calculator,
  Settings,
  Circle,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { staffApi, attendanceApi } from '../../api';
import type { StaffInfo, TodayAttendance, WorkStatus } from '../../types';
import { Header, Loading, Clock } from '../../components/common';

interface StaffWithStatus extends StaffInfo {
  attendance?: TodayAttendance;
}

export function AdminDashboard() {
  const navigate = useNavigate();
  const { isAdmin, isAuthenticated } = useAuth();

  const [staffList, setStaffList] = useState<StaffWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Redirect if not admin
  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      navigate('/');
    }
  }, [isAuthenticated, isAdmin, navigate]);

  // Fetch staff list and their status
  useEffect(() => {
    async function fetchData() {
      try {
        const staffResponse = await staffApi.getList();
        if (staffResponse.success && staffResponse.data) {
          const staffWithStatus: StaffWithStatus[] = await Promise.all(
            staffResponse.data
              .filter(s => s.status === 'active')
              .map(async staff => {
                const attendanceResponse = await attendanceApi.getToday(staff.staffId);
                return {
                  ...staff,
                  attendance: attendanceResponse.data,
                };
              })
          );
          setStaffList(staffWithStatus);
        }
      } catch {
        // Handle error
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, []);

  const getStatusInfo = (status?: WorkStatus): { color: string; text: string } => {
    switch (status) {
      case 'working':
        return { color: 'text-green-500', text: '勤務中' };
      case 'on_break':
        return { color: 'text-yellow-500', text: '休憩中' };
      case 'finished':
        return { color: 'text-blue-500', text: '退勤済み' };
      default:
        return { color: 'text-gray-400', text: '未出勤' };
    }
  };

  const getClockInTime = (attendance?: TodayAttendance): string => {
    if (!attendance?.records) return '';
    const clockIn = attendance.records.find(r => r.type === 'clock_in');
    if (!clockIn) return '';
    const date = new Date(clockIn.time);
    return date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const menuItems = [
    {
      to: '/admin/staff',
      icon: <Users className="w-6 h-6" />,
      label: 'スタッフ管理',
      description: 'スタッフの追加・編集・削除',
    },
    {
      to: '/admin/attendance',
      icon: <Calendar className="w-6 h-6" />,
      label: '勤怠管理',
      description: '打刻データの確認・修正',
    },
    {
      to: '/admin/paid-leave',
      icon: <Palmtree className="w-6 h-6" />,
      label: '有給管理',
      description: '有給申請の承認・却下',
    },
    {
      to: '/admin/salary',
      icon: <Calculator className="w-6 h-6" />,
      label: '給与計算',
      description: '給与計算・明細発行',
    },
    {
      to: '/admin/settings',
      icon: <Settings className="w-6 h-6" />,
      label: 'システム設定',
      description: '保険料率・税金設定',
    },
  ];

  const today = new Date();
  const todayStr = `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="KATEstageLASH 管理画面" />

      <main className="max-w-4xl mx-auto p-4">
        {/* Today's Status */}
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              本日の出勤状況
            </h2>
            <span className="text-gray-500">{todayStr}</span>
          </div>

          {isLoading ? (
            <Loading />
          ) : staffList.length === 0 ? (
            <p className="text-center text-gray-500 py-4">
              スタッフが登録されていません
            </p>
          ) : (
            <div className="space-y-3">
              {staffList.map(staff => {
                const statusInfo = getStatusInfo(staff.attendance?.status);
                const clockInTime = getClockInTime(staff.attendance);

                return (
                  <div
                    key={staff.staffId}
                    className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <Circle
                        className={`w-4 h-4 ${statusInfo.color}`}
                        fill="currentColor"
                      />
                      <span className="font-medium text-gray-800">{staff.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`text-sm ${statusInfo.color}`}>
                        {statusInfo.text}
                      </span>
                      {clockInTime && (
                        <span className="text-sm text-gray-500">{clockInTime}〜</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Menu Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {menuItems.map(item => (
            <Link
              key={item.to}
              to={item.to}
              className="card hover:shadow-lg transition-shadow flex items-center gap-4"
            >
              <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center text-primary-600">
                {item.icon}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-800">{item.label}</h3>
                <p className="text-sm text-gray-500">{item.description}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </Link>
          ))}
        </div>

        {/* Current Time */}
        <div className="mt-6 card text-center">
          <Clock size="md" showDate={false} />
        </div>
      </main>
    </div>
  );
}
