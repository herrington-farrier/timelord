import { WORK_ID, type Bucket, type ListItem } from './types';

export function applyItemOrder(items: ListItem[], orderedIds: string[]): ListItem[] {
  return items.map((item) => {
    const idx = orderedIds.indexOf(item.id);
    if (idx === -1) return item;
    return { ...item, weight: idx + 1 };
  });
}

/** Work stays weight 1. Dragged weighted buckets become 2, 3, 4, … */
export function applyBucketOrder(buckets: Bucket[], weightedOrderIds: string[]): Bucket[] {
  return buckets.map((bucket) => {
    if (bucket.kind === 'work' || bucket.id === WORK_ID) {
      return { ...bucket, weight: 1 };
    }
    const idx = weightedOrderIds.indexOf(bucket.id);
    if (idx === -1) return bucket;
    return { ...bucket, weight: idx + 2 };
  });
}

export function sortByWeight<T extends { weight: number; id: string }>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => a.weight - b.weight || a.id.localeCompare(b.id));
}
