import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, AuthUser } from '../api';

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  loginWithGoogle: () => void;
  handleAuthCallback: (token: string, provider: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in on app start
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (token && savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        // Optionally validate token with backend
        validateToken();
      } catch (error) {
        // Invalid saved data, clear it
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }

    setIsLoading(false);
  }, []);

  const validateToken = async () => {
    try {
      await api.getCurrentUser();
    } catch (error) {
      // Token is invalid, logout
      logout();
    }
  };

  const login = async (username: string, password: string) => {
    try {
      // 1. Get access token from backend
      const loginResponse = await api.login({ username, password });
      localStorage.setItem('token', loginResponse.access_token);
      

      // 2. Use token to fetch current user
      const meResponse = await api.getCurrentUser();
      const currentUser = meResponse;
      localStorage.setItem('user', JSON.stringify(currentUser));
      setUser(currentUser);
    } catch (error) {
      throw error;
    }
  };

  const register = async (email: string, username: string, password: string) => {
    try {
      const response = await api.register({ email, username, password });
      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
      setUser(response.user);
    } catch (error) {
      throw error;
    }
  };

  const loginWithGoogle = () => {
    // Redirect to Google OAuth
    const backendUrl = process.env.REACT_APP_API_URL || 'http://localhost:8080';
    window.location.href = `${backendUrl}/api/v1/auth/google`;
  };

  const handleAuthCallback = (token: string, provider: string) => {
    try {
      // Decode token to get user info (simple decode, not verify)
      const payload = JSON.parse(atob(token.split('.')[1]));
      const user = {
        id: payload.userId,
        email: payload.email,
        username: payload.username
      };

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      setUser(user);
    } catch (error) {
      console.error('Failed to handle auth callback:', error);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const value: AuthContextType = {
    user,
    isLoading,
    login,
    register,
    loginWithGoogle,
    handleAuthCallback,
    logout,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
