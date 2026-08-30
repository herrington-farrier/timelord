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

export function parseEventRanges(raw: unknown): EventRange[] {
  if (!Array.isArray(raw)) throw new Error('Event ranges are required.');
  const out: EventRange[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') throw new Error('Event range is invalid.');
    const rec = row as Record<string, unknown>;
    const startDate = typeof rec.startDate === 'string' ? rec.startDate.trim() : '';
    const endDate = typeof rec.endDate === 'string' ? rec.endDate.trim() : '';
    const id = typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : newEventRangeId();
    if (!startDate && !endDate) continue;
    if (!startDate || !endDate) throw new Error('Each event range needs a start and end date.');
    if (endDate < startDate) throw new Error('Event range end cannot be before start.');
    out.push({ id, startDate, endDate });
  }
  return out;
}
