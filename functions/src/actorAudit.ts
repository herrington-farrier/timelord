import { getAuth } from 'firebase-admin/auth';

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

async function signatureFor(uid: string): Promise<string> {
  try {
    const user = await getAuth().getUser(uid);
    const name = user.displayName?.trim() || user.email?.trim() || uid;
    return name;
  } catch {
    return uid;
  }
}
