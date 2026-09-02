import { addDaysKey, weekdayFromKey } from './cadence';
import { todaySectionDropped, todaySectionItems } from './today';
import { APPOINTMENTS_ID, EVENTS_ID, type Bucket, type ListItem, type PackedBlock, type Slot } from './types';

function isLeftover(block: PackedBlock): boolean {
  return (
    Boolean(block.itemId) &&
    block.kind !== 'personal' &&
    block.kind !== 'appointment' &&
    (block.status === 'pending' || block.status === 'dropped')
  );
}

export function leftoverSectionBlocks(blocks: PackedBlock[], dropped: PackedBlock[], section: Slot): PackedBlock[] {
  return [
    ...todaySectionItems(blocks, section).filter(isLeftover),
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

export function nextAssignedDate(bucket: Bucket, afterDate: string): string {
  let key = addDaysKey(afterDate, 1);
  for (let i = 0; i < 370; i += 1) {
    if (bucket.days.includes(weekdayFromKey(key))) return key;
    key = addDaysKey(key, 1);
  }
  return addDaysKey(afterDate, 1);
}

export function skipPushDate(item: ListItem, bucket: Bucket | undefined, fromDate: string): string | null {
  if (item.type !== 'scheduled') return null;
  if (!bucket) return null;
  // Events and appointments are pinned to a date. Skipping one cancels it; it
  // does not reappear on the next day the bucket runs.
  if (bucket.kind === 'event' || bucket.id === EVENTS_ID) return null;
  if (bucket.kind === 'appointment' || bucket.id === APPOINTMENTS_ID) return null;
  return nextAssignedDate(bucket, fromDate);
}
