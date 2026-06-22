// Auth context: login/logout, current user, and role-derived capabilities that
// mirror the backend's tenancy model (super_admin / management_admin /
// sales_manager / sdr).
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  apiGet,
  apiPost,
  setAccessToken,
  setRefreshToken,
  getRefreshToken,
} from '@/lib/api';

export type UserRole = 'super_admin' | 'management_admin' | 'sales_manager' | 'sdr';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  companyId: string;
  teamId: string | null;
}

interface LoginResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  // Capabilities (kept in sync with utils/tenancy.ts on the backend).
  canWrite: boolean;
  canReassign: boolean;
  isCompanyWide: boolean;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On first load, try to restore a session from the stored refresh token.
  useEffect(() => {
    let active = true;
    async function restore() {
      if (!getRefreshToken()) {
        setLoading(false);
        return;
      }
      try {
        const tokens = await apiPost<{ accessToken: string; refreshToken?: string }>(
          '/auth/refresh',
          { refreshToken: getRefreshToken() },
        );
        setAccessToken(tokens.accessToken);
        if (tokens.refreshToken) setRefreshToken(tokens.refreshToken);
        const me = await apiGet<{ user: AuthUser }>('/auth/me');
        if (active) setUser(me.user);
      } catch {
        setAccessToken(null);
        setRefreshToken(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    void restore();
    return () => {
      active = false;
    };
  }, []);

  async function login(email: string, password: string): Promise<void> {
    const result = await apiPost<LoginResult>('/auth/login', { email, password });
    setAccessToken(result.accessToken);
    setRefreshToken(result.refreshToken);
    setUser(result.user);
  }

  function logout(): void {
    void apiPost('/auth/logout', { refreshToken: getRefreshToken() }).catch(() => undefined);
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
  }

  const value = useMemo<AuthContextValue>(() => {
    const role = user?.role;
    return {
      user,
      loading,
      login,
      logout,
      canWrite: role === 'super_admin' || role === 'sales_manager',
      canReassign: role === 'super_admin' || role === 'sales_manager' || role === 'sdr',
      isCompanyWide: role === 'super_admin' || role === 'management_admin',
      isSuperAdmin: role === 'super_admin',
    };
  }, [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
