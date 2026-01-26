import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Users,
  Calendar,
  Palmtree,
  Calculator,
  Settings,
  ChevronRight,
  Sparkles,
  TrendingUp,
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

  const getStatusInfo = (status?: WorkStatus): { bg: string; text: string; label: string; dot: string } => {
    switch (status) {
      case 'working':
        return { bg: 'bg-green-50', text: 'text-green-700', label: '勤務中', dot: 'bg-green-500' };
      case 'on_break':
        return { bg: 'bg-amber-50', text: 'text-amber-700', label: '休憩中', dot: 'bg-amber-500' };
      case 'finished':
        return { bg: 'bg-blue-50', text: 'text-blue-700', label: '退勤済み', dot: 'bg-blue-500' };
      default:
        return { bg: 'bg-secondary-50', text: 'text-secondary-500', label: '未出勤', dot: 'bg-secondary-300' };
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
      color: 'from-violet-500 to-purple-600',
      shadowColor: 'shadow-violet-500/20',
    },
    {
      to: '/admin/attendance',
      icon: <Calendar className="w-6 h-6" />,
      label: '勤怠管理',
      description: '打刻データの確認・修正',
      color: 'from-blue-500 to-indigo-600',
      shadowColor: 'shadow-blue-500/20',
    },
    {
      to: '/admin/paid-leave',
      icon: <Palmtree className="w-6 h-6" />,
      label: '有給管理',
      description: '有給申請の承認・却下',
      color: 'from-emerald-500 to-teal-600',
      shadowColor: 'shadow-emerald-500/20',
    },
    {
      to: '/admin/salary',
      icon: <Calculator className="w-6 h-6" />,
      label: '給与計算',
      description: '給与計算・明細発行',
      color: 'from-primary-500 to-primary-700',
      shadowColor: 'shadow-primary-500/20',
    },
    {
      to: '/admin/settings',
      icon: <Settings className="w-6 h-6" />,
      label: 'システム設定',
      description: '保険料率・税金設定',
      color: 'from-secondary-600 to-secondary-800',
      shadowColor: 'shadow-secondary-500/20',
    },
  ];

  const today = new Date();
  const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][today.getDay()];
  const todayStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日（${dayOfWeek}）`;

  // Count staff by status
  const workingCount = staffList.filter(s => s.attendance?.status === 'working').length;
  const breakCount = staffList.filter(s => s.attendance?.status === 'on_break').length;
  const finishedCount = staffList.filter(s => s.attendance?.status === 'finished').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary-50 to-secondary-100">
      <Header title="KATEstageLASH 管理画面" />

      <main className="max-w-5xl mx-auto p-4 sm:p-6">
        {/* Welcome Section */}
        <div className="card card-dark mb-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary-500/5 rounded-full blur-2xl" />

          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-primary-400" />
                <span className="text-primary-400 text-sm font-medium">ダッシュボード</span>
              </div>
              <h1 className="text-2xl font-bold text-white mb-1">おかえりなさい</h1>
              <p className="text-secondary-400">{todayStr}</p>
            </div>
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-400">{workingCount}</div>
                <div className="text-xs text-secondary-400">勤務中</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-amber-400">{breakCount}</div>
                <div className="text-xs text-secondary-400">休憩中</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-400">{finishedCount}</div>
                <div className="text-xs text-secondary-400">退勤済</div>
              </div>
            </div>
          </div>
        </div>

        {/* Today's Status */}
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-secondary-800 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary-500" />
              本日の出勤状況
            </h2>
            <span className="text-sm text-secondary-500 bg-secondary-100 px-3 py-1 rounded-full">
              {staffList.length}名
            </span>
          </div>

          {isLoading ? (
            <div className="py-8">
              <Loading />
            </div>
          ) : staffList.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-secondary-100 flex items-center justify-center">
                <Users className="w-8 h-8 text-secondary-400" />
              </div>
              <p className="text-secondary-500">スタッフが登録されていません</p>
            </div>
          ) : (
            <div className="space-y-2">
              {staffList.map(staff => {
                const statusInfo = getStatusInfo(staff.attendance?.status);
                const clockInTime = getClockInTime(staff.attendance);

                return (
                  <div
                    key={staff.staffId}
                    className={`flex items-center justify-between p-4 rounded-xl transition-colors ${statusInfo.bg}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${statusInfo.dot}`} />
                      <span className="font-medium text-secondary-800">{staff.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`text-sm font-medium px-3 py-1 rounded-full ${statusInfo.bg} ${statusInfo.text}`}>
                        {statusInfo.label}
                      </span>
                      {clockInTime && (
                        <span className="text-sm text-secondary-500 font-mono">{clockInTime}〜</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Menu Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {menuItems.map(item => (
            <Link
              key={item.to}
              to={item.to}
              className="group card hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 bg-gradient-to-br ${item.color} rounded-xl flex items-center justify-center text-white shadow-lg ${item.shadowColor} group-hover:scale-110 transition-transform`}>
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-secondary-800 group-hover:text-primary-600 transition-colors">{item.label}</h3>
                  <p className="text-sm text-secondary-500 mt-0.5">{item.description}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-secondary-300 group-hover:text-primary-500 group-hover:translate-x-1 transition-all flex-shrink-0" />
              </div>
            </Link>
          ))}
        </div>

        {/* Current Time */}
        <div className="card card-gold text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/5 rounded-full blur-2xl" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-primary-500/5 rounded-full blur-2xl" />
          <div className="relative">
            <Clock size="md" showDate={false} />
          </div>
        </div>
      </main>
    </div>
  );
}
