import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api } from '../services/api';
import { auth, googleProvider } from '../services/firebase';
import { hasAllowlistClaim, shouldSignOutOnGateError, waitForAllowlistClaim } from './authGate';
import { formatActionError } from './formatActionError';

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
        const token = await next.getIdTokenResult();
        if (!hasAllowlistClaim(token.claims)) {
          const email = next.email || next.providerData.find((p) => p.email)?.email || '';
          await api.bootstrap({ email });
          await waitForAllowlistClaim(() => next.getIdTokenResult(true));
        }
        setGateError(null);
        setUser(next);
      } catch (err) {
        console.error(err);
        const who = next.email || next.providerData.find((p) => p.email)?.email;
        setGateError(
          shouldSignOutOnGateError(err) && who
            ? `Sign in: ${who} is not invited.`
            : formatActionError(err, 'Sign in')
        );
        if (shouldSignOutOnGateError(err)) {
          await signOut(firebaseAuth);
          setUser(null);
        } else {
          setUser(next);
        }
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
