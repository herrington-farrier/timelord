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
 * The whole invite question: the live list, with the owner floor underneath it.
 *
 * Pure, so both the callable gate and its tests can ask it without Firestore.
 * `invited` is whatever the caller has loaded from `config/allowlist`; the floor
 * is added here rather than trusted from that document, so an empty or mangled
 * list still cannot lock the owner out.
 */
export function isInvitedEmail(
  email: string | undefined | null,
  invited: Iterable<string> = []
): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  if (isAllowedEmail(normalized)) return true;
  for (const row of invited) {
    if (normalizeEmail(row) === normalized) return true;
  }
  return false;
}

export function canAdmitAccount(email: string | undefined | null, tenantExists: boolean): boolean {
  return tenantExists || isAllowedEmail(email);
}
