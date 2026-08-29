import { assignWeeklyBudgets, dailyBudgetFor } from './budget';
import { cadenceHitsDate } from './cadence';
import { skipPushDate } from './skip';
import {
  PERSONAL_ID,
  WORK_ID,
  type Appointment,
  type Bucket,
  type DaySettings,
  type ListItem,
  type PackedBlock,
  type PreviousBlock,
  type SkipPush,
} from './types';

export type PackDayInput = {
  date: string;
  settings: DaySettings;
  buckets: Bucket[];
  items: ListItem[];
  appointments: Appointment[];
  previous?: PreviousBlock[];
  skipPushes?: SkipPush[];
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

type Interval = { start: number; end: number };

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

function subtractBusy(window: Interval, busy: Interval[]): Interval[] {
  const cuts = busy
    .filter((b) => overlaps(window, b))
    .map((b) => ({ start: Math.max(window.start, b.start), end: Math.min(window.end, b.end) }))
    .sort((a, b) => a.start - b.start);
  const gaps: Interval[] = [];
  let cursor = window.start;
  for (const cut of cuts) {
    if (cut.start > cursor) gaps.push({ start: cursor, end: cut.start });
    cursor = Math.max(cursor, cut.end);
  }
  if (cursor < window.end) gaps.push({ start: cursor, end: window.end });
  return gaps.filter((g) => g.end - g.start > 0);
}

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
  return cadenceHitsDate(item.cadence, dateKey);
}

function sortItems(items: ListItem[]): ListItem[] {
  return items.slice().sort((a, b) => a.weight - b.weight || a.title.localeCompare(b.title));
}

function blockId(date: string, suffix: string): string {
  return `${date}:${suffix}`;
}

const BREAK_SPLIT_MINUTES = 3 * 60;

export function packDay(input: PackDayInput): PackDayResult {
  const { date, settings, items, appointments } = input;
  const skipPushes = input.skipPushes || [];
  const previous = input.previous || [];
  const buckets = assignWeeklyBudgets(settings, input.buckets);
  const foundWork = buckets.find((b) => b.kind === 'work' && !b.archived);
  if (!foundWork) throw new Error('Work bucket is required.');
  const work = foundWork;
  const personal = buckets.find((b) => b.kind === 'personal' || b.id === PERSONAL_ID);

  const dayStart = settings.dayStartMinutes;
  const dayEnd = dayStart + settings.dayMinutes;
  const morningEnd = dayStart + settings.morningMinutes;
  const eveningStart = dayEnd - settings.eveningMinutes;

  const blocks: PackedBlock[] = [];
  const dropped: PackedBlock[] = [];
  const droppedBuckets: DroppedBucket[] = [];
  const busy: Interval[] = [];

  function pushBlock(partial: Omit<PackedBlock, 'date' | 'endMinutes' | 'durationMinutes'> & { durationMinutes: number }): PackedBlock {
    const block: PackedBlock = {
      ...partial,
      date,
      endMinutes: partial.startMinutes + partial.durationMinutes,
      durationMinutes: partial.durationMinutes,
    };
    const saved = prevStatus(previous, block.itemId, block.appointmentId);
    if (saved && (saved.status === 'complete' || saved.status === 'skipped')) {
      block.status = saved.status;
      if (saved.startMinutes != null) block.startMinutes = saved.startMinutes;
      if (saved.endMinutes != null) {
        block.endMinutes = saved.endMinutes;
        block.durationMinutes = block.endMinutes - block.startMinutes;
      }
    }
    blocks.push(block);
    if (block.kind !== 'transition') {
      busy.push({ start: block.startMinutes, end: block.endMinutes });
    }
    return block;
  }

  const personalColor = personal?.color || '5b9bd5';
  pushBlock({
    id: blockId(date, 'morning'),
    bucketId: PERSONAL_ID,
    title: 'Morning Routine',
    kind: 'personal',
    startMinutes: dayStart,
    durationMinutes: settings.morningMinutes,
    status: 'pending',
    color: personalColor,
    flexible: true,
  });
  pushBlock({
    id: blockId(date, 'evening'),
    bucketId: PERSONAL_ID,
    title: 'Evening Routine',
    kind: 'personal',
    startMinutes: eveningStart,
    durationMinutes: settings.eveningMinutes,
    status: 'pending',
    color: personalColor,
    flexible: true,
  });

  const dayAppts = appointments.filter((a) => a.date === date).sort((a, b) => a.startMinutes - b.startMinutes);
  for (const appt of dayAppts) {
    pushBlock({
      id: blockId(date, `appt-${appt.id}`),
      bucketId: 'appointment',
      appointmentId: appt.id,
      title: appt.title,
      kind: 'appointment',
      startMinutes: appt.startMinutes,
      durationMinutes: appt.durationMinutes,
      status: 'pending',
      color: appt.color || 'f87171',
      flexible: false,
    });
  }

  const midStart = morningEnd;
  const midEnd = eveningStart;
  const midPoint = Math.floor((midStart + midEnd) / 2);
  let defaultBreakStart = midPoint - Math.floor(settings.breakMinutes / 2);
  if (defaultBreakStart < midStart) defaultBreakStart = midStart;
  if (defaultBreakStart + settings.breakMinutes > midEnd) defaultBreakStart = midEnd - settings.breakMinutes;
  const defaultBreakEnd = defaultBreakStart + settings.breakMinutes;

  const workToday = dailyBudgetFor(work, date);
  const workHalf1 = Math.floor(workToday / 2);
  const workStart = workHalf1 > 0 ? Math.max(midStart, defaultBreakStart - workHalf1) : defaultBreakStart;
  const workColor = work.color;

  const remainingBudget: Record<string, number> = {};
  for (const b of buckets) remainingBudget[b.id] = dailyBudgetFor(b, date);

  function gapMinutes(gaps: Interval[]): number {
    return gaps.reduce((s, g) => s + Math.max(0, g.end - g.start), 0);
  }

  function dropBucket(bucket: Bucket, hitting: ListItem[]): void {
    const minutes = hitting.reduce((s, it) => s + it.durationMinutes, 0);
    if (!droppedBuckets.some((d) => d.bucketId === bucket.id)) {
      droppedBuckets.push({
        bucketId: bucket.id,
        name: bucket.name,
        color: bucket.color,
        minutes,
      });
    }
    for (const item of hitting) dropItem(item, bucket);
  }

  function placeItemsInGaps(
    gaps: Interval[],
    bucket: Bucket,
    hitting: ListItem[],
    windowKind: PackedBlock['kind']
  ): Interval[] {
    const needed = Math.min(
      remainingBudget[bucket.id] ?? 0,
      hitting.reduce((s, it) => s + it.durationMinutes, 0)
    );
    if (needed > 0 && gapMinutes(gaps) < needed) {
      dropBucket(bucket, hitting);
      return gaps;
    }
    const open = gaps.map((g) => ({ ...g }));
    const leftover: ListItem[] = [];
    for (const item of hitting) {
      const need = item.durationMinutes;
      const budgetLeft = remainingBudget[bucket.id] ?? 0;
      if (need > budgetLeft || need <= 0) {
        leftover.push(item);
        continue;
      }
      let placed = false;
      for (let i = 0; i < open.length; i += 1) {
        const gap = open[i];
        const trans = needsTransition(gap.start) ? settings.transitionMinutes : 0;
        const start = gap.start + trans;
        if (start + need > gap.end) continue;
        pushBlock({
          id: blockId(date, `item-${item.id}`),
          bucketId: bucket.id,
          itemId: item.id,
          title: item.title,
          kind: windowKind,
          startMinutes: start,
          durationMinutes: need,
          status: 'pending',
          color: bucket.color,
          flexible: true,
        });
        remainingBudget[bucket.id] = budgetLeft - need;
        open[i] = { start: start + need, end: gap.end };
        placed = true;
        break;
      }
      if (!placed) leftover.push(item);
    }
    for (const item of leftover) {
      dropItem(item, bucket);
    }
    return open;
  }

  function needsTransition(at: number): boolean {
    const before = blocks
      .filter((b) => b.kind !== 'transition' && b.endMinutes <= at)
      .sort((a, b) => b.endMinutes - a.endMinutes)[0];
    if (!before) return false;
    if (before.kind === 'transition') return false;
    if (at - before.endMinutes >= settings.transitionMinutes) return false;
    return true;
  }

  function dropItem(item: ListItem, bucket: Bucket): void {
    if (dropped.some((d) => d.itemId === item.id)) return;
    dropped.push({
      id: blockId(date, `drop-${item.id}`),
      date,
      bucketId: bucket.id,
      itemId: item.id,
      title: item.title,
      kind: bucket.kind === 'work' ? 'work' : 'weighted',
      startMinutes: 0,
      endMinutes: item.durationMinutes,
      durationMinutes: item.durationMinutes,
      status: 'dropped',
      color: bucket.color,
      flexible: true,
    });
  }

  function hittingFor(bucket: Bucket): ListItem[] {
    return sortItems(
      items.filter((it) => it.bucketId === bucket.id && itemHitsDate(it, date, skipPushes))
    );
  }

  function pushWorkBlock(start: number, need: number, item: ListItem | null): void {
    if (need <= 0) return;
    pushBlock({
      id: blockId(date, item ? `item-${item.id}-${start}` : `work-${start}`),
      bucketId: WORK_ID,
      ...(item ? { itemId: item.id } : {}),
      title: item?.title || work.name,
      kind: 'work',
      startMinutes: start,
      durationMinutes: need,
      status: 'pending',
      color: workColor,
      flexible: true,
    });
  }

  function firstFit(from: number, need: number): number | null {
    if (need <= 0) return from;
    const gaps = subtractBusy({ start: Math.max(from, midStart), end: midEnd }, busy);
    for (const gap of gaps) {
      if (gap.end - gap.start >= need) return gap.start;
    }
    return null;
  }

  function placeBreak(at: number): number {
    if (settings.breakMinutes <= 0) return at;
    const start = Math.min(Math.max(at, midStart), Math.max(midStart, midEnd - settings.breakMinutes));
    pushBlock({
      id: blockId(date, 'break'),
      bucketId: PERSONAL_ID,
      title: 'Break',
      kind: 'personal',
      startMinutes: start,
      durationMinutes: settings.breakMinutes,
      status: 'pending',
      color: personalColor,
      flexible: true,
    });
    return start + settings.breakMinutes;
  }

  const pieces: { item: ListItem | null; need: number }[] = [];
  for (const it of hittingFor(work)) {
    const need = it.durationMinutes;
    if (need <= 0 || need > (remainingBudget[work.id] ?? 0)) {
      dropItem(it, work);
      continue;
    }
    pieces.push({ item: it, need });
    remainingBudget[work.id] = (remainingBudget[work.id] ?? 0) - need;
  }
  const remWork = remainingBudget[work.id] ?? 0;
  if (remWork > 0) pieces.push({ item: null, need: remWork });
  remainingBudget[work.id] = 0;

  let cursor = workStart;
  let breakPlaced = false;
  for (const piece of pieces) {
    if (!breakPlaced && cursor >= defaultBreakStart) {
      cursor = placeBreak(defaultBreakStart);
      breakPlaced = true;
    }
    const start = firstFit(cursor, piece.need);
    if (start == null) {
      if (piece.item) dropItem(piece.item, work);
      continue;
    }
    const crossesBreak =
      !breakPlaced && settings.breakMinutes > 0 && start < defaultBreakEnd && start + piece.need > defaultBreakStart;
    if (crossesBreak && piece.need <= BREAK_SPLIT_MINUTES) {
      pushWorkBlock(start, piece.need, piece.item);
      cursor = placeBreak(start + piece.need);
      breakPlaced = true;
      continue;
    }
    if (crossesBreak && piece.need > BREAK_SPLIT_MINUTES) {
      const firstLen = Math.max(0, defaultBreakStart - start);
      pushWorkBlock(start, firstLen, piece.item);
      cursor = placeBreak(defaultBreakStart);
      breakPlaced = true;
      const rest = piece.need - firstLen;
      const restStart = firstFit(cursor, rest);
      if (restStart != null) {
        pushWorkBlock(restStart, rest, piece.item);
        cursor = restStart + rest;
      }
      continue;
    }
    pushWorkBlock(start, piece.need, piece.item);
    cursor = start + piece.need;
  }
  if (!breakPlaced) placeBreak(defaultBreakStart);

  const workContent = blocks.filter((b) => b.kind === 'work');
  const firstWorkStart = workContent.length ? Math.min(...workContent.map((b) => b.startMinutes)) : defaultBreakStart;
  const lastWorkEnd = workContent.length ? Math.max(...workContent.map((b) => b.endMinutes)) : defaultBreakEnd;
  const morningWindow: Interval = { start: morningEnd, end: firstWorkStart };
  const afterWorkWindow: Interval = { start: lastWorkEnd, end: eveningStart };

  const morningBuckets = buckets
    .filter((b) => !b.archived && b.kind === 'weighted' && b.slot === 'morning' && (remainingBudget[b.id] || 0) > 0)
    .sort((a, b) => a.weight - b.weight);
  let morningGaps = subtractBusy(morningWindow, busy);
  for (const b of morningBuckets) {
    morningGaps = placeItemsInGaps(morningGaps, b, hittingFor(b), 'weighted');
  }

  const middayBuckets = buckets
    .filter((b) => !b.archived && b.kind === 'weighted' && b.slot === 'midday' && (remainingBudget[b.id] || 0) > 0)
    .sort((a, b) => a.weight - b.weight);
  const eveningBuckets = buckets
    .filter((b) => !b.archived && b.kind === 'weighted' && b.slot === 'evening' && (remainingBudget[b.id] || 0) > 0)
    .sort((a, b) => a.weight - b.weight);

  let afterGaps = subtractBusy(afterWorkWindow, busy);
  for (const b of middayBuckets) {
    afterGaps = placeItemsInGaps(afterGaps, b, hittingFor(b), 'weighted');
  }
  for (const b of eveningBuckets) {
    afterGaps = placeItemsInGaps(afterGaps, b, hittingFor(b), 'weighted');
  }

  for (const b of buckets) {
    if (b.archived || b.kind === 'personal') continue;
    for (const it of hittingFor(b)) {
      if (!blocks.some((bl) => bl.itemId === it.id) && !dropped.some((d) => d.itemId === it.id)) {
        dropItem(it, b);
      }
    }
  }

  // Fill remaining gaps with dropped items by priority
  const allGaps = subtractBusy({ start: morningEnd, end: eveningStart }, busy);
  if (gapMinutes(allGaps) > 0 && dropped.length > 0) {
    const sortedBuckets = buckets
      .filter((b) => !b.archived && (b.kind === 'weighted' || b.kind === 'work'))
      .sort((a, b) => a.weight - b.weight);
    
    const fillGaps = allGaps.map((g) => ({ ...g }));
    for (const bucket of sortedBuckets) {
      const droppedForBucket = dropped.filter((d) => d.bucketId === bucket.id);
      for (const droppedBlock of droppedForBucket) {
        const item = items.find((i) => i.id === droppedBlock.itemId);
        if (!item) continue;
        const need = item.durationMinutes;
        for (let i = 0; i < fillGaps.length; i += 1) {
          const gap = fillGaps[i];
          const trans = needsTransition(gap.start) ? settings.transitionMinutes : 0;
          const start = gap.start + trans;
          if (start + need > gap.end) continue;
          pushBlock({
            id: blockId(date, `fill-${item.id}`),
            bucketId: bucket.id,
            itemId: item.id,
            title: item.title,
            kind: bucket.kind === 'work' ? 'work' : 'weighted',
            startMinutes: start,
            durationMinutes: need,
            status: 'pending',
            color: bucket.color,
            flexible: true,
          });
          fillGaps[i] = { start: start + need, end: gap.end };
          const dropIdx = dropped.findIndex((d) => d.itemId === item.id);
          if (dropIdx >= 0) dropped.splice(dropIdx, 1);
          break;
        }
      }
    }
  }

  const content = blocks
    .filter((b) => b.kind !== 'transition')
    .sort((a, b) => a.startMinutes - b.startMinutes || a.title.localeCompare(b.title));

  const withTransitions: PackedBlock[] = [];
  for (let i = 0; i < content.length; i += 1) {
    const cur = content[i];
    const prev = withTransitions[withTransitions.length - 1];
    if (
      prev &&
      prev.kind !== 'transition' &&
      prev.bucketId !== cur.bucketId &&
      cur.startMinutes - prev.endMinutes < settings.transitionMinutes &&
      cur.startMinutes >= prev.endMinutes
    ) {
      const transStart = prev.endMinutes;
      withTransitions.push({
        id: blockId(date, `trans-${i}`),
        date,
        bucketId: 'transition',
        title: formatTransTitle(settings.transitionMinutes),
        kind: 'transition',
        startMinutes: transStart,
        endMinutes: transStart + settings.transitionMinutes,
        durationMinutes: settings.transitionMinutes,
        status: 'pending',
        color: '64748b',
        flexible: true,
      });
    }
    withTransitions.push(cur);
  }

  const packedMinutes = withTransitions
    .filter((b) => b.kind !== 'transition' && b.status !== 'dropped')
    .reduce((s, b) => s + b.durationMinutes, 0);
  const droppedMinutes = dropped.reduce((s, b) => s + b.durationMinutes, 0);

  return {
    blocks: withTransitions,
    dropped,
    droppedBuckets,
    packedMinutes,
    droppedMinutes,
    remainingMinutes: Math.max(0, settings.dayMinutes - packedMinutes),
  };
}

function formatTransTitle(mins: number): string {
  return `${mins}m`;
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
