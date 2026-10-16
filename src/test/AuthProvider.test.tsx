import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(async () => {}),
  bootstrap: vi.fn(async () => ({ ok: true })),
  fire: null as null | ((u: unknown) => Promise<void>),
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, cb: (u: unknown) => Promise<void>) => {
    mocks.fire = cb;
    return () => {};
  },
  signOut: mocks.signOut,
  signInWithPopup: vi.fn(),
}));
vi.mock('../services/firebase', () => ({ auth: {}, googleProvider: {} }));
vi.mock('../services/api', () => ({ api: { bootstrap: mocks.bootstrap } }));

import { AuthProvider } from '../shared/auth';
import { useAuth } from '../shared/useAuth';

function Probe() {
  const { user, gateError, ready } = useAuth();
  return (
    <div>
      <span data-testid="state">{ready ? (user ? 'in' : 'out') : 'loading'}</span>
      <span data-testid="error">{gateError ?? ''}</span>
    </div>
  );
}

function fakeUser(claimsAfterBootstrap: Record<string, unknown>) {
  return {
    email: 'friend@example.com',
    providerData: [],
    getIdTokenResult: vi.fn(async (force?: boolean) => ({ claims: force ? claimsAfterBootstrap : {} })),
  };
}

describe('AuthProvider claim gate', () => {
  beforeEach(() => {
    mocks.signOut.mockClear();
    mocks.bootstrap.mockClear();
  });

  it('signs out and shows the gate error when the claim never appears after bootstrap', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    const fire = mocks.fire!;
    const done = fire(fakeUser({}));
    await vi.advanceTimersByTimeAsync(5000);
    await done;
    vi.useRealTimers();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('out'));
    expect(mocks.bootstrap).toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalled();
    expect(screen.getByTestId('error')).toHaveTextContent(/did not finish/);
  });

  it('lets the user in when the claim arrives', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await mocks.fire!(fakeUser({ allowlisted: true }));
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('in'));
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
