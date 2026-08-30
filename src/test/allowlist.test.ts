import { describe, expect, it } from 'vitest';

import { ALLOWED_EMAILS, canAdmitAccount, isAllowedEmail } from '../domain/allowlist';

describe('isAllowedEmail', () => {
  it('allows listed emails and rejects others', () => {
    expect(isAllowedEmail(ALLOWED_EMAILS[0])).toBe(true);
    expect(isAllowedEmail(ALLOWED_EMAILS[0].toUpperCase())).toBe(true);
    expect(isAllowedEmail(` ${ALLOWED_EMAILS[0]} `)).toBe(true);
    expect(isAllowedEmail('stranger@gmail.com')).toBe(false);
    expect(isAllowedEmail('')).toBe(false);
    expect(isAllowedEmail(undefined)).toBe(false);
  });
});

describe('canAdmitAccount', () => {
  it('lets an existing tenant in even without an email on the token', () => {
    expect(canAdmitAccount('', true)).toBe(true);
    expect(canAdmitAccount(undefined, true)).toBe(true);
    expect(canAdmitAccount('stranger@gmail.com', false)).toBe(false);
    expect(canAdmitAccount(ALLOWED_EMAILS[0], false)).toBe(true);
  });
});
