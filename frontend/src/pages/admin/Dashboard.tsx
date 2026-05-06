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
  AlertCircle,
  ClipboardList,
  ClipboardCheck,
  Bell,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { staffApi, attendanceApi, applicationApi, submissionApi } from '../../api';
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
  const [error, setError] = useState<string | null>(null);
  const [pendingApplications, setPendingApplications] = useState(0);
  const [pendingSubmissions, setPendingSubmissions] = useState(0);

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
        setError('スタッフ情報の取得に失敗しました');
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, []);

  // Fetch pending approvals counts
  useEffect(() => {
    async function fetchApprovals() {
      try {
        const [appsRes, subsRes] = await Promise.all([
          applicationApi.list({ status: 'pending' }),
          submissionApi.list({ status: 'submitted' }),
        ]);
        if (appsRes.success && appsRes.data) {
          setPendingApplications(appsRes.data.length);
        }
        if (subsRes.success && subsRes.data) {
          setPendingSubmissions(subsRes.data.length);
        }
      } catch {
        // Silently ignore — approvals widget is non-critical
      }
    }

    fetchApprovals();
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
      color: 'from-primary-400 to-primary-600',
      shadowColor: 'shadow-primary-500/20',
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
      to: '/admin/attendance/edit',
      icon: <ClipboardList className="w-6 h-6" />,
      label: '出勤簿編集',
      description: 'スタッフ別の月次勤怠を編集',
      color: 'from-cyan-500 to-blue-600',
      shadowColor: 'shadow-cyan-500/20',
    },
    {
      to: '/admin/approvals',
      icon: <ClipboardCheck className="w-6 h-6" />,
      label: '承認管理',
      description: '申請・月次提出の承認',
      color: 'from-rose-500 to-pink-600',
      shadowColor: 'shadow-rose-500/20',
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
      color: 'from-violet-500 to-purple-600',
      shadowColor: 'shadow-violet-500/20',
    },
    {
      to: '/admin/settings',
      icon: <Settings className="w-6 h-6" />,
      label: 'システム設定',
      description: '保険料率・税金設定',
      color: 'from-secondary-500 to-secondary-700',
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
    <div className="min-h-screen bg-gradient-to-b from-white to-secondary-100">
      <Header title="KATEstageLASH 管理画面" />

      <main className="max-w-5xl mx-auto p-4 sm:p-6">
        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-lg mb-4">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Welcome Section */}
        <div className="card card-gold gold-border mb-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-bl from-primary-200/30 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-56 h-56 bg-gradient-to-tr from-primary-200/20 to-transparent rounded-full blur-2xl" />

          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-sm shadow-primary-500/20">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <span className="text-primary-600 text-sm font-semibold tracking-wider uppercase">Dashboard</span>
              </div>
              <h1 className="text-2xl font-bold text-secondary-900 mb-1">おかえりなさい</h1>
              <p className="text-secondary-500">{todayStr}</p>
            </div>
            <div className="flex items-center gap-6 sm:gap-8">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{workingCount}</div>
                <div className="text-xs text-secondary-500 font-medium">勤務中</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-amber-600">{breakCount}</div>
                <div className="text-xs text-secondary-500 font-medium">休憩中</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">{finishedCount}</div>
                <div className="text-xs text-secondary-500 font-medium">退勤済</div>
              </div>
            </div>
          </div>
        </div>

        {/* Pending Approvals */}
        {(pendingApplications > 0 || pendingSubmissions > 0) && (
          <Link
            to="/admin/approvals"
            className="card mb-6 group hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 border border-rose-100 hover:border-rose-200 block"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center text-white shadow-lg shadow-rose-500/20 group-hover:scale-105 transition-transform">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-secondary-800 group-hover:text-rose-600 transition-colors">
                    承認待ち
                  </h3>
                  <p className="text-sm text-secondary-500 mt-0.5">対応が必要な項目があります</p>
                </div>
              </div>
              <div className="flex items-center gap-5">
                <div className="text-center">
                  <div className="text-2xl font-bold text-rose-600">{pendingApplications}</div>
                  <div className="text-xs text-secondary-500 font-medium">申請</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-rose-600">{pendingSubmissions}</div>
                  <div className="text-xs text-secondary-500 font-medium">月次提出</div>
                </div>
                <ChevronRight className="w-5 h-5 text-secondary-300 group-hover:text-rose-500 group-hover:translate-x-1 transition-all" />
              </div>
            </div>
          </Link>
        )}

        {/* Today's Status */}
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-secondary-800 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-primary-600" />
              </div>
              本日の出勤状況
            </h2>
            <span className="text-sm text-secondary-500 bg-secondary-50 px-3.5 py-1.5 rounded-full font-medium border border-secondary-100">
              {staffList.length}名
            </span>
          </div>

          {isLoading ? (
            <div className="py-10">
              <Loading />
            </div>
          ) : staffList.length === 0 ? (
            <div className="text-center py-14">
              <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-secondary-50 flex items-center justify-center">
                <Users className="w-10 h-10 text-secondary-300" />
              </div>
              <p className="text-secondary-400 text-lg">スタッフが登録されていません</p>
              <Link
                to="/admin/staff"
                className="inline-flex items-center gap-2 mt-4 text-primary-600 hover:text-primary-700 font-medium"
              >
                スタッフを追加する
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {staffList.map(staff => {
                const statusInfo = getStatusInfo(staff.attendance?.status);
                const clockInTime = getClockInTime(staff.attendance);

                return (
                  <div
                    key={staff.staffId}
                    className={`flex items-center justify-between p-4 rounded-xl transition-all border border-transparent hover:border-secondary-200 ${statusInfo.bg}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${statusInfo.dot}`} />
                      <span className="font-medium text-secondary-800">{staff.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`text-sm font-semibold px-3 py-1.5 rounded-full ${statusInfo.bg} ${statusInfo.text} border border-current/10`}>
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
              className="group card hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-transparent hover:border-primary-100"
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 bg-gradient-to-br ${item.color} rounded-xl flex items-center justify-center text-white shadow-lg ${item.shadowColor} group-hover:scale-110 transition-transform`}>
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-secondary-800 group-hover:text-primary-600 transition-colors">{item.label}</h3>
                  <p className="text-sm text-secondary-500 mt-0.5">{item.description}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-secondary-300 group-hover:text-primary-500 group-hover:translate-x-1 transition-all flex-shrink-0 mt-1" />
              </div>
            </Link>
          ))}
        </div>

        {/* Current Time */}
        <div className="card card-gold text-center relative overflow-hidden gold-border">
          <div className="absolute top-0 right-0 w-36 h-36 bg-gradient-to-bl from-primary-200/20 to-transparent rounded-full" />
          <div className="absolute bottom-0 left-0 w-28 h-28 bg-gradient-to-tr from-primary-200/20 to-transparent rounded-full" />
          <div className="relative">
            <Clock size="md" showDate={false} />
          </div>
        </div>
      </main>
    </div>
  );
}
