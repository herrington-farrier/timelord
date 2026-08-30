export function hoursToMinutes(hours: unknown, minutes: unknown): number {
  const h = Number(hours) || 0;
  const m = Number(minutes) || 0;
  const total = h * 60 + m;
  return total < 0 ? 0 : Math.round(total);
}

export function splitMinutes(total: number): { hours: number; minutes: number } {
  const mins = Math.max(0, Math.round(Number(total) || 0));
  return { hours: Math.floor(mins / 60), minutes: mins % 60 };
}

export function durationInputs(
  totalMinutes: number | undefined,
  whenEmpty: { hours: number; minutes: number } = { hours: 1, minutes: 0 }
): { hours: number; minutes: number } {
  if (totalMinutes == null) return whenEmpty;
  return splitMinutes(totalMinutes);
}

export function formatDuration(totalMinutes: number): string {
  const mins = Math.round(Number(totalMinutes) || 0);
  if (mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function formatClock(dayMinutesFromMidnight: number): string {
  const mins = clockMinutes(dayMinutesFromMidnight);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? 'am' : 'pm';
  return `${hour12}:${String(m).padStart(2, '0')}${ampm}`;
}

export function formatTimeInput(dayMinutesFromMidnight: number): string {
  const mins = clockMinutes(dayMinutesFromMidnight);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseTimeInput(value: unknown): number {
  if (typeof value !== 'string' || !value.includes(':')) return 0;
  const [h, m] = value.split(':');
  return hoursToMinutes(h, m);
}

function clockMinutes(dayMinutesFromMidnight: number): number {
  return ((Math.round(dayMinutesFromMidnight) % (24 * 60)) + 24 * 60) % (24 * 60);
}
