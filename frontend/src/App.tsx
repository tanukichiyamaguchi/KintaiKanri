import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import {
  LoginPage,
  ClockPage,
  MyPage,
  AttendancePage,
  ApplicationsPage,
  ShiftRequestPage,
  AdminDashboard,
  StaffManagement,
  AttendanceManagement,
  AdminApprovalsPage,
  AdminShiftRequestsPage,
  SalaryManagement,
  PaidLeaveManagement,
  SettingsPage,
  MorePage,
} from './pages';
import { Loading, EnvironmentBanner } from './components/common';
import { AppLayout } from './components/layout/AppLayout';

// ログイン済みのスタッフだけが入れるページ群（画面下部のタブ / 左側のメニュー付き）
function StaffArea() {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();
  if (isLoading) return <Loading fullScreen message="読み込み中..." />;
  if (!isAuthenticated || isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}

// ログイン済みの管理者だけが入れるページ群
function AdminArea() {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();
  if (isLoading) return <Loading fullScreen message="読み込み中..." />;
  if (!isAuthenticated || !isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<LoginPage />} />

      {/* Staff Routes */}
      <Route element={<StaffArea />}>
        <Route element={<AppLayout />}>
          <Route path="/clock" element={<ClockPage />} />
          <Route path="/mypage" element={<MyPage />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/applications" element={<ApplicationsPage />} />
          <Route path="/shift-request" element={<ShiftRequestPage />} />
        </Route>
      </Route>

      {/* Backward-compatible redirect */}
      <Route path="/bulk-entry" element={<Navigate to="/attendance" replace />} />

      {/* Admin Routes */}
      <Route element={<AdminArea />}>
        <Route element={<AppLayout />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/staff" element={<StaffManagement />} />
          <Route path="/admin/attendance" element={<AttendanceManagement />} />
          <Route path="/admin/attendance/edit" element={<AttendancePage />} />
          <Route path="/admin/approvals" element={<AdminApprovalsPage />} />
          <Route path="/admin/shift-requests" element={<AdminShiftRequestsPage />} />
          <Route path="/admin/salary" element={<SalaryManagement />} />
          <Route path="/admin/paid-leave" element={<PaidLeaveManagement />} />
          <Route path="/admin/settings" element={<SettingsPage />} />
          <Route path="/admin/more" element={<MorePage />} />
        </Route>
      </Route>
      <Route path="/admin/bulk-entry" element={<Navigate to="/admin/attendance/edit" replace />} />

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <EnvironmentBanner />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
