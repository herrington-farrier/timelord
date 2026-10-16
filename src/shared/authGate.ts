import { FirebaseError } from 'firebase/app';

import { formatActionError } from './formatActionError';

export function hasAllowlistClaim(claims: unknown): boolean {
  return (
    typeof claims === 'object' &&
    claims !== null &&
    'allowlisted' in claims &&
    (claims as { allowlisted?: unknown }).allowlisted === true
  );
}

export async function waitForAllowlistClaim(
  refresh: () => Promise<{ claims: unknown }>,
  attempts = 8,
  delayMs = 250
): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    const token = await refresh();
    if (hasAllowlistClaim(token.claims)) return true;
    if (i < attempts - 1 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}

export function shouldSignOutOnGateError(err: unknown): boolean {
  if (!(err instanceof FirebaseError)) return false;
  return err.code === 'functions/permission-denied' || err.code === 'permission-denied';
}

/** Bootstrap returned but the token never gained the claim: the gate did not pass. */
export class AllowlistClaimError extends Error {
  constructor() {
    super('Your account was set up but the sign-in did not finish. Try signing in again.');
    this.name = 'AllowlistClaimError';
  }
}

/** Waits for the claim and refuses, rather than passes, when it never arrives. */
export async function requireAllowlistClaim(
  refresh: () => Promise<{ claims: unknown }>,
  attempts?: number,
  delayMs?: number
): Promise<void> {
  if (!(await waitForAllowlistClaim(refresh, attempts, delayMs))) throw new AllowlistClaimError();
}

/** The bare refusal a stranger gets. Anything more specific came from the server for a reason. */
export function isGenericInviteRefusal(err: unknown): boolean {
  return err instanceof FirebaseError && /^This app is invite-only\.?$/.test(err.message.trim());
}

/**
 * The text under the sign-in button. A stranger gets "not invited"; a specific
 * server refusal (a malformed invite entry) is shown as sent, because the short
 * code mapping would reduce it to "invite-only" and hide what to fix.
 */
export function gateErrorMessage(err: unknown, who: string | null | undefined): string {
  if (shouldSignOutOnGateError(err) && err instanceof FirebaseError) {
    if (isGenericInviteRefusal(err)) return who ? `Sign in: ${who} is not invited.` : formatActionError(err, 'Sign in');
    return `Sign in — ${err.message.trim()}`;
  }
  return formatActionError(err, 'Sign in');
}
