import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

import { isInvited } from './allowlist';

export function requireSignedIn(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in to continue.');
  }
  return uid;
}

export function authEmail(request: CallableRequest, fallback?: string): string {
  const token = request.auth?.token;
  const fromToken = typeof token?.email === 'string' ? token.email : '';
  const identities = token?.firebase?.identities?.email;
  const fromIdentities = Array.isArray(identities) ? String(identities[0] || '') : '';
  return fromToken || fromIdentities || fallback || '';
}

/**
 * The gate on every write. It reads `config/allowlist` — the same list the
 * sign-up trigger and the security rules read — because the whole point of that
 * document is that inviting someone costs one console edit and no deploy. This
 * used to check only the hardcoded floor, so a console-invited account could
 * sign in and read its own data but was refused on every single mutation.
 *
 * `isInvited` seeds itself from that floor, so a missing or mangled document
 * still cannot lock the owner out, and its cache makes the steady state free.
 *
 * The `allowlisted` claim is deliberately not a fast path here. It buys nothing
 * once the list is cached, and honouring it would mean removing someone from
 * the document never revoked their writes.
 */
export async function requireUid(request: CallableRequest): Promise<string> {
  const uid = requireSignedIn(request);
  if (await isInvited(authEmail(request))) return uid;
  throw new HttpsError('permission-denied', 'This app is invite-only.');
}

export function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpsError('invalid-argument', `${label} is required.`);
  }
  return value.trim();
}

export function asNumber(value: unknown, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new HttpsError('invalid-argument', `${label} must be a number.`);
  }
  return n;
}

export function newId(): string {
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
