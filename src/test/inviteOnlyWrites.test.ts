import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ALLOWED_EMAILS, isInvitedEmail } from '../domain/allowlist';

/**
 * The bug: every write callable gated on the hardcoded owner floor, while
 * sign-up and the security rules read `config/allowlist`. A console-invited
 * account could sign in and read its own data, then be refused on every
 * mutation — buckets, settings, complete, skip — with "This app is invite-only."
 */

const OWNER = ALLOWED_EMAILS[0];
const INVITED = 'friend@example.com';
const STRANGER = 'nobody@example.com';

function source(path: string): string {
  return readFileSync(resolve(__dirname, '../..', path), 'utf8');
}

describe('who counts as invited', () => {
  it('admits an address that only the allowlist document lists', () => {
    expect(isInvitedEmail(INVITED, [INVITED])).toBe(true);
  });

  it('admits an owner the document does not list', () => {
    expect(isInvitedEmail(OWNER, [INVITED])).toBe(true);
  });

  it('admits an owner when the document is empty', () => {
    expect(isInvitedEmail(OWNER, [])).toBe(true);
  });

  it('refuses an address on neither the document nor the floor', () => {
    expect(isInvitedEmail(STRANGER, [INVITED])).toBe(false);
  });

  it('ignores case on the token email only; entries must already be exact', () => {
    expect(isInvitedEmail('Friend@Example.COM', ['friend@example.com'])).toBe(true);
    expect(isInvitedEmail('friend@example.com', [' FRIEND@example.com'])).toBe(false);
  });

  it('refuses a blank address even when the document holds one', () => {
    expect(isInvitedEmail('', [''])).toBe(false);
  });
});

/**
 * The wiring is the part that broke, and no runtime test in this project can
 * reach it: `firebase-admin` resolves only from `functions/node_modules`, so
 * the callable gate cannot be imported here at all. Read the source instead,
 * the way buttonStyles.test.ts reads the stylesheet.
 */
describe('the write gate', () => {
  const http = source('functions/src/http.ts');
  const index = source('functions/src/index.ts');
  // Anchor on the bare name: keying on the full signature would silently slice
  // to nothing if the gate ever went back to being synchronous, and every
  // assertion below would pass against exactly the code they exist to reject.
  const gateStart = http.indexOf('function requireUid');
  const gate = http.slice(gateStart);

  it('finds the gate to read', () => {
    expect(gateStart).toBeGreaterThan(-1);
  });

  it('is asynchronous, since the list is a document read', () => {
    expect(http).toContain('async function requireUid');
  });

  it('asks the live invite list, not the hardcoded floor', () => {
    expect(gate).toContain('isInvited(');
    expect(gate).not.toContain('isAllowedEmail');
  });

  it('does not let the allowlisted claim stand in for the list', () => {
    // Honouring the claim would mean removing someone from the document never
    // revoked their writes.
    expect(gate).not.toContain('allowlisted');
  });

  it('keeps bootstrap declared publicly invokable', () => {
    // Not a loosening: Cloud Run IAM cannot read a Firebase ID token, so every
    // callable authenticates in its own body. bootstrap once lost this binding
    // and was refused by the front end before it ran — silently, since a
    // function that never runs logs nothing. See the README.
    const decl = index.slice(index.indexOf('export const bootstrap'));
    expect(decl.slice(0, 120)).toContain("invoker: 'public'");
  });

  it('awaits the gate at every callable', () => {
    // An un-awaited gate assigns a Promise to uid and denies nobody, which
    // would be worse than the bug it replaced.
    const calls = index.match(/requireUid\(request\)/g) || [];
    const awaited = index.match(/await requireUid\(request\)/g) || [];
    expect(calls.length).toBeGreaterThan(0);
    expect(awaited).toHaveLength(calls.length);
  });
});

describe('the security rules', () => {
  const rules = source('firestore.rules');
  const fnStart = rules.indexOf('function invited()');
  const stripped = rules.replace(/\/\/.*$/gm, '');
  const invited = stripped.slice(stripped.indexOf('function invited()'), stripped.indexOf('function isOwner'));

  it('finds invited() to read', () => {
    expect(fnStart).toBeGreaterThan(-1);
  });

  it('does not accept the allowlisted claim, so removing someone revokes reads', () => {
    expect(stripped).not.toContain('allowlisted');
  });

  it('lowercases the token email on both comparisons, like the server', () => {
    expect(invited).toContain('request.auth.token.email.lower() in seedEmails()');
    expect(invited).toContain('request.auth.token.email.lower() in invitedList()');
  });

  it('checks the owner floor before the config/allowlist lookup', () => {
    const floor = invited.indexOf('seedEmails()');
    const list = invited.indexOf('invitedList()');
    expect(floor).toBeGreaterThan(-1);
    expect(list).toBeGreaterThan(floor);
  });
});

describe('callables removed or hardened', () => {
  const index = source('functions/src/index.ts');
  const http = source('functions/src/http.ts');

  it('no longer exports wipeAccount or upsertBucket', () => {
    expect(index).not.toContain('export const wipeAccount');
    expect(index).not.toContain('export const upsertBucket');
  });

  it('takes no date or id from the request as a bare string', () => {
    expect(index).not.toMatch(/asString\(\s*(request\.)?data\??\.(date|start|id)\b/);
  });

  it('wraps the pure validators as HttpsError refusals', () => {
    expect(http).toContain('export const asDateKey');
    expect(http).toContain('export const asId');
    expect(http).toContain('export const asEnum');
    expect(http).toContain("'invalid-argument'");
  });

  it('checks that reordered ids exist before writing', () => {
    expect(index).toContain('requireExisting(');
    for (const name of ['reorderBuckets', 'reorderItems']) {
      const body = index.slice(index.indexOf(`export const ${name}`));
      const end = body.indexOf('\n});');
      const fn = body.slice(0, end);
      const check = fn.indexOf('await requireExisting(');
      expect(check, name).toBeGreaterThan(-1);
      expect(check, name).toBeLessThan(fn.indexOf('batch.commit()'));
    }
  });

  it('clamps the rebuild range', () => {
    expect(index).toContain('clampRangeDays(request.data?.days, PACK_RANGE_DAYS)');
  });
});

describe('item row refusals', () => {
  const index = source('functions/src/index.ts');
  const build = index.slice(index.indexOf('function buildItemPayload'), index.indexOf('export const saveItems'));

  it('reports a bad type, date or repeat against the row and field', () => {
    // field() routes a ValidationError through label(), which carries { itemId, field }.
    expect(build).toContain("new HttpsError('invalid-argument', `${title}: ${msg}`, { itemId: rowId, field })");
    expect(build).toContain("field('type',");
    expect(build).toContain("field('dueAt',");
    expect(build).toContain("field('cadence',");
    expect(build).not.toContain('asDateKey(');
  });
});

describe('malformed invite entries', () => {
  const index = source('functions/src/index.ts');
  const allow = source('functions/src/allowlist.ts');

  it('stores entries verbatim, since the rules cannot normalise them', () => {
    expect(allow).toContain('emails.add(row)');
    expect(allow).not.toContain('emails.add(normalize(');
  });

  it('names the problem at bootstrap and sign-up instead of "invite-only"', () => {
    expect(allow).toContain('has stray spaces or capitals in config/allowlist. Fix the entry in the console.');
    expect(index).toContain('await refuseUninvited(');
    expect(index).toContain('inviteProblem(email)');
  });
});
