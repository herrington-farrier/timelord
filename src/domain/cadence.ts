import { WEEKDAYS, type Cadence, type Weekday } from './types';

export function parseDateKey(dateKey: string): { y: number; mo: number; d: number } {
  const [y, mo, d] = dateKey.split('-').map(Number);
  return { y, mo, d };
}

export function weekdayFromKey(dateKey: string): Weekday {
  const { y, mo, d } = parseDateKey(dateKey);
  const utcDay = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return WEEKDAYS[(utcDay + 6) % 7];
}

export function addDaysKey(dateKey: string, days: number): string {
  const { y, mo, d } = parseDateKey(dateKey);
  const dt = new Date(Date.UTC(y, mo - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function weekdayIndex(day: Weekday): number {
  return WEEKDAYS.indexOf(day);
}

/** A Monday — phase origin for every-N-days streams. */
const PHASE_EPOCH_MONDAY = '2000-01-03';

export function phaseOrigin(startWeekday: Weekday): string {
  return addDaysKey(PHASE_EPOCH_MONDAY, weekdayIndex(startWeekday));
}

export function daysBetween(a: string, b: string): number {
  const pa = parseDateKey(a);
  const pb = parseDateKey(b);
  const da = Date.UTC(pa.y, pa.mo - 1, pa.d);
  const db = Date.UTC(pb.y, pb.mo - 1, pb.d);
  return Math.round((db - da) / 86400000);
}

export function cadenceHitsDate(cadence: Cadence, dateKey: string): boolean {
  const wd = weekdayFromKey(dateKey);
  if (cadence.kind === 'daily') return true;
  if (cadence.kind === 'weekdays') return wd !== 'Sat' && wd !== 'Sun';
  if (cadence.kind === 'weekends') return wd === 'Sat' || wd === 'Sun';
  if (cadence.kind === 'weekly') return cadence.days.includes(wd);
  if (cadence.kind === 'monthly') {
    const { d } = parseDateKey(dateKey);
    return d === cadence.dayOfMonth;
  }
  if (cadence.startDate && dateKey < cadence.startDate) return false;
  // A start date is the anchor, not just a floor: "every 28 days from the 4th"
  // must land on the 4th, then 28 days later. Anchoring to the weekday lattice
  // instead collapses every stream sharing a weekday and an n onto the same
  // dates, whatever start dates they were given.
  const origin = cadence.startDate || phaseOrigin(cadence.startWeekday);
  const diff = daysBetween(origin, dateKey);
  return ((diff % cadence.n) + cadence.n) % cadence.n === 0;
}
