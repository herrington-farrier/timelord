import { FirebaseError } from 'firebase/app';

export function hasAllowlistClaim(claims: unknown): boolean {
  return (
    typeof claims === 'object' &&
    claims !== null &&
    'allowlisted' in claims &&
    (claims as { allowlisted?: unknown }).allowlisted === true
  );
}

export function shouldSignOutOnGateError(err: unknown): boolean {
  if (!(err instanceof FirebaseError)) return false;
  return err.code === 'functions/permission-denied' || err.code === 'permission-denied';
}
