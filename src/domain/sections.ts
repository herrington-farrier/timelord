import { eventRanges } from './events';
import { EVENTS_ID, SLOTS, WORK_ID, type Bucket, type DaySettings, type Slot } from './types';

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

/** An even split, with the remainder on evening so the three add back exactly. */
export function evenSectionSplit(dayMinutes: number): Record<Slot, number> {
  const day = Math.max(0, Math.round(Number(dayMinutes) || 0));
  const third = Math.floor(day / 3);
  return { morning: third, midday: third, evening: day - 2 * third };
}

/**
 * A stored split counts only when it adds back to the day. Day Length is the
 * truth, so a split left over from a longer or shorter day is stale rather than
 * authoritative — honouring it would let the three stretches quietly disagree
 * with the total every other screen is measured against.
 */
export function sectionSplitFits(
  split: Partial<Record<Slot, number>> | null | undefined,
  dayMinutes: number
): boolean {
  if (!split) return false;
  let sum = 0;
  for (const slot of SLOTS) {
    const value = Number(split[slot]);
    if (!Number.isFinite(value) || value < 0) return false;
    sum += Math.round(value);
  }
  return sum === Math.max(0, Math.round(Number(dayMinutes) || 0));
}

/** The section a step borrows from, wrapping so every stretch has a neighbour. */
export function nextSectionSlot(slot: Slot): Slot {
  return SLOTS[(SLOTS.indexOf(slot) + 1) % SLOTS.length];
}

/**
 * Move time into one stretch by taking it out of the one after it.
 *
 * Balancing beats validating: the three always add back to the day because a
 * step never creates or destroys minutes, only moves them. There is nothing to
 * refuse, and no arithmetic left for a person to do.
 *
 * Returns the split unchanged when the neighbour cannot cover the move, so the
 * caller can offer the step or not by asking whether anything happened.
 */
export function stepSectionSplit(
  split: Record<Slot, number>,
  slot: Slot,
  deltaMinutes: number
): Record<Slot, number> {
  const from = nextSectionSlot(slot);
  const delta = Math.round(deltaMinutes);
  if (!delta) return split;
  // Whichever way it goes, one of the pair pays. Neither may go below nothing.
  if (delta > 0 && split[from] < delta) return split;
  if (delta < 0 && split[slot] < -delta) return split;
  return { ...split, [slot]: split[slot] + delta, [from]: split[from] - delta };
}

/**
 * Carry a split onto a different day length, keeping its proportions. Editing
 * Day Length should not throw away the balance someone just set, and re-evening
 * it silently would.
 */
export function rescaleSectionSplit(
  split: Record<Slot, number>,
  fromDay: number,
  toDay: number
): Record<Slot, number> {
  const day = Math.max(0, Math.round(toDay));
  if (fromDay <= 0) return evenSectionSplit(day);
  const morning = Math.round((split.morning / fromDay) * day);
  const midday = Math.round((split.midday / fromDay) * day);
  // Evening takes the rounding, so the three still add back exactly.
  return {
    morning: Math.min(morning, day),
    midday: Math.min(midday, Math.max(0, day - morning)),
    evening: Math.max(0, day - morning - midday),
  };
}

export function sectionMinutes(
  settings: Pick<DaySettings, 'dayMinutes'> & { sectionSplit?: Partial<Record<Slot, number>> | null }
): Record<Slot, number> {
  const split = settings.sectionSplit;
  if (sectionSplitFits(split, settings.dayMinutes)) {
    return {
      morning: Math.round(Number(split?.morning)),
      midday: Math.round(Number(split?.midday)),
      evening: Math.round(Number(split?.evening)),
    };
  }
  return evenSectionSplit(settings.dayMinutes);
}

export function nextSlot(slot: Slot): Slot | null {
  if (slot === 'morning') return 'midday';
  if (slot === 'midday') return 'evening';
  return null;
}

export function bucketSlots(bucket: { kind?: string; id?: string; slot?: Slot; slots?: Slot[] }): Slot[] {
  const picked = (bucket.slots || []).filter((s): s is Slot => SLOTS.includes(s));
  const ordered = SLOTS.filter((s) => picked.includes(s));
  if (ordered.length) return ordered;
  if (bucket.slot && SLOTS.includes(bucket.slot)) return [bucket.slot];
  return bucket.kind === 'work' || bucket.id === WORK_ID ? ['midday'] : ['morning'];
}

export function parseBucketSlots(data: { slot?: unknown; slots?: unknown }, name: string): Slot[] {
  const fromList = Array.isArray(data.slots)
    ? data.slots.filter((s): s is Slot => s === 'morning' || s === 'midday' || s === 'evening')
    : [];
  const ordered = SLOTS.filter((s) => fromList.includes(s));
  if (ordered.length) return ordered;
  // A single stored `slot` is the pre-multi-section shape; still honoured.
  if (data.slot === 'morning' || data.slot === 'midday' || data.slot === 'evening') return [data.slot];
  throw new Error(`${name} needs at least one time of day.`);
}

export function workShowsItemSlot(work: { slot?: Slot; slots?: Slot[] }): boolean {
  return bucketSlots(work).length > 1;
}

/**
 * The sections an item spans. Only appointments set more than one; everything
 * else lands in exactly the section it picked.
 */
export function itemSlots(item: { slot?: Slot; slots?: Slot[] }, bucket: { slot?: Slot; slots?: Slot[] }): Slot[] {
  const allowed = bucketSlots(bucket);
  const picked = (item.slots || []).filter((s) => allowed.includes(s));
  const ordered = SLOTS.filter((s) => picked.includes(s));
  if (ordered.length) return ordered;
  return [itemWorkSlot(item, bucket)];
}

export function itemWorkSlot(item: { slot?: Slot }, work: { slot?: Slot; slots?: Slot[] }): Slot {
  const allowed = bucketSlots(work);
  if (item.slot && allowed.includes(item.slot)) return item.slot;
  return allowed[0];
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

/**
 * Minutes each section owes before any bucket competes for it: appointments,
 * switching time between buckets, plus Personal when it counts as day time.
 * Personal blocks carry 0 minutes otherwise, so this needs no branch on the
 * setting.
 *
 * The section timers read this off the packed blocks, so a transition the
 * packer charged for is one the countdown also loses — the two cannot drift.
 */
export function reservedLoad(
  blocks: { kind?: string; slot?: Slot; durationMinutes?: number; status?: string }[]
): Record<Slot, number> {
  const load: Record<Slot, number> = { morning: 0, midday: 0, evening: 0 };
  for (const b of blocks) {
    if (b.kind !== 'appointment' && b.kind !== 'personal' && b.kind !== 'transition') continue;
    // A cancelled appointment — or a skipped routine — hands its hours back.
    if (b.status === 'skipped') continue;
    const slot = b.slot && SLOTS.includes(b.slot) ? b.slot : 'morning';
    load[slot] += Math.max(0, Number(b.durationMinutes) || 0);
  }
  return load;
}

/**
 * Switching buckets costs real time, so the day has to buy it before anything
 * competes for what is left. A section running three buckets pays for two
 * switches; one bucket pays nothing.
 *
 * Counted from the buckets that have work to do in a section, which is known
 * before packing. A bucket squeezed out entirely leaves its switch bought and
 * unused, so the day errs toward warning you rather than overbooking you.
 */
export function transitionLoad(
  bucketsPerSlot: Partial<Record<Slot, number>>,
  transitionMinutes: number
): Record<Slot, number> {
  const per = Math.max(0, Math.floor(Number(transitionMinutes) || 0));
  const load: Record<Slot, number> = { morning: 0, midday: 0, evening: 0 };
  for (const slot of SLOTS) load[slot] = Math.max(0, (bucketsPerSlot[slot] || 0) - 1) * per;
  return load;
}

/**
 * Spend `load` out of `caps`, spilling whatever a section cannot cover into the
 * sections after it. An appointment costs the day its whole duration, not just
 * what its own section had spare — so a 2h appointment in a section with 10m
 * left takes those 10m and 1h50m from what follows.
 *
 * Shared by the packer (which decides what falls off) and by the section timers
 * (which must count down from the same number).
 */
export function capsAfterLoad(
  caps: Record<Slot, number>,
  load: Record<Slot, number>
): Record<Slot, number> {
  const out = { ...caps };
  let carry = 0;
  for (const slot of SLOTS) {
    const need = (load[slot] || 0) + carry;
    const take = Math.min(out[slot], need);
    out[slot] -= take;
    carry = need - take;
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
