import { FirebaseError } from 'firebase/app';
import { describe, expect, it } from 'vitest';

import { hasAllowlistClaim, shouldSignOutOnGateError, waitForAllowlistClaim } from '../shared/authGate';

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
