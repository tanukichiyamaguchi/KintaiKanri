import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import {
  LoginPage,
  ClockPage,
  MyPage,
  AdminDashboard,
  StaffManagement,
  AttendanceManagement,
  SalaryManagement,
  PaidLeaveManagement,
  SettingsPage,
} from './pages';
import { Loading } from './components/common';

// Protected route wrapper for staff
function StaffRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();

  if (isLoading) {
    return <Loading fullScreen message="読み込み中..." />;
  }

  if (!isAuthenticated || isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

// Protected route wrapper for admin
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();

  if (isLoading) {
    return <Loading fullScreen message="読み込み中..." />;
  }

  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<LoginPage />} />

      {/* Staff Routes */}
      <Route
        path="/clock"
        element={
          <StaffRoute>
            <ClockPage />
          </StaffRoute>
        }
      />
      <Route
        path="/mypage"
        element={
          <StaffRoute>
            <MyPage />
          </StaffRoute>
        }
      />

      {/* Admin Routes */}
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminDashboard />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/staff"
        element={
          <AdminRoute>
            <StaffManagement />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/attendance"
        element={
          <AdminRoute>
            <AttendanceManagement />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/salary"
        element={
          <AdminRoute>
            <SalaryManagement />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/paid-leave"
        element={
          <AdminRoute>
            <PaidLeaveManagement />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <AdminRoute>
            <SettingsPage />
          </AdminRoute>
        }
      />

      {/* Catch all - redirect to login */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
