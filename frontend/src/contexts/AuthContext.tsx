import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<StaffInfo | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const adminStored = localStorage.getItem(ADMIN_STORAGE_KEY);
    const stored = localStorage.getItem(STORAGE_KEY);

    if (adminStored) {
      try {
        const adminAuth: StoredAdminAuth = JSON.parse(adminStored);
        // Check if admin session is still valid (8 hours)
        if (adminAuth.expiry > Date.now()) {
          setIsAdmin(true);
          setToken(adminAuth.token);
          setIsLoading(false);
          return;
        } else {
          localStorage.removeItem(ADMIN_STORAGE_KEY);
        }
      } catch {
        localStorage.removeItem(ADMIN_STORAGE_KEY);
      }
    }

    if (stored) {
      try {
        const auth: StoredAuth = JSON.parse(stored);
        // Check if session is still valid (24 hours)
        if (auth.expiry > Date.now()) {
          setStaff(auth.staff);
          setToken(auth.token);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

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
    } catch (error) {
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
    } catch (error) {
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
    isLoading,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
