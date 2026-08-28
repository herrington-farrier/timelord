import { addDaysKey, weekdayFromKey } from './cadence';
import type { Bucket, ListItem } from './types';

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
  return nextAssignedDate(bucket, fromDate);
}
