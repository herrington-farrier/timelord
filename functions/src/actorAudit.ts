import { getAuth } from 'firebase-admin/auth';
import { HttpsError } from 'firebase-functions/v2/https';

export async function stampCreated(uid: string, nowIso: string): Promise<Record<string, string>> {
  const signature = await signatureFor(uid);
  return {
    created_at: nowIso,
    created_by: uid,
    created_by_signature: signature,
    last_updated_at: nowIso,
    last_updated_by: uid,
    last_updated_by_signature: signature,
  };
}

export async function stampLastUpdated(uid: string, nowIso: string): Promise<Record<string, string>> {
  const signature = await signatureFor(uid);
  return {
    last_updated_at: nowIso,
    last_updated_by: uid,
    last_updated_by_signature: signature,
  };
}

/**
 * The name written beside every stamp. Failing to look the user up fails the
 * request: a stamp that silently reads as a bare uid would hide a broken auth
 * lookup, and the audit trail is the one place that must not be guessed.
 */
async function signatureFor(uid: string): Promise<string> {
  let user;
  try {
    user = await getAuth().getUser(uid);
  } catch {
    throw new HttpsError('internal', 'Could not look up the signed-in user. Try again.');
  }
  return user.displayName?.trim() || user.email?.trim() || uid;
}
