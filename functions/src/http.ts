import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

export function requireUid(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in to continue.');
  }
  return uid;
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
