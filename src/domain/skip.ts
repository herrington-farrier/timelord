import { weekStart } from '../shared/dates';
import { addDaysKey, weekdayFromKey } from './cadence';
import { isEventDay } from './sections';
import { todaySectionDropped, todaySectionItems } from './today';
import { APPOINTMENTS_ID, SLOTS, type Bucket, type ListItem, type PackedBlock, type Slot } from './types';
import { isEventsBucket } from './predicates';

function isLeftover(block: PackedBlock): boolean {
  return (
    Boolean(block.itemId) &&
    block.kind !== 'personal' &&
    (block.status === 'pending' || block.status === 'dropped')
  );
}

/** An appointment that carries on into a later section is not left over yet. */
function spansPast(block: PackedBlock, section: Slot): boolean {
  if (!block.slots?.length) return false;
  const here = SLOTS.indexOf(section);
  return block.slots.some((s) => SLOTS.indexOf(s) > here);
}

export function leftoverSectionBlocks(blocks: PackedBlock[], dropped: PackedBlock[], section: Slot): PackedBlock[] {
  return [
    // A missed appointment is missed, and auto-skips like anything else — but
    // only once the last section it spans is over.
    ...todaySectionItems(blocks, section).filter((b) => isLeftover(b) && !spansPast(b, section)),
    ...todaySectionDropped(dropped, section).filter(isLeftover),
  ];
}

export function markLeftoversSkipped(rows: PackedBlock[], leftovers: PackedBlock[]): PackedBlock[] {
  const ids = new Set(leftovers.map((b) => b.id));
  return rows.map((b) => (ids.has(b.id) ? { ...b, status: 'skipped' as const } : b));
}

export function skipLogBlocks(leftovers: PackedBlock[]): PackedBlock[] {
  const seen = new Set<string>();
  const out: PackedBlock[] = [];
  for (const b of leftovers) {
    const key = b.itemId || b.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b);
  }
  return out;
}

export function nextAssignedDate(bucket: Bucket, afterDate: string, events?: Bucket): string {
  let key = addDaysKey(afterDate, 1);
  for (let i = 0; i < 370; i += 1) {
    // Nothing else runs on an event day, so a push onto one would vanish.
    if (bucket.days.includes(weekdayFromKey(key)) && !isEventDay(events, key)) return key;
    key = addDaysKey(key, 1);
  }
  return addDaysKey(afterDate, 1);
}

export function skipPushDate(item: ListItem, bucket: Bucket | undefined, fromDate: string, events?: Bucket): string | null {
  if (item.type !== 'scheduled') return null;
  if (!bucket) return null;
  // Events and appointments are pinned to a date. Skipping one cancels it; it
  // does not reappear on the next day the bucket runs.
  if (isEventsBucket(bucket)) return null;
  if (bucket.kind === 'appointment' || bucket.id === APPOINTMENTS_ID) return null;
  return nextAssignedDate(bucket, fromDate, events);
}

/**
 * The earliest `toDate` a caller needs loaded. A push only matters on the day it
 * lands, so packing from `firstDate` needs pushes landing on or after it; today
 * is the floor for a caller that packs only the future.
 */
export function pushesNeededFrom(firstDate: string, today: string): string {
  return firstDate < today ? firstDate : today;
}

/**
 * Pushes that landed before the first day any pack covers (the start of this
 * week) can never change a day again. These are deleted when a range is packed.
 */
export function pushPruneCutoff(today: string): string {
  return weekStart(today);
}

/**
 * The dates a repack may rewrite. A past week is history, and the pushes that
 * landed on it may already be pruned, so repacking it would drop pushed items.
 */
export function repackableDates(dates: string[], today: string): string[] {
  const from = pushPruneCutoff(today);
  return dates.filter((d) => d >= from);
}
