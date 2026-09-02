import { FirebaseError } from 'firebase/app';

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
