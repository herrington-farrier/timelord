import { createContext, useContext } from 'react';
import type { User } from 'firebase/auth';

export type AuthContextValue = {
  user: User | null;
  ready: boolean;
  gateError: string | null;
  signIn: () => Promise<void>;
  logOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
