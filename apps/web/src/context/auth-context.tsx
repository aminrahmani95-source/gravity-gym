'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfileResponse, UserRole } from '@gym-app/shared-types';
import { apiFetch } from '../lib/api';
import { LoginModal } from '../components/login-modal';

interface AuthContextType {
  user: UserProfileResponse | null;
  token: string | null;
  isLoading: boolean;
  isDemoLoginEnabled: boolean;
  sendOtp: (phoneNumber: string) => Promise<{ success: boolean; expiresInSeconds: number; debugCode?: string }>;
  login: (phoneNumber: string, code: string) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  switchDemoRole: (role: UserRole) => Promise<void>;
  openLoginModal: (message?: string) => void;
  closeLoginModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfileResponse | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loginModalState, setLoginModalState] = useState<{ isOpen: boolean; message?: string }>({ isOpen: false });

  // Explicit opt-in only. Default MUST be disabled (undefined or anything other than 'true' is disabled).
  const isDemoLoginEnabled = process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN === 'true';

  useEffect(() => {
    const handleAuthExpired = () => {
      setToken(null);
      setUser(null);
    };
    window.addEventListener('gym_app_auth_expired', handleAuthExpired);

    const savedToken = localStorage.getItem('gym_app_token');
    if (savedToken) {
      setToken(savedToken);
      fetchProfile();
    } else {
      setIsLoading(false);
    }

    return () => {
      window.removeEventListener('gym_app_auth_expired', handleAuthExpired);
    };
  }, []);

  const fetchProfile = async () => {
    try {
      const profile = await apiFetch<UserProfileResponse>('/users/me');
      setUser(profile);
    } catch {
      // Invalid or expired token: clear storage and remain unauthenticated.
      // Never fall back to a demo user.
      localStorage.removeItem('gym_app_token');
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const sendOtp = async (phoneNumber: string): Promise<{ success: boolean; expiresInSeconds: number; debugCode?: string }> => {
    return apiFetch<{ success: boolean; expiresInSeconds: number; debugCode?: string }>('/auth/otp/send', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    });
  };

  const login = async (phoneNumber: string, code: string) => {
    setIsLoading(true);
    try {
      const res = await apiFetch<{ accessToken: string; user: UserProfileResponse }>('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber, code }),
      });
      localStorage.setItem('gym_app_token', res.accessToken);
      setToken(res.accessToken);
      setUser(res.user);
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithDemo = async (phoneNumber: string) => {
    if (!isDemoLoginEnabled) {
      console.warn('Demo login is disabled in this environment.');
      setIsLoading(false);
      return;
    }
    try {
      const sendRes = await apiFetch<{ debugCode?: string }>('/auth/otp/send', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber }),
      });
      const code = sendRes.debugCode || '12345';
      await login(phoneNumber, code);
    } catch (err) {
      console.error('Demo login error:', err);
      setIsLoading(false);
    }
  };

  const switchDemoRole = async (role: UserRole) => {
    if (!isDemoLoginEnabled) {
      console.warn('Demo role switching is disabled in this environment.');
      return;
    }
    if (role === UserRole.SUPER_ADMIN) {
      await loginWithDemo('09120000001');
    } else if (role === UserRole.ADMIN) {
      await loginWithDemo('09120000005');
    } else if (role === UserRole.GYM_STAFF) {
      await loginWithDemo('09120000002');
    } else if (role === UserRole.COACH) {
      await loginWithDemo('09120000010');
    } else {
      await loginWithDemo('09120000003');
    }
  };

  const logout = () => {
    localStorage.removeItem('gym_app_token');
    setToken(null);
    setUser(null);
  };

  const openLoginModal = (message?: string) => {
    setLoginModalState({ isOpen: true, message });
  };

  const closeLoginModal = () => {
    setLoginModalState({ isOpen: false, message: undefined });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isDemoLoginEnabled,
        sendOtp,
        login,
        logout,
        refreshProfile: fetchProfile,
        switchDemoRole,
        openLoginModal,
        closeLoginModal,
      }}
    >
      {children}
      <LoginModal
        isOpen={loginModalState.isOpen}
        onClose={closeLoginModal}
        initialMessage={loginModalState.message}
      />
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
