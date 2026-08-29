import type { PackedBlock, Slot } from './types';

export function formatCountdown(minutes: number): string {
  const secs = Math.max(0, Math.floor(minutes * 60));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function appointmentElapsed(
  run: { startedAt?: string; elapsedMinutes?: number } | undefined,
  nowMs: number
): number {
  const stored = run?.elapsedMinutes || 0;
  if (!run?.startedAt) return stored;
  return stored + Math.max(0, (nowMs - Date.parse(run.startedAt)) / 60000);
}

export function todaySectionItems(blocks: PackedBlock[], section: Slot): PackedBlock[] {
  return blocks.filter((b) => {
    if (b.kind === 'transition') return false;
    if (b.kind === 'appointment') return true;
    if (b.title === 'Break' && b.slot === section) return true;
    return b.kind !== 'personal' && b.slot === section;
  });
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
