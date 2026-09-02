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
    if (b.kind === 'transition') return false;
    // Appointments used to be slot-less and shown in every section. They are
    // bucket items now, so they belong to exactly one, like anything else.
    if (b.title === 'Break' && b.slot === section) return true;
    // A long appointment stays on the list through every section it spans,
    // rather than vanishing the moment the next stretch opens.
    if (b.slots?.length) return b.slots.includes(section);
    return b.kind !== 'personal' && b.slot === section;
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
