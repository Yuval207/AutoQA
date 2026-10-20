import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../api/types';
import * as api from '../api/client';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(api.getStoredUser());
  const [token, setToken] = useState<string | null>(api.getStoredToken());
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const init = async () => {
      const storedToken = api.getStoredToken();
      const storedUser = api.getStoredUser();
      if (storedToken) {
        setToken(storedToken);
        if (storedUser) setUser(storedUser);
        try {
          const me = await api.getMe();
          if (me) setUser(me);
        } catch {
          // Keep existing session if token is still valid
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  const login = async (email: string, pass: string) => {
    const res = await api.login(email, pass);
    const u: User = res.user || {
      id: res.userId,
      email: res.email,
      fullName: res.fullName,
    };
    setUser(u);
    setToken(res.token);
  };

  const register = async (email: string, pass: string, name: string) => {
    const res = await api.register(email, pass, name);
    const u: User = res.user || {
      id: res.userId,
      email: res.email,
      fullName: res.fullName,
    };
    setUser(u);
    setToken(res.token);
  };

  const logout = () => {
    api.clearAuthSession();
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        loading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
