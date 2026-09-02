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

export function isAllowedEmail(email: string | undefined | null): boolean {
  const normalized = String(email || '').trim().toLowerCase();
  return Boolean(normalized) && ALLOWED_EMAILS.some((row) => row.toLowerCase() === normalized);
}

export function canAdmitAccount(email: string | undefined | null, tenantExists: boolean): boolean {
  return tenantExists || isAllowedEmail(email);
}
