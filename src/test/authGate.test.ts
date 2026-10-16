import { FirebaseError } from 'firebase/app';
import { describe, expect, it } from 'vitest';

import {
  AllowlistClaimError,
  gateErrorMessage,
  hasAllowlistClaim,
  requireAllowlistClaim,
  shouldSignOutOnGateError,
  waitForAllowlistClaim,
} from '../shared/authGate';

describe('hasAllowlistClaim', () => {
  it('is true only after bootstrap has stamped the claim', () => {
    expect(hasAllowlistClaim({ allowlisted: true })).toBe(true);
    expect(hasAllowlistClaim({})).toBe(false);
    expect(hasAllowlistClaim(undefined)).toBe(false);
  });
});

describe('waitForAllowlistClaim', () => {
  it('waits until a later refresh has the claim', async () => {
    let n = 0;
    const ok = await waitForAllowlistClaim(async () => {
      n += 1;
      return { claims: n >= 3 ? { allowlisted: true } : {} };
    }, 5, 0);
    expect(ok).toBe(true);
    expect(n).toBe(3);
  });

  it('is false when the claim never appears', async () => {
    expect(await waitForAllowlistClaim(async () => ({ claims: {} }), 2, 0)).toBe(false);
  });
});

describe('shouldSignOutOnGateError', () => {
  it('signs out only when the account is not invited', () => {
    expect(
      shouldSignOutOnGateError(new FirebaseError('functions/permission-denied', 'invite-only'))
    ).toBe(true);
    expect(shouldSignOutOnGateError(new FirebaseError('functions/internal', 'boom'))).toBe(false);
    expect(shouldSignOutOnGateError(new FirebaseError('functions/unavailable', 'down'))).toBe(false);
    expect(shouldSignOutOnGateError(new Error('network'))).toBe(false);
  });
});

describe('requireAllowlistClaim', () => {
  it('passes once the claim appears', async () => {
    await expect(requireAllowlistClaim(async () => ({ claims: { allowlisted: true } }), 2, 0)).resolves.toBeUndefined();
  });

  it('refuses, so the gate error shows, when the claim never appears after bootstrap', async () => {
    const run = requireAllowlistClaim(async () => ({ claims: {} }), 2, 0);
    await expect(run).rejects.toBeInstanceOf(AllowlistClaimError);
    await expect(run).rejects.toThrow(/did not finish/);
  });
});

describe('gateErrorMessage', () => {
  const denied = (message: string) => new FirebaseError('functions/permission-denied', message);

  it('says not invited for the bare refusal', () => {
    expect(gateErrorMessage(denied('This app is invite-only.'), 'a@b.com')).toBe('Sign in: a@b.com is not invited.');
  });

  it('shows a specific refusal as the server sent it', () => {
    const msg = 'The invite for a@b.com has stray spaces or capitals in config/allowlist. Fix the entry in the console.';
    expect(gateErrorMessage(denied(msg), 'a@b.com')).toBe(`Sign in — ${msg}`);
  });

  it('formats other errors', () => {
    expect(gateErrorMessage(new AllowlistClaimError(), 'a@b.com')).toMatch(/did not finish/);
  });
});
