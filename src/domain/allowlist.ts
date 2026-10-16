/**
 * The seed and the floor. The live invite list is the Firestore document
 * `config/allowlist`, which both the sign-in gate and the security rules read,
 * so adding someone needs no deploy. These addresses always work, so a bad edit
 * to that document cannot lock everyone out.
 */
export const ALLOWED_EMAILS = [
  'herrington.farrier@gmail.com',
  'codygllc.office@gmail.com',
  'codygllc465@gmail.com',
];

export function normalizeEmail(email: string | undefined | null): string {
  return String(email ?? '').trim().toLowerCase();
}

/** The floor on its own. Only the sign-in seed and the rules mirror should use
 *  this directly — a write gate that asks it instead of the live list refuses
 *  everyone who was invited from the console. */
export function isAllowedEmail(email: string | undefined | null): boolean {
  const normalized = normalizeEmail(email);
  return Boolean(normalized) && ALLOWED_EMAILS.some((row) => row.toLowerCase() === normalized);
}

/**
 * The one matching rule, shared with `firestore.rules`: the token's email is
 * lowercased, then compared for exact equality with each entry. Entries are NOT
 * trimmed or lowercased, because the rules cannot do that to a list they read.
 * An entry such as " Foo@Gmail.com" therefore matches nobody, here or there, and
 * `strayInviteEntry` is how that gets reported instead of failing quietly.
 */
export function isInvitedEmail(
  email: string | undefined | null,
  invited: Iterable<string> = []
): boolean {
  const token = String(email ?? '').toLowerCase();
  if (!token.trim()) return false;
  if (ALLOWED_EMAILS.includes(token)) return true;
  for (const row of invited) {
    if (row === token) return true;
  }
  return false;
}

/**
 * An entry that names this person but would not match them: it differs only by
 * stray spaces or capitals. Null when there is none, or when the person is
 * already invited by an exact entry.
 */
export function strayInviteEntry(
  email: string | undefined | null,
  invited: Iterable<unknown>
): string | null {
  const token = String(email ?? '').toLowerCase();
  const wanted = normalizeEmail(email);
  if (!wanted) return null;
  let stray: string | null = null;
  for (const row of invited) {
    if (typeof row !== 'string') continue;
    if (row === token) return null;
    if (normalizeEmail(row) === wanted) stray = row;
  }
  return stray;
}

export function canAdmitAccount(email: string | undefined | null, tenantExists: boolean): boolean {
  return tenantExists || isAllowedEmail(email);
}
