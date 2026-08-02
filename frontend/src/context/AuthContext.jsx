import { createContext, useCallback, useState } from 'react';
import * as authApi from '../api/authApi';
import { getStoredToken, getStoredUser, setStoredSession, clearStoredSession } from '../utils/storage';

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getStoredToken());
  const [user, setUser] = useState(() => getStoredUser());

  const login = useCallback(async (username, password) => {
    const result = await authApi.login(username, password);
    setStoredSession(result.token, result.user);
    setToken(result.token);
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      if (token) await authApi.logout();
    } finally {
      clearStoredSession();
      setToken(null);
      setUser(null);
    }
  }, [token]);

  const value = { token, user, isAuthenticated: !!token, login, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
