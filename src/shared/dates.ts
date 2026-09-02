export function todayKey(timeZone = 'America/Chicago'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

export function weekStart(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() - wd);
  return dt.toISOString().slice(0, 10);
}

export function addDaysKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function nowMinutes(timeZone = 'America/Chicago'): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

const DAY_LABEL = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

/** `2026-09-01` -> `Tue Sep 1`. Parsed as UTC so the key never shifts a day. */
export function formatDayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  const parts = DAY_LABEL.formatToParts(new Date(Date.UTC(y, m - 1, d)));
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const label = `${get('weekday')} ${get('month')} ${get('day')}`.trim();
  return label || dateKey;
}

/** An ISO instant -> `7:00 AM` in the app's timezone. Falls back to the raw string. */
export function formatClock(at: string, timeZone = 'America/Chicago'): string {
  const ms = Date.parse(at);
  if (Number.isNaN(ms)) return at;
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));
}
