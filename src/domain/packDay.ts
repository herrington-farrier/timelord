import { assignWeeklyBudgets, dailyBudgetFor, personalCountsAsDay } from './budget';
import { cadenceHitsDate } from './cadence';
import { isAppointmentBucket } from './seed';
import { bucketSlots, capsAfterLoad, isEventDay, itemSlots, sectionCapacity, slotIndex, itemWorkSlot } from './sections';
import { skipPushDate } from './skip';
import {
  APPOINTMENTS_ID,
  EVENTS_ID,
  PERSONAL_ID,
  SLOTS,
  WORK_ID,
  type Bucket,
  type DaySettings,
  type ListItem,
  type PackedBlock,
  type PreviousBlock,
  type SkipPush,
  type Slot,
} from './types';

export type PackDayInput = {
  date: string;
  settings: DaySettings;
  buckets: Bucket[];
  items: ListItem[];
  previous?: PreviousBlock[];
  skipPushes?: SkipPush[];
  sectionExtra?: Partial<Record<Slot, number>>;
  sectionUsed?: Partial<Record<Slot, number>>;
};

export type DroppedBucket = {
  bucketId: string;
  name: string;
  color: string;
  minutes: number;
};

export type PackDayResult = {
  blocks: PackedBlock[];
  dropped: PackedBlock[];
  droppedBuckets: DroppedBucket[];
  packedMinutes: number;
  droppedMinutes: number;
  remainingMinutes: number;
};

export { daySections, sectionMinutes } from './sections';

const BREAK_SPLIT_MINUTES = 2 * 60;

function prevStatus(previous: PreviousBlock[] | undefined, itemId?: string, appointmentId?: string): PreviousBlock | undefined {
  if (!previous) return undefined;
  return previous.find((p) => {
    if (itemId && p.itemId === itemId) return true;
    if (appointmentId && p.appointmentId === appointmentId) return true;
    return false;
  });
}

function itemHitsDate(item: ListItem, dateKey: string, skipPushes: SkipPush[]): boolean {
  if (item.archived) return false;
  if (skipPushes.some((p) => p.itemId === item.id && p.toDate === dateKey)) return true;
  if (item.bucketId === EVENTS_ID) return item.dueAt === dateKey;
  if (item.bucketId === APPOINTMENTS_ID) return item.dueAt === dateKey;
  return cadenceHitsDate(item.cadence, dateKey);
}

function sortItems(items: ListItem[]): ListItem[] {
  return items.slice().sort((a, b) => a.weight - b.weight);
}

function blockId(date: string, suffix: string): string {
  return `${date}:${suffix}`;
}

/** Appointment blocks keep kind 'appointment' so the Quest and Quest Log
 *  treatments (isAccentChip, .cal-chip--appt) keep working unchanged. */
function blockKind(bucket: Bucket): PackedBlock['kind'] {
  if (isAppointmentBucket(bucket)) return 'appointment';
  if (bucket.kind === 'work') return 'work';
  if (bucket.kind === 'event') return 'event';
  return 'weighted';
}

/** The section an item lands in. Multi-slot buckets let each item pick. */
function slotForItem(item: ListItem, bucket: Bucket): Slot {
  if (bucketSlots(bucket).length <= 1) return bucket.slot;
  return itemSlots(item, bucket)[0];
}

export function packDay(input: PackDayInput): PackDayResult {
  const { date, settings, items } = input;
  const skipPushes = input.skipPushes || [];
  const previous = input.previous || [];
  const buckets = assignWeeklyBudgets(settings, input.buckets);
  const foundWork = buckets.find((b) => b.kind === 'work' && !b.archived);
  if (!foundWork) throw new Error('Work bucket is required.');
  const work = foundWork;
  const personal = buckets.find((b) => b.kind === 'personal' || b.id === PERSONAL_ID);
  const events = buckets.find((b) => b.kind === 'event' || b.id === EVENTS_ID);

  const blocks: PackedBlock[] = [];
  const dropped: PackedBlock[] = [];
  const droppedBuckets: DroppedBucket[] = [];
  let order = 0;

  function pushBlock(
    partial: Omit<PackedBlock, 'date' | 'endMinutes' | 'durationMinutes'> & { durationMinutes: number }
  ): PackedBlock {
    const { slot, ...rest } = partial;
    const block: PackedBlock = {
      ...rest,
      date,
      startMinutes: partial.startMinutes,
      endMinutes: partial.startMinutes + partial.durationMinutes,
      durationMinutes: partial.durationMinutes,
    };
    if (slot) block.slot = slot;
    const saved = prevStatus(previous, block.itemId, block.appointmentId);
    if (saved && (saved.status === 'complete' || saved.status === 'skipped')) {
      block.status = saved.status;
    }
    blocks.push(block);
    return block;
  }

  function dropItem(item: ListItem, bucket: Bucket): void {
    if (dropped.some((d) => d.itemId === item.id)) return;
    dropped.push({
      id: blockId(date, `drop-${item.id}`),
      date,
      bucketId: bucket.id,
      itemId: item.id,
      title: item.title,
      kind: blockKind(bucket),
      startMinutes: 0,
      endMinutes: item.durationMinutes,
      durationMinutes: item.durationMinutes,
      status: 'dropped',
      color: bucket.color,
      flexible: true,
      ...(bucket.kind === 'event' ? {} : { slot: slotForItem(item, bucket) }),
    });
  }

  const personalColor = personal?.color || '5b9bd5';
  // Personal is normally a pause beside the day and costs nothing. When it
  // counts as day time, the routines and Break take real minutes.
  const countsPersonal = personalCountsAsDay(settings);
  const personalMins: Record<Slot, number> = countsPersonal
    ? {
        morning: Math.max(0, Number(settings.morningMinutes) || 0),
        midday: Math.max(0, Number(settings.breakMinutes) || 0),
        evening: Math.max(0, Number(settings.eveningMinutes) || 0),
      }
    : { morning: 0, midday: 0, evening: 0 };
  pushBlock({
    id: blockId(date, 'morning'),
    bucketId: PERSONAL_ID,
    title: 'Morning Routine',
    kind: 'personal',
    startMinutes: order++,
    durationMinutes: personalMins.morning,
    status: 'pending',
    color: personalColor,
    flexible: true,
    slot: 'morning',
  });
  pushBlock({
    id: blockId(date, 'evening'),
    bucketId: PERSONAL_ID,
    title: 'Evening Routine',
    kind: 'personal',
    startMinutes: 900 + order++,
    durationMinutes: personalMins.evening,
    status: 'pending',
    color: personalColor,
    flexible: true,
    slot: 'evening',
  });

  function hittingFor(bucket: Bucket): ListItem[] {
    return sortItems(items.filter((it) => it.bucketId === bucket.id && itemHitsDate(it, date, skipPushes)));
  }

  function placeItem(item: ListItem, bucket: Bucket, slot?: Slot, spans?: Slot[]): void {
    pushBlock({
      id: blockId(date, `item-${item.id}`),
      bucketId: bucket.id,
      itemId: item.id,
      title: item.title,
      kind: blockKind(bucket),
      startMinutes: order++,
      durationMinutes: item.durationMinutes,
      status: 'pending',
      color: bucket.color,
      flexible: true,
      slot,
      ...(spans && spans.length > 1 ? { slots: spans } : {}),
      ...(item.apptTime ? { apptTime: item.apptTime } : {}),
    });
  }

  if (isEventDay(events, date) && events) {
    for (const item of hittingFor(events)) {
      placeItem(item, events);
    }
    const packedMinutes = blocks
      .filter((b) => b.kind !== 'personal' && b.kind !== 'transition' && b.status !== 'dropped')
      .reduce((s, b) => s + b.durationMinutes, 0);
    return {
      blocks,
      dropped,
      droppedBuckets,
      packedMinutes,
      droppedMinutes: 0,
      remainingMinutes: Math.max(0, settings.dayMinutes - packedMinutes),
    };
  }

  if (events) {
    for (const item of hittingFor(events)) {
      placeItem(item, events);
    }
  }

  const remainingBudget: Record<string, number> = {};
  for (const b of buckets) remainingBudget[b.id] = dailyBudgetFor(b, date);

  const caps = sectionCapacity(settings, input.sectionExtra, input.sectionUsed);

  /**
   * An appointment costs the day its whole duration, not just whatever its own
   * section had left. A 2h appointment in a section with 10m free takes those
   * 10m and 1h50m out of the sections that follow — so the work it displaces
   * falls off, wherever in the day that work sits.
   *
   * Worked out up front so `caps` already reflects it and the bucket loop can
   * treat what remains as the time genuinely available.
   */
  const apptBucket = buckets.find((b) => !b.archived && isAppointmentBucket(b));
  const apptLoad: Record<Slot, number> = { morning: 0, midday: 0, evening: 0 };
  if (apptBucket) {
    for (const appt of items.filter(
      (it) => it.bucketId === apptBucket.id && itemHitsDate(it, date, skipPushes)
    )) {
      // Skipped means cancelled: the day gets those hours back.
      if (prevStatus(previous, appt.id)?.status === 'skipped') continue;
      apptLoad[itemSlots(appt, apptBucket)[0]] += Math.max(0, appt.durationMinutes);
    }
  }
  const bucketCaps = capsAfterLoad(caps, {
    morning: apptLoad.morning + personalMins.morning,
    midday: apptLoad.midday + personalMins.midday,
    evening: apptLoad.evening + personalMins.evening,
  });

  function placeBreak(slot: Slot): void {
    pushBlock({
      id: blockId(date, 'break'),
      bucketId: PERSONAL_ID,
      title: 'Break',
      kind: 'personal',
      startMinutes: order++,
      durationMinutes: personalMins.midday,
      status: 'pending',
      color: personalColor,
      flexible: true,
      slot,
    });
  }

  function placeWorkInSlot(slot: Slot, sectionLeft: number, withBreak: boolean): number {
    const hitting = hittingFor(work).filter(
      (item) =>
        itemWorkSlot(item, work) === slot &&
        !blocks.some((b) => b.itemId === item.id) &&
        !dropped.some((d) => d.itemId === item.id)
    );
    const accepted: ListItem[] = [];
    let budget = remainingBudget[work.id] ?? 0;
    let left = sectionLeft;
    for (const item of hitting) {
      if (item.durationMinutes === 0) {
        accepted.push(item);
        continue;
      }
      if (item.durationMinutes > budget || item.durationMinutes > left) {
        dropItem(item, work);
        continue;
      }
      accepted.push(item);
      budget -= item.durationMinutes;
      left -= item.durationMinutes;
    }
    remainingBudget[work.id] = budget;

    if (!withBreak) {
      for (const item of accepted) placeItem(item, work, slot);
      return left;
    }

    if (!accepted.length) {
      placeBreak(slot);
      return left;
    }

    const workNeed = accepted.reduce((s, i) => s + i.durationMinutes, 0);
    const mid = workNeed / 2;
    let walked = 0;
    let broke = false;
    for (const item of accepted) {
      if (!broke && walked >= mid) {
        placeBreak(slot);
        broke = true;
      }
      const crosses = !broke && walked < mid && walked + item.durationMinutes > mid;
      if (crosses && item.durationMinutes > BREAK_SPLIT_MINUTES && item.durationMinutes > 0) {
        const first = Math.max(1, Math.round(mid - walked));
        pushBlock({
          id: blockId(date, `item-${item.id}-a`),
          bucketId: WORK_ID,
          itemId: item.id,
          title: item.title,
          kind: 'work',
          startMinutes: order++,
          durationMinutes: first,
          status: 'pending',
          color: work.color,
          flexible: true,
          slot,
        });
        placeBreak(slot);
        broke = true;
        pushBlock({
          id: blockId(date, `item-${item.id}-b`),
          bucketId: WORK_ID,
          itemId: item.id,
          title: item.title,
          kind: 'work',
          startMinutes: order++,
          durationMinutes: item.durationMinutes - first,
          status: 'pending',
          color: work.color,
          flexible: true,
          slot,
        });
        walked += item.durationMinutes;
        continue;
      }
      if (crosses && item.durationMinutes <= BREAK_SPLIT_MINUTES) {
        placeItem(item, work, slot);
        walked += item.durationMinutes;
        placeBreak(slot);
        broke = true;
        continue;
      }
      placeItem(item, work, slot);
      walked += item.durationMinutes;
    }
    if (!broke) placeBreak(slot);
    return left;
  }

  const live = buckets
    .filter(
      (b) =>
        !b.archived &&
        (b.kind === 'weighted' || b.kind === 'work' || isAppointmentBucket(b)) &&
        b.id !== EVENTS_ID
    )
    // Appointments come first in every section, ahead of Work. Ordered by kind
    // rather than weight: Personal and Events are both weight 0 already, so a
    // tie would resolve arbitrarily.
    .sort((a, b) => {
      const rank = (x: Bucket) => (isAppointmentBucket(x) ? -1 : 0);
      return rank(a) - rank(b) || a.weight - b.weight;
    });

  for (const slot of SLOTS) {
    let left = bucketCaps[slot];
    const inSlot = live.filter((b) => bucketSlots(b).includes(slot));
    if (slot === 'midday' && !inSlot.some((b) => b.kind === 'work' || b.id === WORK_ID)) {
      placeBreak('midday');
    }
    for (const bucket of inSlot) {
      if (bucket.kind === 'work' || bucket.id === WORK_ID) {
        left = placeWorkInSlot(slot, left, slot === 'midday');
        continue;
      }
      if (isAppointmentBucket(bucket)) {
        // Fixed commitments. The bucket has no hours, so there is no budget to
        // check against — an appointment is always placed, and takes its time
        // off the section before anything else competes for what is left.
        // 0-duration entries are checklist items and cost nothing.
        for (const appt of hittingFor(bucket).filter((it) => slotForItem(it, bucket) === slot)) {
          placeItem(appt, bucket, slot, itemSlots(appt, bucket));
        }
        continue;
      }
      const hitting = hittingFor(bucket).filter((it) => slotForItem(it, bucket) === slot);
      let placedCount = 0;
      for (const item of hitting) {
        const need = item.durationMinutes;
        const budgetLeft = remainingBudget[bucket.id] ?? 0;
        if (need === 0) {
          placeItem(item, bucket, slot);
          placedCount += 1;
          continue;
        }
        if (need > budgetLeft || need > left) {
          dropItem(item, bucket);
          continue;
        }
        placeItem(item, bucket, slot);
        remainingBudget[bucket.id] = budgetLeft - need;
        left -= need;
        placedCount += 1;
      }
      if (hitting.length && placedCount === 0) {
        droppedBuckets.push({
          bucketId: bucket.id,
          name: bucket.name,
          color: bucket.color,
          minutes: hitting.reduce((s, it) => s + it.durationMinutes, 0),
        });
      }
    }
  }

  for (const b of buckets) {
    if (b.archived || b.kind === 'personal' || b.kind === 'event') continue;
    for (const it of hittingFor(b)) {
      if (!blocks.some((bl) => bl.itemId === it.id) && !dropped.some((d) => d.itemId === it.id)) {
        dropItem(it, b);
      }
    }
  }

  const packedMinutes = blocks
    .filter((b) => b.kind !== 'personal' && b.kind !== 'transition' && b.status !== 'dropped')
    .reduce((s, b) => s + b.durationMinutes, 0);
  const droppedMinutes = dropped.reduce((s, b) => s + b.durationMinutes, 0);

  blocks.sort((a, b) => {
    const sa = slotIndex(a.slot);
    const sb = slotIndex(b.slot);
    const aAccent = a.kind === 'appointment' || a.kind === 'event';
    const bAccent = b.kind === 'appointment' || b.kind === 'event';
    if (aAccent && !bAccent) return -1;
    if (bAccent && !aAccent) return 1;
    if (sa !== sb) return sa - sb;
    return a.startMinutes - b.startMinutes;
  });

  return {
    blocks,
    dropped,
    droppedBuckets,
    packedMinutes,
    droppedMinutes,
    remainingMinutes: Math.max(0, settings.dayMinutes - packedMinutes),
  };
}

export function collectEndDaySkipPushes(
  date: string,
  blocks: PackedBlock[],
  dropped: PackedBlock[],
  items: ListItem[],
  buckets: Bucket[]
): SkipPush[] {
  const unmarked = [
    ...blocks.filter((b) => b.itemId && b.status === 'pending' && b.kind !== 'personal' && b.kind !== 'appointment'),
    ...dropped.filter((b) => b.itemId && b.status === 'dropped'),
  ];
  const out: SkipPush[] = [];
  for (const block of unmarked) {
    const item = items.find((i) => i.id === block.itemId);
    if (!item || item.type !== 'scheduled') continue;
    const bucket = buckets.find((b) => b.id === item.bucketId);
    const toDate = skipPushDate(item, bucket, date);
    if (toDate) out.push({ itemId: item.id, toDate });
  }
  return out;
}
