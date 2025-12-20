import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { setLogoutCallback } from '../lib/api';
import { identifyUser, resetPostHog } from '../lib/posthog';
import { apiFetch } from '../lib/api';

interface User {
  id: string;
  email: string;
  displayName: string;
  aiCredits?: number;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  refreshMe: () => Promise<void>;
  setAiCredits: (aiCredits: number) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('authUser');
    if (storedToken && storedUser) {
      setToken(storedToken);
      const parsedUser = JSON.parse(storedUser) as User;
      setUser(parsedUser);
      identifyUser(parsedUser);
    }
  }, []);

  const login = useCallback((newToken: string, newUser: User) => {
    localStorage.setItem('authToken', newToken);
    localStorage.setItem('authUser', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);

    identifyUser(newUser);
  }, []);

  const refreshMe = useCallback(async () => {
    const storedToken = token ?? localStorage.getItem('authToken');
    if (!storedToken) return;
    try {
      const res = await apiFetch('/api/me', { token: storedToken });
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.user) return;

      const nextUser: User = {
        id: data.user.id,
        email: data.user.email,
        displayName: data.user.displayName,
        aiCredits: data.user.aiCredits
      };

      localStorage.setItem('authUser', JSON.stringify(nextUser));
      setUser(nextUser);
      identifyUser(nextUser);
    } catch {
      // ignore
    }
  }, [token]);

  const setAiCredits = useCallback((aiCredits: number) => {
    setUser((prev) => {
      if (!prev) return prev;
      const nextUser: User = { ...prev, aiCredits };
      localStorage.setItem('authUser', JSON.stringify(nextUser));
      return nextUser;
    });
  }, []);

  const logout = useCallback(() => {
    resetPostHog();

    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    setToken(null);
    setUser(null);

    // Always redirect to landing after logout (manual or session timeout)
    if (window.location.pathname !== '/') {
      window.location.replace('/');
    }
  }, []);

  // Register logout callback for global 401 handling
  useEffect(() => {
    setLogoutCallback(logout);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, refreshMe, setAiCredits, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
