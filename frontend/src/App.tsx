import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
} from './pages';
import { Loading } from './components/common';

function StaffRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();
  if (isLoading) return <Loading fullScreen message="読み込み中..." />;
  if (!isAuthenticated || isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();
  if (isLoading) return <Loading fullScreen message="読み込み中..." />;
  if (!isAuthenticated || !isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<LoginPage />} />

      {/* Staff Routes */}
      <Route path="/clock" element={<StaffRoute><ClockPage /></StaffRoute>} />
      <Route path="/mypage" element={<StaffRoute><MyPage /></StaffRoute>} />
      <Route path="/attendance" element={<StaffRoute><AttendancePage /></StaffRoute>} />
      <Route path="/applications" element={<StaffRoute><ApplicationsPage /></StaffRoute>} />
      <Route path="/shift-request" element={<StaffRoute><ShiftRequestPage /></StaffRoute>} />

      {/* Backward-compatible redirect */}
      <Route path="/bulk-entry" element={<Navigate to="/attendance" replace />} />

      {/* Admin Routes */}
      <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
      <Route path="/admin/staff" element={<AdminRoute><StaffManagement /></AdminRoute>} />
      <Route path="/admin/attendance" element={<AdminRoute><AttendanceManagement /></AdminRoute>} />
      <Route path="/admin/attendance/edit" element={<AdminRoute><AttendancePage /></AdminRoute>} />
      <Route path="/admin/approvals" element={<AdminRoute><AdminApprovalsPage /></AdminRoute>} />
      <Route path="/admin/shift-requests" element={<AdminRoute><AdminShiftRequestsPage /></AdminRoute>} />
      <Route path="/admin/salary" element={<AdminRoute><SalaryManagement /></AdminRoute>} />
      <Route path="/admin/paid-leave" element={<AdminRoute><PaidLeaveManagement /></AdminRoute>} />
      <Route path="/admin/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
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
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
