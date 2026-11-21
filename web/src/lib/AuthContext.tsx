import { createContext, useEffect, useState, type ReactNode } from 'react';
import { getCurrentSession, logout as cognitoLogout, toAuthenticatedUser, type AuthenticatedUser } from './auth';

export interface AuthContextValue {
  user: AuthenticatedUser | null;
  loading: boolean;
  setUser: (user: AuthenticatedUser | null) => void;
  logout: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentSession()
      .then((s) => setUser(s ? toAuthenticatedUser(s) : null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    // API calls look the token up themselves at request time; this only
    // keeps the displayed user/admin flag in step with the stored session.
    const interval = setInterval(() => {
      getCurrentSession()
        .then((s) => s && setUser(toAuthenticatedUser(s)))
        .catch(() => undefined);
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const logout = () => {
    cognitoLogout();
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, setUser, logout }}>{children}</AuthContext.Provider>;
}
