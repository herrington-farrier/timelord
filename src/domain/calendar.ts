import { SLOTS, type Bucket, type DaySettings, type PackedBlock, type Slot } from './types';
import { addDaysKey, weekStart } from '../shared/dates';
import { isEveningRoutine, isEventsBucket, isMorningRoutine } from './predicates';
import { bucketSlots, sectionCapacity, slotIndex } from './sections';
import { isBreakBlock, isEventPacked } from './today';

export type SlotRef = Pick<Bucket, 'id' | 'slot' | 'slots'> & { kind?: Bucket['kind'] };

export const BOARD_DAYS = 14;

export function keysFrom(start: string, count: number): string[] {
  const list: string[] = [];
  for (let i = 0; i < count; i += 1) list.push(addDaysKey(start, i));
  return list;
}

export function boardStartFor(today: string, offsetDays: number): string {
  return addDaysKey(weekStart(today), offsetDays);
}

export function isAccentChip(block: PackedBlock): boolean {
  return block.kind === 'appointment';
}

export function sectionFreeMinutes(
  settings: Pick<DaySettings, 'dayMinutes'>,
  blocks: PackedBlock[],
  buckets: SlotRef[] = [],
  extra: Partial<Record<Slot, number>> = {},
  used: Partial<Record<Slot, number>> = {}
): Record<Slot, number> {
  const caps = sectionCapacity(settings, extra, used);
  const packed: Record<Slot, number> = { morning: 0, midday: 0, evening: 0 };
  for (const block of blocks) {
    if (block.status === 'dropped' || block.kind === 'personal' || block.kind === 'transition') continue;
    const slot = chipSlot(block, buckets);
    if (!slot) continue;
    packed[slot] += Math.max(0, block.durationMinutes);
  }
  const free = { ...packed };
  for (const slot of SLOTS) free[slot] = Math.max(0, caps[slot] - packed[slot]);
  return free;
}

export function scheduledMinutes(blocks: PackedBlock[]): number {
  return blocks
    .filter((b) => b.status !== 'dropped' && b.kind !== 'personal' && b.kind !== 'transition')
    .reduce((sum, b) => sum + Math.max(0, b.durationMinutes), 0);
}

export function boardShowsDay(key: string, today: string): boolean {
  return key >= today;
}

export function listKeysFrom(boardKeys: string[], today: string): string[] {
  return boardKeys.filter((key) => boardShowsDay(key, today));
}

export function listShowsDay(
  placed: PackedBlock[],
  falling: PackedBlock[],
  eventDay: boolean
): boolean {
  return eventDay || placed.length > 0 || falling.length > 0;
}

export function placedChips(blocks: PackedBlock[]): PackedBlock[] {
  return blocks.filter((b) => {
    if (b.kind === 'transition') return false;
    // A routine carrying minutes is time the day has actually lost, so the board
    // has to show it or the cell reads as emptier than the day is. Carrying
    // none, it is an invisible marker and stays off.
    if (b.kind === 'personal') return isBreakBlock(b) || b.durationMinutes > 0;
    return true;
  });
}

function listRank(block: PackedBlock): number {
  if (isMorningRoutine(block)) return -2;
  if (isEveningRoutine(block)) return 2;
  return 0;
}

export function chipSlot(block: PackedBlock, buckets: SlotRef[] = []): Slot | undefined {
  if (block.slot) return block.slot;
  if (block.kind === 'appointment' || block.kind === 'event') return undefined;
  const bucket = buckets.find((b) => b.id === block.bucketId);
  if (!bucket || isEventsBucket(bucket as Bucket)) return undefined;
  return bucketSlots(bucket)[0];
}

function chipSlotIndex(block: PackedBlock, buckets: SlotRef[] = []): number {
  const slot = chipSlot(block, buckets);
  return slot ? slotIndex(slot) : slotIndex('evening');
}

export function listChips(blocks: PackedBlock[], buckets: SlotRef[] = []): PackedBlock[] {
  if (isEventPacked(blocks)) {
    return blocks.filter((b) => b.kind !== 'transition' && b.kind !== 'personal');
  }
  const rows = blocks.filter((b) => b.kind !== 'transition');
  const accent = rows.filter((b) => isAccentChip(b));
  const rest = rows
    .filter((b) => !isAccentChip(b))
    .sort(
      (a, b) =>
        chipSlotIndex(a, buckets) - chipSlotIndex(b, buckets) ||
        listRank(a) - listRank(b) ||
        a.startMinutes - b.startMinutes
    );
  return [...accent, ...rest];
}

export function orderChips(blocks: PackedBlock[], buckets: SlotRef[] = []): PackedBlock[] {
  const accent = blocks.filter((b) => isAccentChip(b));
  const rest = blocks
    .filter((b) => !isAccentChip(b))
    .sort((a, b) => chipSlotIndex(a, buckets) - chipSlotIndex(b, buckets) || a.startMinutes - b.startMinutes);
  return [...accent, ...rest];
}

export function fallingChips(dropped: PackedBlock[] | undefined): PackedBlock[] {
  return (dropped || []).filter((b) => b.status === 'dropped');
}

export function visibleChips(blocks: PackedBlock[], buckets: SlotRef[] = []): PackedBlock[] {
  return orderChips(blocks, buckets);
}
