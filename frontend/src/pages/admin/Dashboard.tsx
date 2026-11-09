import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AlertCircle, ChevronRight, CircleCheckBig, FileCheck2, Palmtree, CalendarHeart, UserPlus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { refreshDashboard, useDashboardSummary } from '../../api/dashboardStore';
import type { TodayAttendance, WorkStatus } from '../../types';
import { Header, Loading, Spinner } from '../../components/common';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function clockInTime(attendance?: TodayAttendance): string {
  const rec = attendance?.records?.find(r => r.type === 'clock_in');
  if (!rec) return '';
  return new Date(rec.time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function statusPill(status?: WorkStatus): { label: string; cls: string } {
  switch (status) {
    case 'working':
      return { label: '勤務中', cls: 'pill-success' };
    case 'finished':
      return { label: '退勤済み', cls: 'pill-info' };
    default:
      return { label: '未出勤', cls: 'pill-neutral' };
  }
}

/**
 * 管理者のホーム。今日の出勤状況と承認待ちの件数を表示する。
 * データはまとめ取得（dashboard/summary）1 回で取得し、タブバーの件数バッジと共有する。
 * 前回の内容があればすぐ表示し、30 秒ごと・画面に戻ったときに最新へ更新する。
 */
export function AdminDashboard() {
  const navigate = useNavigate();
  const { isAdmin, isAuthenticated } = useAuth();
  const { data, refreshing, error } = useDashboardSummary();

  // Redirect if not admin
  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      navigate('/');
    }
  }, [isAuthenticated, isAdmin, navigate]);

  // 表示のたびに最新化し、30 秒ごと・タブに戻ったときにも更新する（スタッフの申請がすぐ反映される）
  useEffect(() => {
    refreshDashboard(true);
    const intervalId = window.setInterval(() => refreshDashboard(), 30 * 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshDashboard();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  const activeStaff = (data?.staff || []).filter(s => s.status === 'active');
  const statusOf = (staffId: string) => data?.today?.[staffId]?.status;
  const workingCount = activeStaff.filter(s => statusOf(s.staffId) === 'working').length;
  const finishedCount = activeStaff.filter(s => statusOf(s.staffId) === 'finished').length;
  const notStartedCount = activeStaff.length - workingCount - finishedCount;

  const counts = data?.counts;
  const approvalRows = [
    { to: '/admin/approvals', label: '勤怠の申請', icon: CircleCheckBig, iconBg: 'bg-icon-green', count: counts?.pendingApplications },
    { to: '/admin/approvals', label: '月次の出勤簿', icon: FileCheck2, iconBg: 'bg-icon-blue', count: counts?.pendingSubmissions },
    { to: '/admin/paid-leave', label: '有給休暇', icon: Palmtree, iconBg: 'bg-icon-teal', count: counts?.pendingPaidLeave },
    { to: '/admin/shift-requests', label: '希望シフト', icon: CalendarHeart, iconBg: 'bg-icon-pink', count: counts?.pendingShiftRequests },
  ];

  const today = new Date();
  const todayLabel = `${today.getMonth() + 1}月${today.getDate()}日（${WEEKDAYS[today.getDay()]}）`;

  return (
    <div className="page">
      <Header
        title="ホーム"
        subtitle={todayLabel}
        actions={refreshing && data ? <Spinner size={18} className="mr-2" /> : undefined}
      />

      <main className="page-content">
        {error && !data && (
          <div className="callout callout-danger mb-4" role="alert">
            <AlertCircle aria-hidden="true" />
            <p>スタッフ情報の取得に失敗しました。通信状況をご確認のうえ、画面を更新してください。</p>
          </div>
        )}

        {/* 今日の人数 */}
        <section className="card !p-3" aria-label="今日の出勤状況">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="tile">
              <dt className="t-footnote text-label-2">勤務中</dt>
              <dd className="t-title1 tabular mt-0.5 text-success">{data ? workingCount : '–'}</dd>
            </div>
            <div className="tile">
              <dt className="t-footnote text-label-2">退勤済み</dt>
              <dd className="t-title1 tabular mt-0.5 text-info">{data ? finishedCount : '–'}</dd>
            </div>
            <div className="tile">
              <dt className="t-footnote text-label-2">未出勤</dt>
              <dd className="t-title1 tabular mt-0.5">{data ? notStartedCount : '–'}</dd>
            </div>
          </dl>
        </section>

        {/* 承認待ち */}
        <section className="section">
          <h2 className="section-header">承認待ち</h2>
          <div className="list-group">
            {approvalRows.map(row => {
              const Icon = row.icon;
              const n = typeof row.count === 'number' ? row.count : null;
              return (
                <Link key={row.label} to={row.to} className="list-row list-row-with-icon">
                  <span className={`row-icon ${row.iconBg}`}>
                    <Icon aria-hidden="true" />
                  </span>
                  <span className="list-row-title t-body">{row.label}</span>
                  {n === null ? (
                    <span className="t-body text-label-3">–</span>
                  ) : n > 0 ? (
                    <span className="count-badge" aria-label={`${n}件`}>{n}</span>
                  ) : (
                    <span className="t-body text-label-3">なし</span>
                  )}
                  <ChevronRight className="list-chevron !h-4 !w-4" strokeWidth={2.5} aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </section>

        {/* スタッフの今日の状態 */}
        <section className="section">
          <h2 className="section-header">
            今日のスタッフ
            {data && <span className="tabular">{activeStaff.length}名</span>}
          </h2>
          <div className="list-group">
            {!data ? (
              <div className="py-6">
                <Loading message="読み込み中..." />
              </div>
            ) : activeStaff.length === 0 ? (
              <>
                <div className="list-row">
                  <span className="t-body text-label-2">スタッフが登録されていません</span>
                </div>
                <Link to="/admin/staff" className="list-row text-tint">
                  <UserPlus className="h-5 w-5" aria-hidden="true" />
                  <span className="t-body">スタッフを追加する</span>
                </Link>
              </>
            ) : (
              activeStaff.map(staff => {
                const attendance = data.today?.[staff.staffId];
                const pill = statusPill(attendance?.status);
                const since = clockInTime(attendance);
                return (
                  <div key={staff.staffId} className="list-row">
                    <span className="list-row-title t-body truncate">{staff.name}</span>
                    {since && <span className="t-subhead tabular text-label-2">{since}〜</span>}
                    <span className={`pill ${pill.cls}`}>{pill.label}</span>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
