import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { StaffInfo } from '../types';
import { authApi } from '../api';

interface AuthContextType {
  isAuthenticated: boolean;
  isAdmin: boolean;
  staff: StaffInfo | null;
  token: string | null;
  login: (staffId: string, pinCode: string) => Promise<{ success: boolean; error?: string }>;
  loginAsAdmin: (pinCode: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'kintai_auth';
const ADMIN_STORAGE_KEY = 'kintai_admin_auth';

interface StoredAuth {
  staff: StaffInfo;
  token: string;
  expiry: number;
}

interface StoredAdminAuth {
  token: string;
  expiry: number;
}

// Synchronously restore session from localStorage
function restoreSession(): { staff: StaffInfo | null; token: string | null; isAdmin: boolean } {
  const adminStored = localStorage.getItem(ADMIN_STORAGE_KEY);
  if (adminStored) {
    try {
      const adminAuth: StoredAdminAuth = JSON.parse(adminStored);
      if (adminAuth.expiry > Date.now()) {
        return { staff: null, token: adminAuth.token, isAdmin: true };
      }
      localStorage.removeItem(ADMIN_STORAGE_KEY);
    } catch {
      localStorage.removeItem(ADMIN_STORAGE_KEY);
    }
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const auth: StoredAuth = JSON.parse(stored);
      if (auth.expiry > Date.now()) {
        return { staff: auth.staff, token: auth.token, isAdmin: false };
      }
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  return { staff: null, token: null, isAdmin: false };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Lazy initialization from localStorage (avoids setState in useEffect)
  const [session] = useState(restoreSession);
  const [staff, setStaff] = useState<StaffInfo | null>(session.staff);
  const [token, setToken] = useState<string | null>(session.token);
  const [isAdmin, setIsAdmin] = useState(session.isAdmin);

  const login = useCallback(async (staffId: string, pinCode: string) => {
    try {
      const response = await authApi.login(staffId, pinCode);

      if (response.success && response.data?.success && response.data.staffInfo) {
        const staffInfo = response.data.staffInfo;
        const authToken = response.data.token || '';

        setStaff(staffInfo);
        setToken(authToken);
        setIsAdmin(false);

        // Store session with 24-hour expiry
        const stored: StoredAuth = {
          staff: staffInfo,
          token: authToken,
          expiry: Date.now() + 24 * 60 * 60 * 1000,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
        localStorage.removeItem(ADMIN_STORAGE_KEY);

        return { success: true };
      }

      return {
        success: false,
        error: response.error || 'ログインに失敗しました',
      };
    } catch {
      return {
        success: false,
        error: 'ネットワークエラーが発生しました',
      };
    }
  }, []);

  const loginAsAdmin = useCallback(async (pinCode: string) => {
    try {
      const response = await authApi.adminLogin(pinCode);

      if (response.success && response.data?.success) {
        const authToken = response.data.token || 'admin-token';

        setIsAdmin(true);
        setStaff(null);
        setToken(authToken);

        // Store admin session with 8-hour expiry
        const stored: StoredAdminAuth = {
          token: authToken,
          expiry: Date.now() + 8 * 60 * 60 * 1000,
        };
        localStorage.removeItem(STORAGE_KEY);
        localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(stored));

        return { success: true };
      }

      return {
        success: false,
        error: response.error || '管理者PINが正しくありません',
      };
    } catch {
      return {
        success: false,
        error: 'ネットワークエラーが発生しました',
      };
    }
  }, []);

  const logout = useCallback(() => {
    setStaff(null);
    setToken(null);
    setIsAdmin(false);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ADMIN_STORAGE_KEY);
  }, []);

  const value: AuthContextType = {
    isAuthenticated: !!staff || isAdmin,
    isAdmin,
    staff,
    token,
    login,
    loginAsAdmin,
    logout,
    isLoading: false,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
