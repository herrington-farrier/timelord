import { formatDuration } from './duration';
import { nextSlot } from './sections';
import type { PackedBlock, Slot } from './types';

export function formatCountdown(minutes: number): string {
  return formatDuration(Math.floor(Math.max(0, Number(minutes) || 0)));
}

export function slotLabel(section: Slot): string {
  if (section === 'morning') return 'Morning';
  if (section === 'midday') return 'Midday';
  return 'Evening';
}

export function nextSectionAction(section: Slot): { label: string; kind: 'next' | 'end' } {
  if (section === 'evening') return { label: 'Hearth', kind: 'end' };
  return { label: 'Start Next Chapter', kind: 'next' };
}

/**
 * Total packed work waiting in the next stretch. Appointments now carry a slot
 * and count toward it; Break is personal, so it does not.
 */
export function nextSectionMinutes(blocks: PackedBlock[], section: Slot): number {
  const next = nextSlot(section);
  if (!next) return 0;
  return blocks
    .filter((b) => b.slot === next && b.kind !== 'transition' && b.kind !== 'personal')
    .reduce((sum, b) => sum + (Number(b.durationMinutes) || 0), 0);
}

/**
 * Minutes this day is committed to appointments. A cancelled one is not booked
 * any more, so it does not count.
 */
export function bookedMinutes(blocks: PackedBlock[]): number {
  return blocks
    .filter((b) => b.kind === 'appointment' && b.status !== 'skipped')
    .reduce((sum, b) => sum + (Number(b.durationMinutes) || 0), 0);
}

export function todaySectionItems(blocks: PackedBlock[], section: Slot): PackedBlock[] {
  return blocks.filter((b) => {
    // A switch marker belongs to the section it separates, and to nothing else.
    if (b.kind === 'transition') return b.slot === section;
    // Appointments used to be slot-less and shown in every section. They are
    // bucket items now, so they belong to exactly one, like anything else.
    if (b.title === 'Break' && b.slot === section) return true;
    // Personal routines are invisible markers until Personal counts as day
    // time, at which point they carry minutes and are yours to complete.
    if (b.kind === 'personal') return b.durationMinutes > 0 && b.slot === section;
    // A long appointment stays on the list through every section it spans,
    // rather than vanishing the moment the next stretch opens.
    if (b.slots?.length) return b.slots.includes(section);
    return b.slot === section;
  });
}

/**
 * What Quest still shows. Once an item is completed or skipped it is done with,
 * and leaving it on the list is just clutter — Stats is where it is recorded.
 * Break is a control rather than an item and always stays.
 */
export function openBlocks(blocks: PackedBlock[]): PackedBlock[] {
  return blocks.filter(
    (b) => b.title === 'Break' || (b.status !== 'complete' && b.status !== 'skipped')
  );
}

export function todaySectionDropped(dropped: PackedBlock[], section: Slot): PackedBlock[] {
  return dropped.filter((b) => !b.slot || b.slot === section);
}

export function todayEventItems(blocks: PackedBlock[]): PackedBlock[] {
  return blocks.filter((b) => b.kind !== 'personal' && b.kind !== 'transition');
}

export function isEventPacked(blocks: PackedBlock[]): boolean {
  const productive = blocks.filter((b) => b.kind !== 'personal' && b.kind !== 'transition');
  return productive.length > 0 && productive.every((b) => b.kind === 'event');
}

/**
 * A Personal routine — Morning or Evening — as opposed to Break, which is a
 * control you start and end. A routine is never completed or skipped: when
 * Personal counts as day time it simply takes its minutes out of the section,
 * the same way an appointment does.
 */
export function isRoutineBlock(block: { kind?: string; title?: string; id?: string }): boolean {
  return block.kind === 'personal' && !isBreakBlock(block);
}

/**
 * Reading order for a section: what is already committed first — appointments,
 * then the routines that Personal has taken out of the day — and then the work
 * you actually choose between. Both groups cost time you never get to spend, so
 * they belong above the list rather than scattered through it.
 *
 * Stable within each group, so the packer's own ordering survives.
 */
export function orderSectionItems(blocks: PackedBlock[]): PackedBlock[] {
  const rank = (b: PackedBlock) => (b.kind === 'appointment' ? 0 : isRoutineBlock(b) ? 1 : 2);
  return blocks
    .map((block, i) => ({ block, i }))
    .sort((a, b) => rank(a.block) - rank(b.block) || a.i - b.i)
    .map((row) => row.block);
}

export function isBreakBlock(block: { title?: string; id?: string }): boolean {
  return block.title === 'Break' || String(block.id || '').endsWith(':break');
}

export function signalSectionEnd(sound: boolean, vibrate: boolean): void {
  if (vibrate && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(400);
  }
  if (!sound || typeof window === 'undefined') return;
  const Ctor = window.AudioContext;
  if (!Ctor) return;
  const ctx = new Ctor();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = 880;
  gain.gain.value = 0.08;
  osc.start();
  osc.stop(ctx.currentTime + 0.25);
}
