import { EVENTS_ID, type Bucket, type PackedBlock } from './types';

/**
 * The Events bucket, by kind or by its fixed id. Archived is not considered:
 * callers hold live buckets (loadTenant and the client listeners drop archived
 * rows), and a bucket that is archived is still the Events bucket.
 */
export function isEventsBucket(b: Bucket | undefined): boolean {
  return !!b && (b.kind === 'event' || b.id === EVENTS_ID);
}

export function findEventsBucket(buckets: Bucket[]): Bucket | undefined {
  return buckets.find((b) => isEventsBucket(b));
}

/** The titles and id suffixes packDay.ts emits for the two routine blocks. */
export const MORNING_ROUTINE_TITLE = 'Morning Routine';
export const EVENING_ROUTINE_TITLE = 'Evening Routine';

export function isMorningRoutine(b: Pick<PackedBlock, 'id' | 'title'>): boolean {
  return b.title === MORNING_ROUTINE_TITLE || String(b.id || '').endsWith(':morning');
}

export function isEveningRoutine(b: Pick<PackedBlock, 'id' | 'title'>): boolean {
  return b.title === EVENING_ROUTINE_TITLE || String(b.id || '').endsWith(':evening');
}
