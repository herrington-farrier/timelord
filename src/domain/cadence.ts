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

/** Where the cadence lands before the bucket has any say. */
function naturalHit(cadence: Cadence, dateKey: string): boolean {
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
  const origin = cadence.startDate || phaseOrigin(cadence.startWeekday || 'Mon');
  const diff = daysBetween(origin, dateKey);
  return ((diff % cadence.n) + cadence.n) % cadence.n === 0;
}

/**
 * A cadence counted in days lands wherever the arithmetic puts it, which is
 * often a day its bucket does not run — every 60 days walks through the week.
 * Those occurrences move forward to the bucket's next open day rather than
 * being lost, so "every 60 days" keeps its rhythm without ever asking for a day
 * the bucket is closed.
 *
 * Cadences that already name their days do not move. Another daily or weekly
 * occurrence is never more than a few days off, so pushing one would only stack
 * duplicates onto the same open day.
 */
function movesToOpenDay(cadence: Cadence): boolean {
  return cadence.kind === 'everyNDays' || cadence.kind === 'monthly';
}

export function nextOpenDay(dateKey: string, openDays: Weekday[]): string {
  let key = dateKey;
  for (let i = 0; i < 7; i += 1) {
    if (openDays.includes(weekdayFromKey(key))) return key;
    key = addDaysKey(key, 1);
  }
  return dateKey;
}

/**
 * Bucket rules are king: nothing runs on a day its bucket is closed. `openDays`
 * empty or absent means unrestricted, which is what every caller without a
 * bucket to hand passes.
 */
export function cadenceHitsDate(cadence: Cadence, dateKey: string, openDays?: Weekday[]): boolean {
  const open = openDays && openDays.length ? openDays : null;
  if (!open) return naturalHit(cadence, dateKey);
  if (!open.includes(weekdayFromKey(dateKey))) return false;
  if (!movesToOpenDay(cadence)) return naturalHit(cadence, dateKey);
  // Today is a hit if any occurrence in the past week moves onto it. A week is
  // the whole search: a closed day is never more than six days from an open one.
  for (let back = 0; back < 7; back += 1) {
    const landed = addDaysKey(dateKey, -back);
    if (naturalHit(cadence, landed) && nextOpenDay(landed, open) === dateKey) return true;
  }
  return false;
}
