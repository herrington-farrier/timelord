import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api } from '../services/api';
import { auth, googleProvider } from '../services/firebase';
import { formatActionError } from './formatActionError';
import { FirebaseError } from 'firebase/app';

type AuthContextValue = {
  user: User | null;
  ready: boolean;
  gateError: string | null;
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
  const [gateError, setGateError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    const firebaseAuth = auth;
    return onAuthStateChanged(firebaseAuth, async (next) => {
      if (!next) {
        setUser(null);
        setReady(true);
        return;
      }
      try {
        const email = next.email || next.providerData.find((p) => p.email)?.email || '';
        await api.bootstrap({ email });
        try {
          await next.getIdToken(true);
        } catch {
          /* claim refresh can wait */
        }
        setGateError(null);
        setUser(next);
      } catch (err) {
        console.error(err);
        const denied =
          err instanceof FirebaseError &&
          (err.code === 'functions/permission-denied' || err.code === 'permission-denied');
        const who = next.email || next.providerData.find((p) => p.email)?.email;
        setGateError(denied && who ? `Sign in: ${who} is not invited.` : formatActionError(err, 'Sign in'));
        await signOut(firebaseAuth);
        setUser(null);
      }
      setReady(true);
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      gateError,
      signIn: async () => {
        if (!auth) throw new Error('Firebase is not configured.');
        setGateError(null);
        await signInWithPopup(auth, googleProvider);
      },
      logOut: async () => {
        if (!auth) return;
        await signOut(auth);
      },
    }),
    [user, ready, gateError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
