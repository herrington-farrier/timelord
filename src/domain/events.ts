import type { EventRange } from './types';

export function newEventRangeId(): string {
  return `er_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function eventRanges(bucket: { ranges?: EventRange[]; startDate?: string; endDate?: string } | undefined): EventRange[] {
  if (!bucket) return [];
  if (bucket.ranges?.length) return bucket.ranges.filter((r) => r.startDate && r.endDate && r.endDate >= r.startDate);
  const startDate = bucket.startDate || '';
  const endDate = bucket.endDate || '';
  if (startDate && endDate && endDate >= startDate) return [{ id: 'legacy', startDate, endDate }];
  return [];
}

/** Ranges that have not finished yet, relative to `today`. */
export function liveEventRanges(ranges: EventRange[], today: string): EventRange[] {
  return ranges.filter((r) => r.endDate >= today);
}

/** Ranges whose last day is already past. These are deleted, not archived. */
export function expiredEventRanges(ranges: EventRange[], today: string): EventRange[] {
  return ranges.filter((r) => r.endDate < today);
}

export function eventRangeName(range: EventRange | undefined): string {
  return range?.name?.trim() || 'Event';
}

/** The event an item belongs to: by id, falling back to the range its date sits in. */
export function eventRangeForItem(
  ranges: EventRange[],
  item: { eventId?: string; dueAt?: string }
): EventRange | undefined {
  if (item.eventId) {
    const byId = ranges.find((r) => r.id === item.eventId);
    if (byId) return byId;
  }
  if (!item.dueAt) return undefined;
  return ranges.find((r) => item.dueAt! >= r.startDate && item.dueAt! <= r.endDate);
}

export function parseEventRanges(raw: unknown): EventRange[] {
  if (!Array.isArray(raw)) throw new Error('Event ranges are required.');
  const out: EventRange[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') throw new Error('Event range is invalid.');
    const rec = row as Record<string, unknown>;
    const startDate = typeof rec.startDate === 'string' ? rec.startDate.trim() : '';
    const endDate = typeof rec.endDate === 'string' ? rec.endDate.trim() : '';
    const id = typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : newEventRangeId();
    const name = typeof rec.name === 'string' ? rec.name.trim().slice(0, 60) : '';
    if (!startDate && !endDate) continue;
    if (!startDate || !endDate) throw new Error('Each event range needs a start and end date.');
    if (endDate < startDate) throw new Error('Event range end cannot be before start.');
    out.push({ id, startDate, endDate, ...(name ? { name } : {}) });
  }
  return out;
}
