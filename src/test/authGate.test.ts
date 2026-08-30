import { FirebaseError } from 'firebase/app';
import { describe, expect, it } from 'vitest';

import { hasAllowlistClaim, shouldSignOutOnGateError } from '../shared/authGate';

describe('hasAllowlistClaim', () => {
  it('is true only after bootstrap has stamped the claim', () => {
    expect(hasAllowlistClaim({ allowlisted: true })).toBe(true);
    expect(hasAllowlistClaim({})).toBe(false);
    expect(hasAllowlistClaim(undefined)).toBe(false);
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
