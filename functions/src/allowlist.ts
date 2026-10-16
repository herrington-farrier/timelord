import { getFirestore } from 'firebase-admin/firestore';

import { ALLOWED_EMAILS, isInvitedEmail, normalizeEmail, strayInviteEntry } from '../../src/domain/allowlist';

/**
 * The invite list lives at `config/allowlist` so adding someone is one edit in
 * the console — no code change and no deploy. `ALLOWED_EMAILS` in the domain is
 * the seed and the floor: if the document is missing or empty, those addresses
 * still work, so a bad edit cannot lock everyone out.
 */
export const ALLOWLIST_DOC = 'config/allowlist';

type Cached = { emails: Set<string>; entries: string[]; at: number };
let cache: Cached | null = null;

/** Long enough that a spammed sign-in costs no reads; short enough that adding
 *  someone takes effect without a redeploy. */
const TTL_MS = 5 * 60 * 1000;

function normalize(value: unknown): string {
  return normalizeEmail(value as string | undefined | null);
}

export function seedEmails(): Set<string> {
  return new Set(ALLOWED_EMAILS.map(normalize));
}

export async function allowedEmails(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.emails;
  const emails = seedEmails();
  const entries: string[] = [];
  try {
    const snap = await getFirestore().doc(ALLOWLIST_DOC).get();
    const rows = snap.exists ? (snap.data() as { emails?: unknown }).emails : undefined;
    if (Array.isArray(rows)) {
      // Entries are kept exactly as written: firestore.rules compares them
      // verbatim, so trimming or lowercasing here would admit people the rules
      // then refuse to let read anything.
      for (const row of rows) {
        if (typeof row !== 'string' || !row) continue;
        entries.push(row);
        emails.add(row);
      }
    }
  } catch {
    // Unreadable list falls back to the seed rather than admitting nobody.
  }
  cache = { emails, entries, at: Date.now() };
  return emails;
}

export async function isInvited(email: string | undefined | null): Promise<boolean> {
  if (!normalize(email)) return false;
  return isInvitedEmail(email, await allowedEmails());
}

/**
 * When the list holds an entry for this person that differs only by stray
 * spaces or capitals, say so. The rules and the callables both refuse such an
 * entry, and "invite-only" would send the owner looking in the wrong place.
 */
export async function inviteProblem(email: string | undefined | null): Promise<string | null> {
  await allowedEmails();
  if (await isInvited(email)) return null;
  const stray = strayInviteEntry(email, cache?.entries ?? []);
  if (stray === null) return null;
  return `The invite for ${normalize(email)} has stray spaces or capitals in config/allowlist. Fix the entry in the console.`;
}

/**
 * Create the document the first time, from the seed, so the console has
 * something to edit rather than an empty path.
 */
export async function ensureAllowlistDoc(): Promise<void> {
  const ref = getFirestore().doc(ALLOWLIST_DOC);
  const snap = await ref.get();
  if (snap.exists) return;
  await ref.set({ emails: [...seedEmails()], note: 'Add invited emails here. Lowercase, no spaces.' });
  cache = null;
}
