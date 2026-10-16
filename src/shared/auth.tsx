import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { api } from '../services/api';
import { auth, googleProvider } from '../services/firebase';
import { AllowlistClaimError, gateErrorMessage, hasAllowlistClaim, requireAllowlistClaim, shouldSignOutOnGateError } from './authGate';
import { AuthContext } from './useAuth';

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
          await requireAllowlistClaim(() => next.getIdTokenResult(true));
        }
        setGateError(null);
        setUser(next);
      } catch (err) {
        console.error(err);
        const who = next.email || next.providerData.find((p) => p.email)?.email;
        setGateError(gateErrorMessage(err, who));
        if (shouldSignOutOnGateError(err) || err instanceof AllowlistClaimError) {
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
