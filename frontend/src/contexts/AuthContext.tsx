import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { StaffInfo, AdminInfo } from '../types';
import { authApi } from '../api';

interface AuthContextType {
  isAuthenticated: boolean;
  isAdmin: boolean;
  staff: StaffInfo | null;
  admin: AdminInfo | null;
  token: string | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; isAdmin?: boolean }>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'kintai_auth';

interface StoredAuth {
  isAdmin: boolean;
  staff: StaffInfo | null;
  admin: AdminInfo | null;
  token: string;
  expiry: number;
}

function restoreSession(): StoredAuth | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    const auth: StoredAuth = JSON.parse(stored);
    if (auth.expiry > Date.now()) {
      return auth;
    }
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session] = useState(restoreSession);
  const [staff, setStaff] = useState<StaffInfo | null>(session?.staff ?? null);
  const [admin, setAdmin] = useState<AdminInfo | null>(session?.admin ?? null);
  const [token, setToken] = useState<string | null>(session?.token ?? null);
  const [isAdmin, setIsAdmin] = useState(session?.isAdmin ?? false);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const response = await authApi.login(normalizedEmail, password);
      if (response.success && response.data?.success) {
        const data = response.data;
        const tokenStr = data.token || '';
        const isAdminLogin = !!data.isAdmin;
        const staffInfo = data.staffInfo ?? null;
        const adminInfo = data.adminInfo ?? null;

        setIsAdmin(isAdminLogin);
        setStaff(staffInfo);
        setAdmin(adminInfo);
        setToken(tokenStr);

        const stored: StoredAuth = {
          isAdmin: isAdminLogin,
          staff: staffInfo,
          admin: adminInfo,
          token: tokenStr,
          // 管理者は8h、スタッフは24h
          expiry: Date.now() + (isAdminLogin ? 8 : 24) * 60 * 60 * 1000,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

        return { success: true, isAdmin: isAdminLogin };
      }
      return {
        success: false,
        error: response.error || response.data?.error || 'ログインに失敗しました',
      };
    } catch {
      return { success: false, error: 'ネットワークエラーが発生しました' };
    }
  }, []);

  const logout = useCallback(() => {
    setStaff(null);
    setAdmin(null);
    setToken(null);
    setIsAdmin(false);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const value: AuthContextType = {
    isAuthenticated: !!staff || !!admin,
    isAdmin,
    staff,
    admin,
    token,
    login,
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
