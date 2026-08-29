import { assignWeeklyBudgets, dailyBudgetFor } from './budget';
import { cadenceHitsDate } from './cadence';
import { isEventDay, sectionCapacity, slotIndex } from './sections';
import { skipPushDate } from './skip';
import {
  EVENTS_ID,
  PERSONAL_ID,
  SLOTS,
  WORK_ID,
  type Appointment,
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
  appointments: Appointment[];
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
  return cadenceHitsDate(item.cadence, dateKey);
}

function sortItems(items: ListItem[]): ListItem[] {
  return items.slice().sort((a, b) => a.weight - b.weight);
}

function blockId(date: string, suffix: string): string {
  return `${date}:${suffix}`;
}

export function packDay(input: PackDayInput): PackDayResult {
  const { date, settings, items, appointments } = input;
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
      kind: bucket.kind === 'work' ? 'work' : bucket.kind === 'event' ? 'event' : 'weighted',
      startMinutes: 0,
      endMinutes: item.durationMinutes,
      durationMinutes: item.durationMinutes,
      status: 'dropped',
      color: bucket.color,
      flexible: true,
      ...(bucket.kind === 'event' ? {} : { slot: bucket.slot }),
    });
  }

  const personalColor = personal?.color || '5b9bd5';
  pushBlock({
    id: blockId(date, 'morning'),
    bucketId: PERSONAL_ID,
    title: 'Morning Routine',
    kind: 'personal',
    startMinutes: order++,
    durationMinutes: 0,
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
    durationMinutes: 0,
    status: 'pending',
    color: personalColor,
    flexible: true,
    slot: 'evening',
  });

  const dayAppts = appointments.filter((a) => a.date === date);
  for (const appt of dayAppts) {
    pushBlock({
      id: blockId(date, `appt-${appt.id}`),
      bucketId: 'appointment',
      appointmentId: appt.id,
      title: appt.title,
      kind: 'appointment',
      startMinutes: order++,
      durationMinutes: appt.durationMinutes,
      status: 'pending',
      color: appt.color || 'f87171',
      flexible: false,
    });
  }

  function hittingFor(bucket: Bucket): ListItem[] {
    return sortItems(items.filter((it) => it.bucketId === bucket.id && itemHitsDate(it, date, skipPushes)));
  }

  function placeItem(item: ListItem, bucket: Bucket, slot?: Slot): void {
    pushBlock({
      id: blockId(date, `item-${item.id}`),
      bucketId: bucket.id,
      itemId: item.id,
      title: item.title,
      kind: bucket.kind === 'work' ? 'work' : bucket.kind === 'event' ? 'event' : 'weighted',
      startMinutes: order++,
      durationMinutes: item.durationMinutes,
      status: 'pending',
      color: bucket.color,
      flexible: true,
      slot,
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

  function placeBreak(slot: Slot): void {
    pushBlock({
      id: blockId(date, 'break'),
      bucketId: PERSONAL_ID,
      title: 'Break',
      kind: 'personal',
      startMinutes: order++,
      durationMinutes: 0,
      status: 'pending',
      color: personalColor,
      flexible: true,
      slot,
    });
  }

  function placeWorkInSlot(slot: Slot, sectionLeft: number): number {
    const hitting = hittingFor(work);
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
    remainingBudget[work.id] = 0;

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
    .filter((b) => !b.archived && (b.kind === 'weighted' || b.kind === 'work') && b.id !== EVENTS_ID)
    .sort((a, b) => a.weight - b.weight);

  for (const slot of SLOTS) {
    let left = caps[slot];
    const inSlot = live.filter((b) => {
      const slotOf = b.kind === 'work' || b.id === WORK_ID ? (SLOTS.includes(b.slot) ? b.slot : 'midday') : b.slot;
      return slotOf === slot;
    });
    for (const bucket of inSlot) {
      if (bucket.kind === 'work' || bucket.id === WORK_ID) {
        left = placeWorkInSlot(slot, left);
        continue;
      }
      const hitting = hittingFor(bucket);
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
