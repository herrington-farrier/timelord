import { FirebaseError } from 'firebase/app';

import { formatActionError } from './formatActionError';

/** A failure shown in place: the message, and where it belongs if known. */
export type ActionError = {
  message: string;
  itemId?: string;
  field?: string;
};

/**
 * The message is toasted; a callable that knows which row and field went wrong
 * also says so in `details`, so the page can mark that row in place.
 */
export function toActionError(err: unknown, action: string): ActionError {
  const message = formatActionError(err, action);
  // Callable errors carry `details`, which FirebaseError's type does not declare.
  const details =
    err instanceof FirebaseError
      ? ((err as FirebaseError & { details?: unknown }).details as Record<string, unknown> | undefined)
      : undefined;
  return {
    message,
    itemId: typeof details?.itemId === 'string' && details.itemId ? details.itemId : undefined,
    field: typeof details?.field === 'string' && details.field ? details.field : undefined,
  };
}
