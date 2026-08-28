import { FirebaseError } from 'firebase/app';

const SHORT_BY_CODE: Record<string, string> = {
  'permission-denied': 'not allowed.',
  unauthenticated: 'sign in expired.',
  'not-found': 'not found.',
  'already-exists': 'already exists.',
  unavailable: 'offline?',
  internal: 'server error.',
};

function shortCode(raw: string): string {
  return raw.startsWith('functions/') ? raw.slice('functions/'.length) : raw;
}

export function formatActionError(err: unknown, action: string): string {
  const label = action.trim() || 'Action';
  if (err instanceof FirebaseError) {
    const code = shortCode(err.code);
    const fixed = SHORT_BY_CODE[code];
    if (fixed) return `${label}: ${fixed}`;
    if (err.message) return `${label} — ${err.message.replace(/[.!?]+$/u, '')}.`;
  }
  if (err instanceof Error && err.message) {
    return `${label} — ${err.message.replace(/[.!?]+$/u, '')}.`;
  }
  return `${label} failed.`;
}
