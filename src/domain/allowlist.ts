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
