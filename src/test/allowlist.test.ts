import { describe, expect, it } from 'vitest';

import { ALLOWED_EMAILS, canAdmitAccount, isAllowedEmail, isInvitedEmail, strayInviteEntry } from '../domain/allowlist';

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

/**
 * firestore.rules lowercases the token email and compares each entry exactly;
 * the server has to say the same thing or a console-invited person passes the
 * callables and is then refused every read.
 */
describe('isInvitedEmail matches the rules', () => {
  it('matches an exact lowercase entry', () => {
    expect(isInvitedEmail('friend@example.com', ['friend@example.com'])).toBe(true);
  });
  it('lowercases the token email', () => {
    expect(isInvitedEmail('Friend@Example.COM', ['friend@example.com'])).toBe(true);
  });
  it('does not match an entry with capitals', () => {
    expect(isInvitedEmail('friend@example.com', ['Friend@Example.com'])).toBe(false);
  });
  it('does not match an entry with stray whitespace', () => {
    expect(isInvitedEmail('friend@example.com', [' friend@example.com'])).toBe(false);
    expect(isInvitedEmail('friend@example.com', ['friend@example.com '])).toBe(false);
  });
  it('still admits the owner floor in any case, and refuses blank', () => {
    expect(isInvitedEmail(ALLOWED_EMAILS[0].toUpperCase(), [])).toBe(true);
    expect(isInvitedEmail('', [''])).toBe(false);
  });
});

describe('strayInviteEntry', () => {
  it('names an entry that matches only after trim or lowercase', () => {
    expect(strayInviteEntry('foo@gmail.com', [' Foo@Gmail.com'])).toBe(' Foo@Gmail.com');
    expect(strayInviteEntry('Foo@Gmail.com', ['FOO@gmail.com'])).toBe('FOO@gmail.com');
    expect(strayInviteEntry('foo@gmail.com', ['foo@gmail.com '])).toBe('foo@gmail.com ');
  });
  it('is null for an exact entry, no entry, or a non-string row', () => {
    expect(strayInviteEntry('foo@gmail.com', ['foo@gmail.com', ' Foo@Gmail.com'])).toBeNull();
    expect(strayInviteEntry('foo@gmail.com', ['bar@gmail.com'])).toBeNull();
    expect(strayInviteEntry('foo@gmail.com', [42, null])).toBeNull();
    expect(strayInviteEntry('', [''])).toBeNull();
  });
});
