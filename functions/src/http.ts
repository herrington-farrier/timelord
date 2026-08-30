import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

import { isAllowedEmail } from '../../src/domain/allowlist';

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

export function requireUid(request: CallableRequest): string {
  const uid = requireSignedIn(request);
  const claimed = request.auth?.token?.allowlisted === true;
  if (claimed || isAllowedEmail(authEmail(request))) return uid;
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
