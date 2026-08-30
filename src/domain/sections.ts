import { eventRanges } from './events';
import { EVENTS_ID, SLOTS, type Bucket, type DaySettings, type Slot } from './types';

export function daySections(settings: Pick<DaySettings, 'dayMinutes' | 'dayStartMinutes'>): {
  morning: { start: number; end: number };
  midday: { start: number; end: number };
  evening: { start: number; end: number };
} {
  const mins = sectionMinutes(settings);
  const dayStart = settings.dayStartMinutes;
  return {
    morning: { start: dayStart, end: dayStart + mins.morning },
    midday: { start: dayStart + mins.morning, end: dayStart + mins.morning + mins.midday },
    evening: { start: dayStart + mins.morning + mins.midday, end: dayStart + settings.dayMinutes },
  };
}

export function sectionMinutes(settings: Pick<DaySettings, 'dayMinutes'>): Record<Slot, number> {
  const third = Math.floor(settings.dayMinutes / 3);
  return {
    morning: third,
    midday: third,
    evening: settings.dayMinutes - 2 * third,
  };
}

export function nextSlot(slot: Slot): Slot | null {
  if (slot === 'morning') return 'midday';
  if (slot === 'midday') return 'evening';
  return null;
}

export function slotIndex(slot: Slot | undefined): number {
  if (!slot) return 99;
  return SLOTS.indexOf(slot);
}

export function isEventDay(bucket: Bucket | undefined, date: string): boolean {
  if (!bucket || bucket.archived) return false;
  if (bucket.kind !== 'event' && bucket.id !== EVENTS_ID) return false;
  return eventRanges(bucket).some((range) => date >= range.startDate && date <= range.endDate);
}

export function sectionCapacity(
  settings: Pick<DaySettings, 'dayMinutes'>,
  extra: Partial<Record<Slot, number>> = {},
  used: Partial<Record<Slot, number>> = {}
): Record<Slot, number> {
  const base = sectionMinutes(settings);
  const out = { ...base };
  for (const slot of SLOTS) {
    out[slot] = Math.max(0, base[slot] + (extra[slot] || 0) - (used[slot] || 0));
  }
  return out;
}

export function eatFromSections(
  remaining: Record<Slot, number>,
  from: Slot,
  minutes: number
): Record<Slot, number> {
  const out = { ...remaining };
  let left = Math.max(0, minutes);
  let cur: Slot | null = from;
  while (left > 0 && cur) {
    const take = Math.min(out[cur], left);
    out[cur] -= take;
    left -= take;
    cur = nextSlot(cur);
  }
  return out;
}

export function liveSectionState(prev?: {
  startedAt?: string | null;
  endedAt?: string | null;
  sectionExtra?: Partial<Record<Slot, number>>;
  sectionUsed?: Partial<Record<Slot, number>>;
}): { extra: Partial<Record<Slot, number>>; used: Partial<Record<Slot, number>> } {
  if (!prev?.startedAt && !prev?.endedAt) return { extra: {}, used: {} };
  return { extra: prev.sectionExtra || {}, used: prev.sectionUsed || {} };
}

export function usedFromEat(base: Record<Slot, number>, after: Record<Slot, number>): Partial<Record<Slot, number>> {
  const used: Partial<Record<Slot, number>> = {};
  for (const slot of SLOTS) {
    const n = base[slot] - after[slot];
    if (n > 0) used[slot] = n;
  }
  return used;
}
