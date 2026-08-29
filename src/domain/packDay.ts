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

export function packDay(input: PackDayInput): PackDayResult {
  const { date, settings, items, appointments } = input;
  const skipPushes = input.skipPushes || [];
  const previous = input.previous || [];
  const buckets = assignWeeklyBudgets(settings, input.buckets);
  const work = buckets.find((b) => b.kind === 'work' && !b.archived);
  if (!work) throw new Error('Work bucket is required.');
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
  let breakStart = midPoint - Math.floor(settings.breakMinutes / 2);
  if (breakStart < midStart) breakStart = midStart;
  if (breakStart + settings.breakMinutes > midEnd) breakStart = midEnd - settings.breakMinutes;
  const breakEnd = breakStart + settings.breakMinutes;

  pushBlock({
    id: blockId(date, 'break'),
    bucketId: PERSONAL_ID,
    title: 'Break',
    kind: 'personal',
    startMinutes: breakStart,
    durationMinutes: settings.breakMinutes,
    status: 'pending',
    color: personalColor,
    flexible: true,
  });

  const workToday = dailyBudgetFor(work, date);
  const workHalf1 = Math.floor(workToday / 2);
  const workHalf2 = workToday - workHalf1;

  const workColor = work.color;
  if (workHalf1 > 0) {
    const work1End = breakStart;
    const work1Start = Math.max(midStart, work1End - workHalf1);
    pushBlock({
      id: blockId(date, 'work-1'),
      bucketId: WORK_ID,
      title: work.name,
      kind: 'work',
      startMinutes: work1Start,
      durationMinutes: work1End - work1Start,
      status: 'pending',
      color: workColor,
      flexible: true,
    });
  }
  if (workHalf2 > 0) {
    const work2Start = breakEnd;
    const work2End = Math.min(midEnd, work2Start + workHalf2);
    pushBlock({
      id: blockId(date, 'work-2'),
      bucketId: WORK_ID,
      title: work.name,
      kind: 'work',
      startMinutes: work2Start,
      durationMinutes: work2End - work2Start,
      status: 'pending',
      color: workColor,
      flexible: true,
    });
  }

  const work1Block = blocks.find((b) => b.id === blockId(date, 'work-1'));
  const work2Block = blocks.find((b) => b.id === blockId(date, 'work-2'));
  const morningWindow: Interval = {
    start: morningEnd,
    end: work1Block ? work1Block.startMinutes : breakStart,
  };
  const afterWorkWindow: Interval = {
    start: work2Block ? work2Block.endMinutes : breakEnd,
    end: eveningStart,
  };

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

  const morningBuckets = buckets
    .filter((b) => !b.archived && b.kind === 'weighted' && b.slot === 'morning' && (remainingBudget[b.id] || 0) > 0)
    .sort((a, b) => a.weight - b.weight);
  let morningGaps = subtractBusy(morningWindow, busy);
  for (const b of morningBuckets) {
    morningGaps = placeItemsInGaps(morningGaps, b, hittingFor(b), 'weighted');
  }

  if (work1Block && workHalf1 > 0) {
    const workGaps = subtractBusy(
      { start: work1Block.startMinutes, end: work1Block.endMinutes },
      busy.filter((iv) => iv.start !== work1Block.startMinutes || iv.end !== work1Block.endMinutes)
    );
    const workItems = hittingFor(work);
    const half = Math.ceil(workItems.length / 2) || workItems.length;
    placeItemsInGaps(workGaps, work, workItems.slice(0, half), 'work');
  }
  if (work2Block && workHalf2 > 0) {
    const workGaps = subtractBusy(
      { start: work2Block.startMinutes, end: work2Block.endMinutes },
      busy.filter((iv) => iv.start !== work2Block.startMinutes || iv.end !== work2Block.endMinutes)
    );
    const workItems = hittingFor(work).filter((it) => !blocks.some((b) => b.itemId === it.id) && !dropped.some((d) => d.itemId === it.id));
    placeItemsInGaps(workGaps, work, workItems, 'work');
  } else {
    for (const it of hittingFor(work)) {
      if (!blocks.some((b) => b.itemId === it.id)) dropItem(it, work);
    }
  }

  // If work items exist, remove generic work blocks and only show remaining time
  const workItemBlocks = blocks.filter((b) => b.kind === 'work' && b.itemId);
  if (workItemBlocks.length > 0) {
    const work1Idx = blocks.findIndex((b) => b.id === blockId(date, 'work-1'));
    if (work1Idx >= 0) blocks.splice(work1Idx, 1);
    const work2Idx = blocks.findIndex((b) => b.id === blockId(date, 'work-2'));
    if (work2Idx >= 0) blocks.splice(work2Idx, 1);
    
    // Calculate remaining work budget after items
    const workItemMinutes = workItemBlocks.reduce((s, b) => s + b.durationMinutes, 0);
    const remainingWork = workToday - workItemMinutes;
    
    // Add a single "Work" block for remaining unaccounted time
    if (remainingWork > 0) {
      const lastWorkItem = workItemBlocks.sort((a, b) => b.endMinutes - a.endMinutes)[0];
      const workStart = lastWorkItem ? lastWorkItem.endMinutes : breakEnd;
      pushBlock({
        id: blockId(date, 'work-remaining'),
        bucketId: WORK_ID,
        title: work.name,
        kind: 'work',
        startMinutes: workStart,
        durationMinutes: remainingWork,
        status: 'pending',
        color: workColor,
        flexible: true,
      });
    }
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
      .filter((b) => !b.archived && b.kind === 'weighted')
      .sort((a, b) => a.weight - b.weight);
    
    let fillGaps = allGaps.map((g) => ({ ...g }));
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
            kind: 'weighted',
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
