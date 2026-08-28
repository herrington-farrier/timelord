import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api } from '../services/api';
import { auth, googleProvider } from '../services/firebase';

type AuthContextValue = {
  user: User | null;
  ready: boolean;
  signIn: () => Promise<void>;
  logOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!auth);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, async (next) => {
      setUser(next);
      if (next) {
        try {
          await api.bootstrap({});
        } catch (err) {
          console.error(err);
        }
      }
      setReady(true);
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      signIn: async () => {
        if (!auth) throw new Error('Firebase is not configured.');
        await signInWithPopup(auth, googleProvider);
      },
      logOut: async () => {
        if (!auth) return;
        await signOut(auth);
      },
    }),
    [user, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
